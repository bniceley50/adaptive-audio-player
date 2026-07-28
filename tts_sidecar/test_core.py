from __future__ import annotations

import hashlib
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from tts_sidecar.core import (
    KOKORO_RESOURCE_SHA256,
    KOKORO_REVISION,
    ModelVerificationError,
    cleanup_render_path,
    is_loopback_host,
    load_settings,
    next_render_path,
    resolve_voice,
    sha256_file,
    verify_resource_manifest,
)


class CoreTests(unittest.TestCase):
    def test_loopback_hosts(self) -> None:
        self.assertTrue(is_loopback_host("localhost"))
        self.assertTrue(is_loopback_host("127.0.0.1"))
        self.assertTrue(is_loopback_host("::1"))
        self.assertFalse(is_loopback_host("0.0.0.0"))
        self.assertFalse(is_loopback_host("192.168.1.50"))

    def test_resolves_supported_voice_aliases(self) -> None:
        self.assertEqual(resolve_voice("marlowe"), "af_heart")
        self.assertEqual(resolve_voice("sloane"), "af_bella")
        self.assertEqual(resolve_voice("jules"), "am_michael")
        self.assertEqual(resolve_voice("af_heart"), "af_heart")

    def test_rejects_unsupported_voice(self) -> None:
        with self.assertRaisesRegex(ValueError, "Unsupported voice"):
            resolve_voice("unknown")

    def test_hashes_files(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            path = Path(temp_dir) / "payload.txt"
            path.write_text("kokoro", encoding="utf-8")
            self.assertEqual(
                sha256_file(path),
                "1791019474d9bf5395919bfeda11bf46fd60579a5b6b43e6e4495731a397dc7d",
            )

    def test_frozen_sidecar_requires_an_absolute_host_data_root(self) -> None:
        with (
            patch.object(sys, "frozen", True, create=True),
            patch.dict(
                os.environ,
                {
                    "ADAPTIVE_AUDIO_PLAYER_TTS_DATA_ROOT": "",
                    "ADAPTIVE_AUDIO_PLAYER_TTS_RENDER_ROOT": "",
                },
            ),
        ):
            with self.assertRaisesRegex(ValueError, "host-owned path"):
                load_settings()

            os.environ["ADAPTIVE_AUDIO_PLAYER_TTS_DATA_ROOT"] = "relative-data"
            with self.assertRaisesRegex(ValueError, "absolute path"):
                load_settings()

    def test_contains_and_cleans_renders_under_non_ascii_app_data(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            proof_root = Path(temp_dir)
            data_root = proof_root / "Brían app data"
            outside_path = proof_root / "outside.wav"
            outside_path.write_bytes(b"outside")
            with patch.dict(
                os.environ,
                {
                    "ADAPTIVE_AUDIO_PLAYER_TTS_DATA_ROOT": str(data_root),
                    "ADAPTIVE_AUDIO_PLAYER_TTS_RENDER_ROOT": "",
                },
            ):
                settings = load_settings()

            self.assertEqual(settings.data_root, data_root)
            self.assertEqual(settings.render_root, data_root / "tts-renders")
            render_path = next_render_path(settings)
            render_path.write_bytes(b"temporary render")

            self.assertFalse(cleanup_render_path(settings, outside_path))
            self.assertTrue(outside_path.is_file())
            self.assertTrue(cleanup_render_path(settings, render_path))
            self.assertFalse(render_path.exists())
            self.assertEqual(list(settings.render_root.iterdir()), [])

    def test_defaults_development_model_root_to_the_pinned_local_cache(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            project_root = Path(temp_dir)
            with (
                patch.object(sys, "frozen", False, create=True),
                patch("tts_sidecar.core.repo_root", return_value=project_root),
                patch.dict(
                    os.environ,
                    {
                        "ADAPTIVE_AUDIO_PLAYER_TTS_DATA_ROOT": "",
                        "ADAPTIVE_AUDIO_PLAYER_TTS_MODEL_ROOT": "",
                        "ADAPTIVE_AUDIO_PLAYER_TTS_RENDER_ROOT": "",
                    },
                ),
            ):
                settings = load_settings()

            self.assertEqual(
                settings.model_root,
                project_root
                / "data"
                / "local-tts"
                / "huggingface"
                / "hub"
                / "models--hexgrad--Kokoro-82M"
                / "snapshots"
                / KOKORO_REVISION,
            )

    def test_rejects_a_render_root_outside_app_data(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            proof_root = Path(temp_dir)
            with patch.dict(
                os.environ,
                {
                    "ADAPTIVE_AUDIO_PLAYER_TTS_DATA_ROOT": str(
                        proof_root / "app-data"
                    ),
                    "ADAPTIVE_AUDIO_PLAYER_TTS_RENDER_ROOT": str(
                        proof_root / "outside-renders"
                    ),
                },
            ):
                with self.assertRaisesRegex(ValueError, "must stay inside"):
                    load_settings()

    def test_pins_the_approved_kokoro_revision_and_five_resources(self) -> None:
        self.assertEqual(
            KOKORO_REVISION,
            "f3ff3571791e39611d31c381e3a41a3af07b4987",
        )
        self.assertEqual(
            KOKORO_RESOURCE_SHA256,
            {
                "kokoro-v1_0.pth": (
                    "496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4"
                ),
                "config.json": (
                    "5abb01e2403b072bf03d04fde160443e209d7a0dad49a423be15196b9b43c17f"
                ),
                "voices/af_heart.pt": (
                    "0ab5709b8ffab19bfd849cd11d98f75b60af7733253ad0d67b12382a102cb4ff"
                ),
                "voices/af_bella.pt": (
                    "8cb64e02fcc8de0327a8e13817e49c76c945ecf0052ceac97d3081480e8e48d6"
                ),
                "voices/am_michael.pt": (
                    "9a443b79a4b22489a5b0ab7c651a0bcd1a30bef675c28333f06971abbd47bd37"
                ),
            },
        )

    def test_verifies_a_complete_resource_manifest_without_writes(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            resource_root = Path(temp_dir)
            payloads = {
                "model.bin": b"model",
                "voices/voice.pt": b"voice",
            }
            manifest = {
                name: hashlib.sha256(payload).hexdigest()
                for name, payload in payloads.items()
            }
            for name, payload in payloads.items():
                path = resource_root / name
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(payload)

            before = sorted(
                path.relative_to(resource_root) for path in resource_root.rglob("*")
            )
            verified = verify_resource_manifest(resource_root, manifest)
            after = sorted(
                path.relative_to(resource_root) for path in resource_root.rglob("*")
            )

            self.assertEqual(set(verified), set(manifest))
            self.assertEqual(before, after)

    def test_missing_resource_fails_offline(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            resource_root = Path(temp_dir)
            manifest = {
                "missing.bin": hashlib.sha256(b"missing").hexdigest(),
            }

            with self.assertRaisesRegex(ModelVerificationError, "missing"):
                verify_resource_manifest(resource_root, manifest)

            self.assertEqual(list(resource_root.iterdir()), [])

    def test_rejects_a_tampered_resource(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            resource_root = Path(temp_dir)
            resource_path = resource_root / "model.bin"
            resource_path.write_bytes(b"tampered")

            with self.assertRaisesRegex(ModelVerificationError, "SHA-256"):
                verify_resource_manifest(
                    resource_root,
                    {"model.bin": hashlib.sha256(b"approved").hexdigest()},
                )

    def test_rejects_a_symlinked_resource(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            resource_root = Path(temp_dir)
            resource_path = resource_root / "model.bin"
            resource_path.write_bytes(b"model")

            with patch.object(
                type(resource_path),
                "is_symlink",
                autospec=True,
                side_effect=lambda path: path.name == "model.bin",
            ):
                with self.assertRaisesRegex(ModelVerificationError, "symbolic link"):
                    verify_resource_manifest(
                        resource_root,
                        {"model.bin": hashlib.sha256(b"model").hexdigest()},
                    )


if __name__ == "__main__":
    unittest.main()
