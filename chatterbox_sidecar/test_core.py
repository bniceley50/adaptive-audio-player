from __future__ import annotations

import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from chatterbox_sidecar import core


class ChatterboxCoreTests(unittest.TestCase):
    def test_settings_require_loopback_containment_and_launch_secret(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime_root = Path(temp_dir).resolve()
            valid = {
                "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_ROOT": str(runtime_root),
                "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_MODEL_ROOT": str(
                    runtime_root / "model"
                ),
                "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_HOST": "127.0.0.1",
                "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_PORT": "18766",
                "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_SECRET": "a" * 64,
            }
            with patch.dict(os.environ, valid, clear=False):
                settings = core.load_settings()
                self.assertEqual(settings.runtime_root, runtime_root)
                self.assertEqual(settings.launch_secret, "a" * 64)

                with patch.dict(
                    os.environ,
                    {"ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_HOST": "0.0.0.0"},
                ):
                    with self.assertRaisesRegex(ValueError, "loopback"):
                        core.load_settings()

                with patch.dict(
                    os.environ,
                    {"ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_SECRET": "short"},
                ):
                    with self.assertRaisesRegex(ValueError, "256 bits"):
                        core.load_settings()

                with patch.dict(
                    os.environ,
                    {
                        "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_MODEL_ROOT": str(
                            runtime_root.parent / "outside-model"
                        )
                    },
                ):
                    with self.assertRaisesRegex(ValueError, "app-managed runtime"):
                        core.load_settings()

    def test_runtime_manifest_must_match_the_approved_pin_exactly(self) -> None:
        with tempfile.TemporaryDirectory() as temp_dir:
            runtime_root = Path(temp_dir).resolve()
            model_root = runtime_root / "model"
            model_root.mkdir()
            settings = core.ChatterboxSettings(
                host="127.0.0.1",
                port=18766,
                runtime_root=runtime_root,
                model_root=model_root,
                launch_secret="a" * 64,
            )
            expected = {"package": {"version": "0.1.7"}}
            installed_path = runtime_root / "install-manifest.json"
            installed_path.write_text(json.dumps(expected), encoding="utf-8")

            with patch.object(core, "load_expected_manifest", return_value=expected):
                self.assertEqual(core.verify_runtime_manifest(settings), expected)

                installed_path.write_text(
                    json.dumps({"package": {"version": "latest"}}),
                    encoding="utf-8",
                )
                with self.assertRaisesRegex(
                    core.ChatterboxRuntimeError, "approved pinned runtime"
                ):
                    core.verify_runtime_manifest(settings)

    def test_runtime_packages_require_patched_pins_and_exclude_gradio(self) -> None:
        manifest = {
            "package": {"version": "0.1.7"},
            "runtime": {
                "python": "3.11",
                "diffusers": "0.38.0",
                "starlette": "1.3.1",
                "transformers": "5.5.0",
            },
            "excludedPackages": ["gradio", "gradio-client"],
        }
        installed = {
            "chatterbox-tts": "0.1.7",
            "diffusers": "0.38.0",
            "starlette": "1.3.1",
            "transformers": "5.5.0",
        }

        def version_without_gradio(package: str) -> str:
            if package in installed:
                return installed[package]
            raise core.importlib.metadata.PackageNotFoundError(package)

        with patch.object(
            core.importlib.metadata,
            "version",
            side_effect=version_without_gradio,
        ):
            core.verify_runtime_packages(manifest)

        with patch.object(
            core.importlib.metadata,
            "version",
            side_effect=lambda package: installed.get(package, "6.15.1"),
        ):
            with self.assertRaisesRegex(
                core.ChatterboxRuntimeError, "excluded package gradio"
            ):
                core.verify_runtime_packages(manifest)

    def test_launch_secret_accepts_exactly_one_constant_time_candidate(self) -> None:
        expected = "a" * 64
        self.assertTrue(core.request_has_launch_secret([expected], expected))
        self.assertFalse(core.request_has_launch_secret([], expected))
        self.assertFalse(
            core.request_has_launch_secret([expected, expected], expected)
        )
        self.assertFalse(core.request_has_launch_secret(["b" * 64], expected))


if __name__ == "__main__":
    unittest.main()
