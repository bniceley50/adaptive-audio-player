from __future__ import annotations

import os
import sys
import tempfile
import unittest
from dataclasses import replace
from io import BytesIO
from pathlib import Path
from types import ModuleType, SimpleNamespace
from unittest.mock import patch

import numpy as np
from fastapi import HTTPException
from fastapi.testclient import TestClient
from pydantic import ValidationError

from tts_sidecar import server
from tts_sidecar.core import ModelVerificationError, SidecarSettings, load_settings


class ServerTests(unittest.TestCase):
    def test_frozen_settings_require_a_valid_256_bit_launch_secret(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_root = Path(temp_dir)
            environment = {
                "ADAPTIVE_AUDIO_PLAYER_TTS_DATA_ROOT": str(data_root),
                "ADAPTIVE_AUDIO_PLAYER_TTS_MODEL_ROOT": str(data_root / "models"),
                "ADAPTIVE_AUDIO_PLAYER_TTS_RENDER_ROOT": str(data_root / "renders"),
            }
            with (
                patch.dict(os.environ, environment, clear=False),
                patch.object(sys, "frozen", True, create=True),
            ):
                with self.assertRaisesRegex(ValueError, "must be set"):
                    load_settings()

                for invalid_secret in ("short", "g" * 64):
                    with self.subTest(secret=invalid_secret):
                        with patch.dict(
                            os.environ,
                            {"ADAPTIVE_AUDIO_PLAYER_TTS_SECRET": invalid_secret},
                        ):
                            with self.assertRaisesRegex(ValueError, "256 bits"):
                                load_settings()

                with patch.dict(
                    os.environ,
                    {"ADAPTIVE_AUDIO_PLAYER_TTS_SECRET": "a" * 64},
                ):
                    self.assertEqual(load_settings().launch_secret, "a" * 64)

    def test_packaged_sidecar_requires_one_exact_launch_secret(self) -> None:
        launch_secret = "a" * 64
        test_settings = replace(server.settings, launch_secret=launch_secret)
        with patch.object(server, "settings", test_settings):
            client = TestClient(server.app, client=("127.0.0.1", 50_000))
            rejected_headers = [
                {},
                {server.TTS_SECRET_HEADER: "b" * 64},
                [
                    (server.TTS_SECRET_HEADER, launch_secret),
                    (server.TTS_SECRET_HEADER, launch_secret),
                ],
            ]
            for headers in rejected_headers:
                with self.subTest(headers=headers):
                    response = client.get("/health", headers=headers)
                    self.assertEqual(response.status_code, 403)
                    self.assertEqual(
                        response.json(),
                        {"detail": "Local TTS access denied."},
                    )
                    self.assertNotIn(launch_secret, response.text)

            response = client.get(
                "/health",
                headers={server.TTS_SECRET_HEADER: launch_secret},
            )
            self.assertEqual(response.status_code, 200)
            self.assertNotIn(launch_secret, response.text)

    def test_sidecar_boundary_rejects_unbounded_or_oversized_requests(self) -> None:
        launch_secret = "a" * 64
        test_settings = replace(server.settings, launch_secret=launch_secret)
        base_headers = {server.TTS_SECRET_HEADER: launch_secret}
        with patch.object(server, "settings", test_settings):
            client = TestClient(server.app, client=("127.0.0.1", 50_000))
            response = client.post(
                "/render",
                headers={**base_headers, "transfer-encoding": "chunked"},
                content=b"{}",
            )
            self.assertEqual(response.status_code, 413)

            response = client.post(
                "/render",
                headers={
                    **base_headers,
                    "content-length": str(server.MAX_TTS_REQUEST_BYTES + 1),
                },
                content=b"{}",
            )
            self.assertEqual(response.status_code, 413)

            response = client.post(
                "/render",
                headers={**base_headers, "content-encoding": "gzip"},
                content=b"{}",
            )
            self.assertEqual(response.status_code, 415)

    def test_health_exposes_only_the_versioned_readiness_contract(self) -> None:
        with patch.object(
            server,
            "read_model_resource_status",
            return_value={"present": True, "verified": True, "resourceCount": 5},
        ):
            payload = server.health()

        self.assertEqual(
            payload,
            {
                "component": "adaptive-audio-player-local-tts",
                "protocolVersion": 1,
                "ready": True,
            },
        )

        with patch.object(
            server,
            "read_model_resource_status",
            return_value={"present": False, "verified": False, "resourceCount": 5},
        ):
            self.assertEqual(server.health()["ready"], False)

    def test_engine_uses_only_verified_direct_resource_paths(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            resource_root = Path(temp_dir)
            resources = {
                "config.json": resource_root / "config.json",
                server.KOKORO_MODEL_FILE: resource_root / server.KOKORO_MODEL_FILE,
                **{
                    f"voices/{voice}.pt": resource_root / "voices" / f"{voice}.pt"
                    for voice in server.VOICE_MAP.values()
                },
            }
            calls: dict[str, object] = {}

            class FakeModel:
                def __init__(self, **kwargs: object) -> None:
                    calls["model"] = kwargs

                def to(self, device: str) -> FakeModel:
                    calls["device"] = device
                    return self

                def eval(self) -> FakeModel:
                    return self

            class FakePipeline:
                def __init__(self, **kwargs: object) -> None:
                    calls["pipeline"] = kwargs

            fake_kokoro = ModuleType("kokoro")
            fake_kokoro.KModel = FakeModel
            fake_kokoro.KPipeline = FakePipeline
            test_settings = SidecarSettings(
                host="127.0.0.1",
                port=8765,
                data_root=resource_root / "data",
                model_root=resource_root,
                render_root=resource_root / "renders",
                device=None,
            )

            with (
                patch.object(server, "settings", test_settings),
                patch.object(
                    server,
                    "verify_kokoro_resources",
                    return_value=resources,
                ),
                patch.dict(sys.modules, {"kokoro": fake_kokoro}),
            ):
                engine = server.LocalKokoroEngine()
                pipeline = engine.ensure_ready()

            self.assertIsInstance(pipeline, FakePipeline)
            self.assertEqual(calls["device"], "cpu")
            self.assertEqual(
                calls["model"],
                {
                    "repo_id": server.KOKORO_REPO_ID,
                    "config": str(resources["config.json"]),
                    "model": str(resources[server.KOKORO_MODEL_FILE]),
                },
            )
            self.assertEqual(
                calls["pipeline"]["model"].__class__,
                FakeModel,
            )
            self.assertEqual(
                engine._voice_paths,
                {
                    voice: str(resources[f"voices/{voice}.pt"])
                    for voice in server.VOICE_MAP.values()
                },
            )

    def test_render_request_rejects_empty_and_oversized_text(self) -> None:
        for text in ("", "a" * 20_001):
            with self.subTest(length=len(text)):
                with self.assertRaises(ValidationError):
                    server.RenderRequest(text=text)

    def test_render_rejects_whitespace_only_text(self) -> None:
        with patch.object(server, "engine", server.LocalKokoroEngine()):
            with self.assertRaises(HTTPException) as raised:
                server.render(server.RenderRequest(text="   "))

        self.assertEqual(raised.exception.status_code, 400)
        self.assertEqual(
            raised.exception.detail,
            "Text is required for local narration.",
        )

    def test_render_rejects_an_invalid_voice(self) -> None:
        with patch.object(server, "engine", server.LocalKokoroEngine()):
            with self.assertRaises(HTTPException) as raised:
                server.render(
                    server.RenderRequest(text="Read this.", voice="uploaded-clone")
                )

        self.assertEqual(raised.exception.status_code, 400)
        self.assertIn("Unsupported voice", raised.exception.detail)

    def test_render_reports_engine_errors_without_audio(self) -> None:
        with patch.object(
            server.engine,
            "render_to_bytes",
            side_effect=ModelVerificationError("Kokoro could not render audio."),
        ):
            with self.assertRaises(HTTPException) as raised:
                server.render(server.RenderRequest(text="Read this."))

        self.assertEqual(raised.exception.status_code, 503)
        self.assertEqual(raised.exception.detail, "Kokoro could not render audio.")

    def test_narration_paragraphs_join_source_line_wraps(self) -> None:
        self.assertEqual(
            server.split_narration_paragraphs(
                "First line wraps\r\n"
                "across the page.\r\n\r\n"
                "Second\tparagraph."
            ),
            ["First line wraps across the page.", "Second paragraph."],
        )

    def test_engine_preserves_paragraphs_with_bounded_pauses(self) -> None:
        calls: list[tuple[str, object]] = []

        def fake_pipeline(
            text: str, *_args: object, **kwargs: object
        ) -> list[SimpleNamespace]:
            calls.append((text, kwargs.get("split_pattern")))
            if text.startswith("First"):
                return [
                    SimpleNamespace(audio=np.asarray([0.25, -0.25], dtype=np.float32)),
                    SimpleNamespace(audio=np.asarray([0.5, -0.5], dtype=np.float32)),
                ]
            return [
                SimpleNamespace(audio=np.asarray([0.75, -0.75], dtype=np.float32))
            ]

        local_engine = server.LocalKokoroEngine()
        local_engine._pipeline = fake_pipeline
        local_engine._voice_paths = {"af_heart": "af_heart.pt"}

        _, wav_bytes = local_engine.render_to_bytes(
            server.RenderRequest(
                text="First line wraps\nacross the page.\n\nSecond paragraph."
            )
        )

        import soundfile as sf

        audio, sample_rate = sf.read(BytesIO(wav_bytes), dtype="float32")
        internal_pause_samples = round(
            server.SAMPLE_RATE * server.INTERNAL_CHUNK_PAUSE_SECONDS
        )
        paragraph_pause_samples = round(
            server.SAMPLE_RATE * server.PARAGRAPH_PAUSE_SECONDS
        )
        first_chunk_end = 2
        second_chunk_start = first_chunk_end + internal_pause_samples
        second_chunk_end = second_chunk_start + 2
        third_chunk_start = second_chunk_end + paragraph_pause_samples

        self.assertEqual(
            calls,
            [
                ("First line wraps across the page.", None),
                ("Second paragraph.", None),
            ],
        )
        self.assertEqual(sample_rate, server.SAMPLE_RATE)
        self.assertEqual(len(audio), third_chunk_start + 2)
        self.assertTrue(np.all(audio[first_chunk_end:second_chunk_start] == 0))
        self.assertTrue(np.all(audio[second_chunk_end:third_chunk_start] == 0))
        self.assertNotEqual(audio[0], 0)
        self.assertNotEqual(audio[-1], 0)

    def test_render_returns_a_wav_body_with_the_exact_content_type(self) -> None:
        wav_bytes = b"RIFF\x24\x00\x00\x00WAVEfmt "
        with patch.object(
            server.engine,
            "render_to_bytes",
            return_value=("af_heart", wav_bytes),
        ):
            response = server.render(server.RenderRequest(text="Read this."))

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.headers["content-type"], "audio/wav")
        self.assertEqual(response.body, wav_bytes)
        self.assertNotIn(b"audioPath", response.body)

    def test_repeated_engine_renders_leave_no_sidecar_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            data_root = Path(temp_dir)
            render_root = data_root / "renders"
            test_settings = SidecarSettings(
                host="127.0.0.1",
                port=8765,
                data_root=data_root,
                model_root=data_root / "models",
                render_root=render_root,
                device=None,
            )
            voice_arguments: list[str] = []

            def fake_pipeline(*_args: object, **kwargs: object) -> list[SimpleNamespace]:
                voice_arguments.append(str(kwargs["voice"]))
                return [
                    SimpleNamespace(
                        audio=np.asarray([0.0, 0.1, -0.1, 0.0], dtype=np.float32)
                    )
                ]

            local_engine = server.LocalKokoroEngine()
            local_engine._pipeline = fake_pipeline
            local_engine._voice_paths = {
                "af_heart": str(test_settings.model_root / "voices" / "af_heart.pt")
            }

            with patch.object(server, "settings", test_settings):
                for _ in range(2):
                    kokoro_voice, wav_bytes = local_engine.render_to_bytes(
                        server.RenderRequest(text="Read this.")
                    )
                    self.assertEqual(kokoro_voice, "af_heart")
                    self.assertTrue(wav_bytes.startswith(b"RIFF"))
                    self.assertEqual(wav_bytes[8:12], b"WAVE")

            retained_paths = list(render_root.rglob("*")) if render_root.exists() else []
            self.assertEqual(retained_paths, [])
            self.assertEqual(
                voice_arguments,
                [str(test_settings.model_root / "voices" / "af_heart.pt")] * 2,
            )


if __name__ == "__main__":
    unittest.main()
