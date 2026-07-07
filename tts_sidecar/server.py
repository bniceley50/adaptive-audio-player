from __future__ import annotations

import threading
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from .core import (
    KOKORO_MODEL_FILE,
    KOKORO_MODEL_SHA256,
    KOKORO_PACKAGE_VERSION,
    KOKORO_REPO_ID,
    SAMPLE_RATE,
    VOICE_MAP,
    ModelVerificationError,
    assert_loopback_host,
    ensure_verified_model_file,
    is_loopback_host,
    load_settings,
    next_render_path,
    read_cached_model_status,
    resolve_voice,
)

settings = load_settings()
assert_loopback_host(settings.host)


class RenderRequest(BaseModel):
    text: str = Field(min_length=1, max_length=20_000)
    voice: str = "marlowe"
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


class RenderResponse(BaseModel):
    ok: bool
    provider: str
    voice: str
    kokoroVoice: str
    sampleRate: int
    mimeType: str
    audioPath: str


class LocalKokoroEngine:
    def __init__(self) -> None:
        self._pipeline: Any | None = None
        self._lock = threading.Lock()

    def ensure_ready(self) -> Any:
        if self._pipeline is not None:
            return self._pipeline

        with self._lock:
            if self._pipeline is not None:
                return self._pipeline

            ensure_verified_model_file(settings)

            try:
                from kokoro import KPipeline
            except ImportError as error:
                raise ModelVerificationError(
                    "The local TTS service is missing kokoro. Install "
                    "tts_sidecar/requirements.txt before rendering."
                ) from error

            try:
                self._pipeline = KPipeline(
                    lang_code="a",
                    repo_id=KOKORO_REPO_ID,
                    device=settings.device,
                )
            except RuntimeError as error:
                raise ModelVerificationError(
                    "Kokoro could not start on the selected device. Check the "
                    "PyTorch/CUDA installation or set "
                    "ADAPTIVE_AUDIO_PLAYER_TTS_DEVICE=cpu."
                ) from error

            return self._pipeline

    def render_to_file(self, request: RenderRequest) -> tuple[str, Path]:
        trimmed_text = request.text.strip()
        if not trimmed_text:
            raise ValueError("Text is required for local narration.")

        kokoro_voice = resolve_voice(request.voice)
        pipeline = self.ensure_ready()

        try:
            import numpy as np
            import soundfile as sf
        except ImportError as error:
            raise ModelVerificationError(
                "The local TTS service is missing numpy or soundfile. Install "
                "tts_sidecar/requirements.txt before rendering."
            ) from error

        audio_chunks = []
        try:
            for result in pipeline(trimmed_text, voice=kokoro_voice, speed=request.speed):
                audio = getattr(result, "audio", None)
                if audio is None:
                    continue

                if hasattr(audio, "detach"):
                    audio = audio.detach().cpu().numpy()

                audio_chunks.append(np.asarray(audio, dtype=np.float32))
        except Exception as error:
            raise ModelVerificationError(
                "Kokoro failed while rendering this text. Check that the local "
                "model cache and selected voice are valid."
            ) from error

        if not audio_chunks:
            raise ModelVerificationError(
                "Kokoro did not return audio for this text. Try a shorter passage."
            )

        combined_audio = np.concatenate(audio_chunks)
        output_path = next_render_path(settings)
        sf.write(str(output_path), combined_audio, SAMPLE_RATE, format="WAV")
        return kokoro_voice, output_path


engine = LocalKokoroEngine()
app = FastAPI(title="Adaptive Audio Player Local TTS", version="0.1.0")


@app.middleware("http")
async def require_loopback_client(request: Request, call_next):
    client_host = request.client.host if request.client else None
    if client_host and not is_loopback_host(client_host):
        return JSONResponse(
            status_code=403,
            content={
                "detail": "The local TTS service only accepts localhost clients."
            },
        )

    return await call_next(request)


@app.get("/health")
def health() -> dict[str, object]:
    return {
        "ok": True,
        "service": "adaptive-audio-player-local-tts",
        "engine": "kokoro",
        "kokoroPackageVersion": KOKORO_PACKAGE_VERSION,
        "voices": VOICE_MAP,
        "bind": {
            "host": settings.host,
            "port": settings.port,
        },
        "model": {
            "repo": KOKORO_REPO_ID,
            "file": KOKORO_MODEL_FILE,
            "expectedSha256": KOKORO_MODEL_SHA256,
            "cache": read_cached_model_status(settings),
        },
    }


@app.post("/render", response_model=RenderResponse)
def render(request: RenderRequest) -> RenderResponse:
    try:
        kokoro_voice, output_path = engine.render_to_file(request)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except ModelVerificationError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error

    return RenderResponse(
        ok=True,
        provider="kokoro-local",
        voice=request.voice,
        kokoroVoice=kokoro_voice,
        sampleRate=SAMPLE_RATE,
        mimeType="audio/wav",
        audioPath=str(output_path),
    )


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

