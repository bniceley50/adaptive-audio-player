from __future__ import annotations

import hmac
import re
import threading
from io import BytesIO
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, Field

from .core import (
    KOKORO_MODEL_FILE,
    KOKORO_REPO_ID,
    SAMPLE_RATE,
    VOICE_MAP,
    ModelVerificationError,
    assert_loopback_host,
    is_loopback_host,
    load_settings,
    read_model_resource_status,
    resolve_voice,
    verify_kokoro_resources,
)

settings = load_settings()
assert_loopback_host(settings.host)

INTERNAL_CHUNK_PAUSE_SECONDS = 0.12
PARAGRAPH_PAUSE_SECONDS = 0.32


def split_narration_paragraphs(text: str) -> list[str]:
    normalized = text.replace("\r\n", "\n").replace("\r", "\n")
    paragraphs = []
    for block in re.split(r"\n[ \t]*\n+", normalized):
        lines = [
            re.sub(r"[ \t]+", " ", line.strip())
            for line in block.split("\n")
            if line.strip()
        ]
        paragraph = " ".join(lines).strip()
        if paragraph:
            paragraphs.append(paragraph)

    return paragraphs


class RenderRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)
    voice: str = "marlowe"
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


class LocalKokoroEngine:
    def __init__(self) -> None:
        self._pipeline: Any | None = None
        self._voice_paths: dict[str, str] | None = None
        self._lock = threading.Lock()

    def ensure_ready(self) -> Any:
        if self._pipeline is not None:
            return self._pipeline

        with self._lock:
            if self._pipeline is not None:
                return self._pipeline

            resources = verify_kokoro_resources(settings.model_root)

            try:
                from kokoro import KModel, KPipeline
            except ImportError as error:
                raise ModelVerificationError(
                    "The local TTS service is missing kokoro. Install "
                    "tts_sidecar/requirements.txt before rendering."
                ) from error

            try:
                selected_device = settings.device or "cpu"
                model = KModel(
                    repo_id=KOKORO_REPO_ID,
                    config=str(resources["config.json"]),
                    model=str(resources[KOKORO_MODEL_FILE]),
                ).to(selected_device).eval()
                voice_paths = {
                    voice: str(resources[f"voices/{voice}.pt"])
                    for voice in VOICE_MAP.values()
                }
                self._pipeline = KPipeline(
                    lang_code="a",
                    repo_id=KOKORO_REPO_ID,
                    model=model,
                    device=selected_device,
                )
                self._voice_paths = voice_paths
            except RuntimeError as error:
                raise ModelVerificationError(
                    "Kokoro could not start on the selected device. Check the "
                    "PyTorch/CUDA installation or set "
                    "ADAPTIVE_AUDIO_PLAYER_TTS_DEVICE=cpu."
                ) from error

            return self._pipeline

    def render_to_bytes(self, request: RenderRequest) -> tuple[str, bytes]:
        trimmed_text = request.text.strip()
        if not trimmed_text:
            raise ValueError("Text is required for local narration.")

        kokoro_voice = resolve_voice(request.voice)
        pipeline = self.ensure_ready()
        if self._voice_paths is None:
            raise ModelVerificationError(
                "Kokoro voice resources were not initialized. Restart the local service."
            )
        voice_path = self._voice_paths[kokoro_voice]

        try:
            import numpy as np
            import soundfile as sf
        except ImportError as error:
            raise ModelVerificationError(
                "The local TTS service is missing numpy or soundfile. Install "
                "tts_sidecar/requirements.txt before rendering."
            ) from error

        rendered_paragraphs = []
        try:
            for paragraph in split_narration_paragraphs(trimmed_text):
                paragraph_chunks = []
                for result in pipeline(
                    paragraph,
                    voice=voice_path,
                    speed=request.speed,
                    split_pattern=None,
                ):
                    audio = getattr(result, "audio", None)
                    if audio is None:
                        continue

                    if hasattr(audio, "detach"):
                        audio = audio.detach().cpu().numpy()

                    paragraph_chunks.append(
                        np.asarray(audio, dtype=np.float32).reshape(-1)
                    )

                if paragraph_chunks:
                    rendered_paragraphs.append(paragraph_chunks)
        except Exception as error:
            raise ModelVerificationError(
                "Kokoro failed while rendering this text. Check that the local "
                "model resources and selected voice are valid."
            ) from error

        if not rendered_paragraphs:
            raise ModelVerificationError(
                "Kokoro did not return audio for this text. Try a shorter passage."
            )

        try:
            internal_pause = np.zeros(
                round(SAMPLE_RATE * INTERNAL_CHUNK_PAUSE_SECONDS),
                dtype=np.float32,
            )
            paragraph_pause = np.zeros(
                round(SAMPLE_RATE * PARAGRAPH_PAUSE_SECONDS),
                dtype=np.float32,
            )
            audio_chunks = []
            for paragraph_index, paragraph_chunks in enumerate(rendered_paragraphs):
                for chunk_index, audio_chunk in enumerate(paragraph_chunks):
                    audio_chunks.append(audio_chunk)
                    if chunk_index < len(paragraph_chunks) - 1:
                        audio_chunks.append(internal_pause)

                if paragraph_index < len(rendered_paragraphs) - 1:
                    audio_chunks.append(paragraph_pause)

            combined_audio = np.concatenate(audio_chunks)
            output = BytesIO()
            sf.write(output, combined_audio, SAMPLE_RATE, format="WAV")
            audio_bytes = output.getvalue()
        except Exception as error:
            raise ModelVerificationError(
                "Kokoro returned audio that could not be encoded as WAV."
            ) from error

        return kokoro_voice, audio_bytes


