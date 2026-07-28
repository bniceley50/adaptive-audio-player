from __future__ import annotations

import os
import tempfile
import unittest
from pathlib import Path

from fastapi.testclient import TestClient


_TEST_RUNTIME_ROOT = Path(tempfile.gettempdir()) / "aap-chatterbox-sidecar-tests"
os.environ.setdefault(
    "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_ROOT", str(_TEST_RUNTIME_ROOT)
)
os.environ.setdefault(
    "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_MODEL_ROOT",
    str(_TEST_RUNTIME_ROOT / "model"),
)
os.environ.setdefault("ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_SECRET", "a" * 64)

from chatterbox_sidecar import server  # noqa: E402
from chatterbox_sidecar.core import ChatterboxSettings  # noqa: E402


class FakeEngine:
    def __init__(self) -> None:
        self.ready_calls = 0
        self.requests: list[server.RenderRequest] = []

    def ensure_ready(self) -> object:
        self.ready_calls += 1
        return self

    def render_to_bytes(self, request: server.RenderRequest) -> bytes:
        self.requests.append(request)
        return b"RIFF" + b"\x00" * 40


class ChatterboxServerTests(unittest.TestCase):
    def setUp(self) -> None:
        self.secret = "a" * 64
        self.settings = ChatterboxSettings(
            host="127.0.0.1",
            port=18766,
            runtime_root=_TEST_RUNTIME_ROOT,
            model_root=_TEST_RUNTIME_ROOT / "model",
            launch_secret=self.secret,
        )
        self.engine = FakeEngine()
        self.app = server.create_app(self.settings, self.engine)

    def test_health_requires_one_secret_and_exposes_only_readiness(self) -> None:
        with TestClient(
            self.app, client=("127.0.0.1", 50_000)
        ) as client:
            rejected_headers = [
                {},
                {server.TTS_SECRET_HEADER: "b" * 64},
                [
                    (server.TTS_SECRET_HEADER, self.secret),
                    (server.TTS_SECRET_HEADER, self.secret),
                ],
            ]
            for headers in rejected_headers:
                with self.subTest(headers=headers):
                    response = client.get("/health", headers=headers)
                    self.assertEqual(response.status_code, 403)
                    self.assertNotIn(self.secret, response.text)

            response = client.get(
                "/health", headers={server.TTS_SECRET_HEADER: self.secret}
            )

        self.assertEqual(
            response.json(),
            {
                "component": "adaptive-audio-player-chatterbox-tts",
                "protocolVersion": 1,
                "ready": True,
            },
        )
        self.assertEqual(self.engine.ready_calls, 1)

    def test_render_uses_only_the_built_in_narrator(self) -> None:
        headers = {server.TTS_SECRET_HEADER: self.secret}
        with TestClient(
            self.app, client=("127.0.0.1", 50_000)
        ) as client:
            response = client.post(
                "/render",
                headers=headers,
                json={
                    "text": "A short local narration sample.",
                    "voice": "chatterbox-default",
                },
            )
            clone_attempt = client.post(
                "/render",
                headers=headers,
                json={
                    "text": "Do not clone this voice.",
                    "voice": "chatterbox-default",
                    "audio_prompt_path": "C:/reference.wav",
                },
            )
            unknown_voice = client.post(
                "/render",
                headers=headers,
                json={"text": "Do not clone this voice.", "voice": "uploaded"},
            )

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "audio/wav")
        self.assertEqual(len(self.engine.requests), 1)
        self.assertEqual(self.engine.requests[0].voice, "chatterbox-default")
        self.assertEqual(clone_attempt.status_code, 422)
        self.assertEqual(unknown_voice.status_code, 422)

    def test_boundary_rejects_remote_compressed_and_oversized_requests(self) -> None:
        headers = {server.TTS_SECRET_HEADER: self.secret}
        with TestClient(
            self.app, client=("192.0.2.10", 50_000)
        ) as remote_client:
            self.assertEqual(
                remote_client.get("/health", headers=headers).status_code, 403
            )

        with TestClient(
            self.app, client=("127.0.0.1", 50_000)
        ) as client:
            self.assertEqual(
                client.post(
                    "/render",
                    headers={**headers, "content-encoding": "gzip"},
                    content=b"{}",
                ).status_code,
                415,
            )
            self.assertEqual(
                client.post(
                    "/render",
                    headers={
                        **headers,
                        "content-length": str(server.MAX_TTS_REQUEST_BYTES + 1),
                    },
                    content=b"{}",
                ).status_code,
                413,
            )


if __name__ == "__main__":
    unittest.main()
