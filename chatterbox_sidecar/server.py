from __future__ import annotations

import threading
from contextlib import asynccontextmanager
from io import BytesIO
from typing import Any, Literal

from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel, ConfigDict, Field

from .core import (
    MINIMUM_VRAM_BYTES,
    SAMPLE_RATE,
    SUPPORTED_VOICE_ID,
    ChatterboxRuntimeError,
    ChatterboxSettings,
    is_loopback_host,
    load_settings,
    request_has_launch_secret,
    verify_chatterbox_runtime,
)


TTS_SECRET_HEADER = "x-adaptive-audio-player-tts-secret"
MAX_TTS_REQUEST_BYTES = 100_000
GENERATION_SEED = 20_260_728


class RenderRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text: str = Field(min_length=1, max_length=1_200)
    voice: Literal["chatterbox-default"] = SUPPORTED_VOICE_ID
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


class LocalChatterboxEngine:
    def __init__(self, settings: ChatterboxSettings) -> None:
        self._settings = settings
        self._model: Any | None = None
        self._lock = threading.Lock()

    def ensure_ready(self) -> Any:
        if self._model is not None:
            return self._model
        with self._lock:
            if self._model is not None:
                return self._model

            verify_chatterbox_runtime(self._settings)
            try:
                import torch
                from chatterbox.tts import ChatterboxTTS
            except ImportError as error:
                raise ChatterboxRuntimeError(
                    "High Quality setup is missing a pinned runtime package."
                ) from error
            if not torch.cuda.is_available():
                raise ChatterboxRuntimeError(
                    "High Quality requires a supported NVIDIA GPU and CUDA runtime."
                )
            if torch.cuda.get_device_properties(0).total_memory < MINIMUM_VRAM_BYTES:
                raise ChatterboxRuntimeError(
                    "High Quality requires at least 8 GB of NVIDIA GPU memory."
                )
            try:
                self._model = ChatterboxTTS.from_local(
                    self._settings.model_root, "cuda"
                )
            except Exception as error:
                raise ChatterboxRuntimeError(
                    "High Quality could not load its verified local model."
                ) from error
            return self._model

    def render_to_bytes(self, request: RenderRequest) -> bytes:
        text = " ".join(request.text.split()).strip()
        if not text:
            raise ValueError("Text is required for High Quality narration.")
        if request.voice.strip().lower() != SUPPORTED_VOICE_ID:
            raise ValueError("Choose the built-in High Quality narrator.")

        model = self.ensure_ready()
        with self._lock:
            try:
                import numpy as np
                import soundfile as sf
                import torch
            except ImportError as error:
                raise ChatterboxRuntimeError(
                    "High Quality setup is missing a pinned audio runtime package."
                ) from error

            try:
                torch.manual_seed(GENERATION_SEED)
                torch.cuda.manual_seed_all(GENERATION_SEED)
                audio = model.generate(
                    text,
                    audio_prompt_path=None,
                    exaggeration=0.5,
                    cfg_weight=0.5,
                    temperature=0.8,
                )
                encoded = audio.squeeze().detach().cpu().numpy().astype(np.float32)
                output = BytesIO()
                sf.write(output, encoded, SAMPLE_RATE, format="WAV", subtype="PCM_16")
                return output.getvalue()
            except torch.cuda.OutOfMemoryError as error:
                raise ChatterboxRuntimeError(
                    "High Quality ran out of GPU memory. Close other GPU-heavy apps or use Fast / Compatible."
                ) from error
            except ChatterboxRuntimeError:
                raise
            except Exception as error:
                raise ChatterboxRuntimeError(
                    "High Quality could not render this passage. Try a shorter passage or use Fast / Compatible."
                ) from error


def create_app(
    settings: ChatterboxSettings | None = None,
    engine: LocalChatterboxEngine | None = None,
) -> FastAPI:
    resolved_settings = settings or load_settings()
    resolved_engine = engine or LocalChatterboxEngine(resolved_settings)

    @asynccontextmanager
    async def lifespan(_: FastAPI):
        resolved_engine.ensure_ready()
        yield

    app = FastAPI(
        title="Adaptive Audio Player High Quality TTS",
        version="0.1.0",
        lifespan=lifespan,
    )

    @app.middleware("http")
    async def require_local_client(request: Request, call_next):
        client_host = request.client.host if request.client else None
        if client_host and not is_loopback_host(client_host):
            return JSONResponse(
                status_code=403,
                content={
                    "detail": "The High Quality TTS service only accepts localhost clients."
                },
            )
        if not request_has_launch_secret(
            request.headers.getlist(TTS_SECRET_HEADER),
            resolved_settings.launch_secret,
        ):
            return JSONResponse(
                status_code=403,
                content={"detail": "High Quality TTS access denied."},
            )
        if request.headers.get("transfer-encoding") is not None:
            return JSONResponse(
                status_code=413,
                content={"detail": "High Quality TTS request is too large."},
            )
        content_encoding = request.headers.get("content-encoding")
        if content_encoding and content_encoding.lower() != "identity":
            return JSONResponse(
                status_code=415,
                content={"detail": "Compressed TTS requests are not accepted."},
            )
        declared_length = request.headers.get("content-length")
        if declared_length is not None:
            if not declared_length.isascii() or not declared_length.isdecimal():
                return JSONResponse(
                    status_code=400,
                    content={"detail": "Invalid High Quality TTS request."},
                )
            if int(declared_length) > MAX_TTS_REQUEST_BYTES:
                return JSONResponse(
                    status_code=413,
                    content={"detail": "High Quality TTS request is too large."},
                )
        return await call_next(request)

    @app.get("/health")
    def health() -> dict[str, object]:
        return {
            "component": "adaptive-audio-player-chatterbox-tts",
            "protocolVersion": 1,
            "ready": True,
        }

    @app.post(
        "/render",
        response_class=Response,
        responses={200: {"content": {"audio/wav": {}}}},
    )
    def render(request: RenderRequest) -> Response:
        try:
            audio_bytes = resolved_engine.render_to_bytes(request)
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except ChatterboxRuntimeError as error:
            raise HTTPException(status_code=503, detail=str(error)) from error
        return Response(content=audio_bytes, media_type="audio/wav")

    return app


settings = load_settings()
engine = LocalChatterboxEngine(settings)
app = create_app(settings, engine)


def main() -> None:
    import uvicorn

    uvicorn.run(
        "chatterbox_sidecar.server:app",
        host=settings.host,
        port=settings.port,
        reload=False,
    )


if __name__ == "__main__":
    main()
