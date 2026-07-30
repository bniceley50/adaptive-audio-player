from __future__ import annotations

import hashlib
import ipaddress
import os
import re
import sys
import uuid
from dataclasses import dataclass
from pathlib import Path

KOKORO_REPO_ID = "hexgrad/Kokoro-82M"
KOKORO_REVISION = "f3ff3571791e39611d31c381e3a41a3af07b4987"
KOKORO_MODEL_FILE = "kokoro-v1_0.pth"
KOKORO_MODEL_SHA256 = (
    "496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4"
)
KOKORO_RESOURCE_SHA256 = {
    KOKORO_MODEL_FILE: KOKORO_MODEL_SHA256,
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
}
KOKORO_PACKAGE_VERSION = "0.9.4"
SAMPLE_RATE = 24_000

VOICE_MAP = {
    "marlowe": "af_heart",
    "sloane": "af_bella",
    "jules": "am_michael",
}

SUPPORTED_KOKORO_VOICES = frozenset(VOICE_MAP.values())


class ModelVerificationError(RuntimeError):
    """Raised when the pinned Kokoro model payload is unavailable or untrusted."""


@dataclass(frozen=True)
class SidecarSettings:
    host: str
    port: int
    data_root: Path
    model_root: Path
    render_root: Path
    device: str | None
    launch_secret: str | None = None


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _read_int_env(name: str, fallback: int) -> int:
    raw_value = os.environ.get(name)
    if raw_value is None or not raw_value.strip():
        return fallback

    try:
        parsed = int(raw_value)
    except ValueError as error:
        raise ValueError(f"{name} must be an integer.") from error

    if parsed <= 0:
        raise ValueError(f"{name} must be a positive integer.")

    return parsed


def _read_path_env(name: str, fallback: Path | None = None) -> Path | None:
    raw_value = os.environ.get(name)
    if raw_value is None or not raw_value.strip():
        return fallback.resolve() if fallback is not None else None

    configured_path = Path(raw_value.strip()).expanduser()
    if not configured_path.is_absolute():
        raise ValueError(f"{name} must be an absolute path.")
    return configured_path.resolve()


def _is_path_contained(root: Path, candidate: Path) -> bool:
    try:
        relative = candidate.resolve().relative_to(root.resolve())
    except ValueError:
        return False
    return bool(relative.parts)


def load_settings() -> SidecarSettings:
    is_frozen = bool(getattr(sys, "frozen", False))
    data_root = _read_path_env("ADAPTIVE_AUDIO_PLAYER_TTS_DATA_ROOT")
    if data_root is None:
        if is_frozen:
            raise ValueError(
                "ADAPTIVE_AUDIO_PLAYER_TTS_DATA_ROOT must be an absolute "
                "host-owned path for the frozen sidecar."
            )
        data_root = (repo_root() / "data" / "local-tts").resolve()
    default_model_root = (
        repo_root() / "models" / "kokoro" / KOKORO_REVISION
        if is_frozen
        else data_root
        / "huggingface"
        / "hub"
        / f"models--{KOKORO_REPO_ID.replace('/', '--')}"
        / "snapshots"
        / KOKORO_REVISION
    )
    model_root = _read_path_env(
        "ADAPTIVE_AUDIO_PLAYER_TTS_MODEL_ROOT",
        default_model_root,
    )
    render_root = _read_path_env(
        "ADAPTIVE_AUDIO_PLAYER_TTS_RENDER_ROOT",
        data_root / "tts-renders",
    )
    if model_root is None or render_root is None:
        raise ValueError("Sidecar resource paths could not be resolved.")
    if not _is_path_contained(data_root, render_root):
        raise ValueError(
            "ADAPTIVE_AUDIO_PLAYER_TTS_RENDER_ROOT must stay inside "
            "ADAPTIVE_AUDIO_PLAYER_TTS_DATA_ROOT."
        )
    raw_device = os.environ.get("ADAPTIVE_AUDIO_PLAYER_TTS_DEVICE")
    device = raw_device.strip().lower() if raw_device and raw_device.strip() else None
    raw_launch_secret = os.environ.get("ADAPTIVE_AUDIO_PLAYER_TTS_SECRET")
    launch_secret = (
        raw_launch_secret.strip()
        if raw_launch_secret and raw_launch_secret.strip()
        else None
    )
    if launch_secret is not None and not re.fullmatch(
        r"[a-fA-F0-9]{64}", launch_secret
    ):
        raise ValueError(
            "ADAPTIVE_AUDIO_PLAYER_TTS_SECRET must contain 256 bits encoded "
            "as 64 hexadecimal characters."
        )
    if is_frozen and launch_secret is None:
        raise ValueError(
            "ADAPTIVE_AUDIO_PLAYER_TTS_SECRET must be set for the frozen sidecar."
        )

    host = os.environ.get("ADAPTIVE_AUDIO_PLAYER_TTS_HOST", "127.0.0.1").strip()
    if is_frozen and host != "127.0.0.1":
        raise ValueError("The frozen TTS sidecar must bind to 127.0.0.1.")

    return SidecarSettings(
        host=host,
        port=_read_int_env("ADAPTIVE_AUDIO_PLAYER_TTS_PORT", 8765),
        data_root=data_root,
        model_root=model_root,
        render_root=render_root,
        device=device,
        launch_secret=launch_secret,
    )


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