engine = LocalKokoroEngine()
app = FastAPI(title="Adaptive Audio Player Local TTS", version="0.1.0")
TTS_SECRET_HEADER = "x-adaptive-audio-player-tts-secret"
MAX_TTS_REQUEST_BYTES = 100_000


def _request_has_launch_secret(request: Request) -> bool:
    if settings.launch_secret is None:
        return True

    supplied = request.headers.getlist(TTS_SECRET_HEADER)
    return len(supplied) == 1 and hmac.compare_digest(
        supplied[0], settings.launch_secret
    )


@app.middleware("http")
async def require_local_client(request: Request, call_next):
    client_host = request.client.host if request.client else None
    if client_host and not is_loopback_host(client_host):
        return JSONResponse(
            status_code=403,
            content={
                "detail": "The local TTS service only accepts localhost clients."
            },
        )

    if not _request_has_launch_secret(request):
        return JSONResponse(
            status_code=403,
            content={"detail": "Local TTS access denied."},
        )

    if request.headers.get("transfer-encoding") is not None:
        return JSONResponse(
            status_code=413,
            content={"detail": "Local TTS request is too large."},
        )

    content_encoding = request.headers.get("content-encoding")
    if content_encoding and content_encoding.lower() != "identity":
        return JSONResponse(
            status_code=415,
            content={"detail": "Compressed local TTS requests are not accepted."},
        )

    declared_length = request.headers.get("content-length")
    if declared_length is not None:
        if not declared_length.isascii() or not declared_length.isdecimal():
            return JSONResponse(
                status_code=400,
                content={"detail": "Invalid local TTS request."},
            )
        if int(declared_length) > MAX_TTS_REQUEST_BYTES:
            return JSONResponse(
                status_code=413,
                content={"detail": "Local TTS request is too large."},
            )

    return await call_next(request)


@app.get("/health")
def health() -> dict[str, object]:
    model_status = read_model_resource_status(settings)
    return {
        "component": "adaptive-audio-player-local-tts",
        "protocolVersion": 1,
        "ready": model_status["verified"] is True,
    }


@app.post(
    "/render",
    response_class=Response,
    responses={200: {"content": {"audio/wav": {}}}},
)
def render(request: RenderRequest) -> Response:
    try:
        _, audio_bytes = engine.render_to_bytes(request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except ModelVerificationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    return Response(content=audio_bytes, media_type="audio/wav")


def main() -> None:
    import uvicorn

    uvicorn.run(
        "tts_sidecar.server:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    main()
