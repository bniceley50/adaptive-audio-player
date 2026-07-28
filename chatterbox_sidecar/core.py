from __future__ import annotations

import hashlib
import hmac
import importlib.metadata
import ipaddress
import json
import os
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Any


EXPECTED_MANIFEST_PATH = Path(__file__).with_name("runtime-manifest.json")
MINIMUM_VRAM_BYTES = 8 * 1024 * 1024 * 1024
SAMPLE_RATE = 24_000
SUPPORTED_VOICE_ID = "chatterbox-default"


class ChatterboxRuntimeError(RuntimeError):
    """Raised when the optional Chatterbox runtime is unavailable or untrusted."""


@dataclass(frozen=True)
class ChatterboxSettings:
    host: str
    port: int
    runtime_root: Path
    model_root: Path
    launch_secret: str


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def load_expected_manifest() -> dict[str, Any]:
    return json.loads(EXPECTED_MANIFEST_PATH.read_text(encoding="utf-8"))


def is_loopback_host(host: str | None) -> bool:
    if not host:
        return False
    normalized = host.strip().lower()
    if normalized == "localhost":
        return True
    try:
        return ipaddress.ip_address(normalized).is_loopback
    except ValueError:
        return False


def _read_absolute_path(name: str, fallback: Path) -> Path:
    raw = os.environ.get(name)
    candidate = Path(raw.strip()) if raw and raw.strip() else fallback
    if not candidate.is_absolute():
        raise ValueError(f"{name} must be an absolute path.")
    return candidate.resolve()


def _is_contained(root: Path, candidate: Path) -> bool:
    try:
        relative = candidate.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return bool(relative.parts)


def load_settings() -> ChatterboxSettings:
    runtime_root = _read_absolute_path(
        "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_ROOT",
        repo_root() / "data" / "local-chatterbox",
    )
    model_root = _read_absolute_path(
        "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_MODEL_ROOT",
        runtime_root / "model",
    )
    if not _is_contained(runtime_root, model_root):
        raise ValueError(
            "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_MODEL_ROOT must stay inside the app-managed runtime."
        )

    host = os.environ.get(
        "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_HOST", "127.0.0.1"
    ).strip()
    if not is_loopback_host(host):
        raise ValueError("The Chatterbox sidecar must bind to a loopback address.")

    raw_port = os.environ.get("ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_PORT", "8766")
    try:
        port = int(raw_port)
    except ValueError as error:
        raise ValueError(
            "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_PORT must be an integer."
        ) from error
    if port < 1 or port > 65535:
        raise ValueError(
            "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_PORT must be a valid TCP port."
        )

    launch_secret = os.environ.get(
        "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_SECRET", ""
    ).strip()
    if not re.fullmatch(r"[a-fA-F0-9]{64}", launch_secret):
        raise ValueError(
            "ADAPTIVE_AUDIO_PLAYER_CHATTERBOX_SECRET must contain 256 bits encoded as 64 hexadecimal characters."
        )

    return ChatterboxSettings(
        host=host,
        port=port,
        runtime_root=runtime_root,
        model_root=model_root,
        launch_secret=launch_secret,
    )


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_runtime_manifest(settings: ChatterboxSettings) -> dict[str, Any]:
    expected = load_expected_manifest()
    installed_path = settings.runtime_root / "install-manifest.json"
    if installed_path.is_symlink() or not installed_path.is_file():
        raise ChatterboxRuntimeError(
            "High Quality setup is incomplete. Run pnpm chatterbox:install."
        )
    try:
        installed = json.loads(installed_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise ChatterboxRuntimeError(
            "High Quality setup has an invalid installation manifest."
        ) from error
    if installed != expected:
        raise ChatterboxRuntimeError(
            "High Quality setup does not match the approved pinned runtime."
        )
    return expected


def verify_runtime_packages(manifest: dict[str, Any]) -> None:
    expected = {
        "chatterbox-tts": manifest["package"]["version"],
        "torch": manifest["runtime"]["torch"],
        "torchaudio": manifest["runtime"]["torchaudio"],
    }
    try:
        actual = {
            package: importlib.metadata.version(package) for package in expected
        }
    except importlib.metadata.PackageNotFoundError as error:
        raise ChatterboxRuntimeError(
            "High Quality setup is missing a pinned runtime package."
        ) from error
    if actual != expected:
        raise ChatterboxRuntimeError(
            "High Quality setup has unexpected package versions."
        )


def verify_model_resources(
    settings: ChatterboxSettings, manifest: dict[str, Any]
) -> dict[str, Path]:
    if settings.model_root.is_symlink():
        raise ChatterboxRuntimeError("High Quality model storage must not be a link.")
    try:
        resolved_root = settings.model_root.resolve(strict=True)
    except OSError as error:
        raise ChatterboxRuntimeError(
            "High Quality model resources are missing. Run pnpm chatterbox:install."
        ) from error
    if not resolved_root.is_dir():
        raise ChatterboxRuntimeError("High Quality model storage is invalid.")

    verified: dict[str, Path] = {}
    for relative_name, expected in manifest["model"]["files"].items():
        relative = Path(relative_name)
        if relative.is_absolute() or ".." in relative.parts:
            raise ChatterboxRuntimeError("The High Quality model manifest is unsafe.")
        candidate = settings.model_root / relative
        if candidate.is_symlink():
            raise ChatterboxRuntimeError(
                f"High Quality resource must be a regular file: {relative_name}"
            )
        try:
            resolved = candidate.resolve(strict=True)
            resolved.relative_to(resolved_root)
        except (OSError, ValueError) as error:
            raise ChatterboxRuntimeError(
                f"High Quality resource is missing: {relative_name}"
            ) from error
        if not resolved.is_file() or resolved.stat().st_size != expected["bytes"]:
            raise ChatterboxRuntimeError(
                f"High Quality resource size verification failed: {relative_name}"
            )
        if sha256_file(resolved) != expected["sha256"]:
            raise ChatterboxRuntimeError(
                f"High Quality resource SHA-256 verification failed: {relative_name}"
            )
        verified[relative_name] = resolved
    return verified


def verify_chatterbox_runtime(settings: ChatterboxSettings) -> dict[str, Path]:
    manifest = verify_runtime_manifest(settings)
    verify_runtime_packages(manifest)
    return verify_model_resources(settings, manifest)


def request_has_launch_secret(supplied: list[str], expected: str) -> bool:
    return len(supplied) == 1 and hmac.compare_digest(supplied[0], expected)