def assert_loopback_host(host: str) -> None:
    if not is_loopback_host(host):
        raise ValueError(
            "The local TTS sidecar must bind to localhost, 127.0.0.1, or ::1."
        )


def resolve_voice(voice: str | None) -> str:
    requested_voice = (voice or "marlowe").strip().lower()
    if not requested_voice:
        requested_voice = "marlowe"

    mapped_voice = VOICE_MAP.get(requested_voice, requested_voice)
    if mapped_voice not in SUPPORTED_KOKORO_VOICES:
        supported = ", ".join(sorted(VOICE_MAP))
        raise ValueError(f"Unsupported voice '{requested_voice}'. Use one of: {supported}.")

    return mapped_voice


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)

    return digest.hexdigest()


def verify_resource_manifest(
    resource_root: Path,
    manifest: dict[str, str],
) -> dict[str, Path]:
    """Resolve and verify an immutable, package-owned resource manifest."""
    requested_root = resource_root.expanduser()
    if requested_root.is_symlink():
        raise ModelVerificationError(
            f"Kokoro resource root must not be a symbolic link: {requested_root}"
        )

    try:
        resolved_root = requested_root.resolve(strict=True)
    except OSError as error:
        raise ModelVerificationError(
            f"Kokoro resource directory is missing: {requested_root}"
        ) from error

    if not resolved_root.is_dir():
        raise ModelVerificationError(
            f"Kokoro resource path is not a directory: {resolved_root}"
        )

    verified_paths: dict[str, Path] = {}
    for relative_name, expected_sha256 in manifest.items():
        relative_path = Path(relative_name)
        if relative_path.is_absolute() or ".." in relative_path.parts:
            raise ModelVerificationError(
                f"Kokoro resource manifest contains an unsafe path: {relative_name}"
            )

        candidate = requested_root
        for part in relative_path.parts:
            candidate = candidate / part
            if candidate.is_symlink():
                raise ModelVerificationError(
                    f"Kokoro resource must not be a symbolic link: {relative_name}"
                )

        try:
            resolved_path = candidate.resolve(strict=True)
            resolved_path.relative_to(resolved_root)
        except (OSError, ValueError) as error:
            raise ModelVerificationError(
                f"Kokoro resource is missing or outside its package: {relative_name}"
            ) from error

        if not resolved_path.is_file():
            raise ModelVerificationError(
                f"Kokoro resource is not a regular file: {relative_name}"
            )

        actual_sha256 = sha256_file(resolved_path)
        if actual_sha256 != expected_sha256:
            raise ModelVerificationError(
                f"Kokoro resource SHA-256 verification failed: {relative_name}"
            )

        verified_paths[relative_name] = resolved_path

    return verified_paths


def verify_kokoro_resources(resource_root: Path) -> dict[str, Path]:
    """Verify all files approved for the pinned Kokoro revision without I/O writes."""
    return verify_resource_manifest(resource_root, KOKORO_RESOURCE_SHA256)


def read_model_resource_status(settings: SidecarSettings) -> dict[str, int | bool]:
    present = all(
        (settings.model_root / relative_name).is_file()
        for relative_name in KOKORO_RESOURCE_SHA256
    )
    try:
        verify_kokoro_resources(settings.model_root)
    except ModelVerificationError:
        verified = False
    else:
        verified = True

    return {
        "present": present,
        "verified": verified,
        "resourceCount": len(KOKORO_RESOURCE_SHA256),
    }


def next_render_path(settings: SidecarSettings) -> Path:
    if not _is_path_contained(settings.data_root, settings.render_root):
        raise ValueError("Temporary render storage must stay inside app data.")
    settings.render_root.mkdir(parents=True, exist_ok=True)
    return settings.render_root / f"kokoro-{uuid.uuid4().hex}.wav"


def cleanup_render_path(settings: SidecarSettings, render_path: Path) -> bool:
    candidate = render_path.expanduser()
    if (
        not candidate.is_absolute()
        or candidate.is_symlink()
        or not _is_path_contained(settings.render_root, candidate)
    ):
        return False

    try:
        if not candidate.is_file():
            return False
        candidate.unlink()
    except OSError:
        return False
    return True
