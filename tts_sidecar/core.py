from __future__ import annotations

import hashlib
import ipaddress
import os
import uuid
from dataclasses import dataclass
from pathlib import Path

KOKORO_REPO_ID = "hexgrad/Kokoro-82M"
KOKORO_MODEL_FILE = "kokoro-v1_0.pth"
KOKORO_MODEL_SHA256 = (
    "496dba118d1a58f5f3db2efc88dbdc216e0483fc89fe6e47ee1f2c53f18ad1e4"
)
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
    hf_home: Path
    render_root: Path
    device: str | None
    offline: bool


def repo_root() -> Path:
    return Path(__file__).resolve().parents[1]


def _read_bool_env(name: str, fallback: bool = False) -> bool:
    raw_value = os.environ.get(name)
    if raw_value is None or not raw_value.strip():
        return fallback

    return raw_value.strip().lower() in {"1", "true", "yes", "on"}


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


def _read_path_env(name: str, fallback: Path) -> Path:
    raw_value = os.environ.get(name)
    if raw_value is None or not raw_value.strip():
        return fallback

    return Path(raw_value.strip()).expanduser().resolve()


def load_settings() -> SidecarSettings:
    data_root = _read_path_env(
        "ADAPTIVE_AUDIO_PLAYER_TTS_DATA_ROOT",
        repo_root() / "data" / "local-tts",
    )
    hf_home = _read_path_env(
        "ADAPTIVE_AUDIO_PLAYER_TTS_HF_HOME",
        data_root / "huggingface",
    )
    render_root = _read_path_env(
        "ADAPTIVE_AUDIO_PLAYER_TTS_RENDER_ROOT",
        data_root / "renders",
    )
    raw_device = os.environ.get("ADAPTIVE_AUDIO_PLAYER_TTS_DEVICE")
    device = raw_device.strip().lower() if raw_device and raw_device.strip() else None

    return SidecarSettings(
        host=os.environ.get("ADAPTIVE_AUDIO_PLAYER_TTS_HOST", "127.0.0.1").strip(),
        port=_read_int_env("ADAPTIVE_AUDIO_PLAYER_TTS_PORT", 8765),
        data_root=data_root,
        hf_home=hf_home,
        render_root=render_root,
        device=device,
        offline=_read_bool_env("ADAPTIVE_AUDIO_PLAYER_TTS_OFFLINE"),
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


def configure_huggingface_home(settings: SidecarSettings) -> None:
    settings.hf_home.mkdir(parents=True, exist_ok=True)
    os.environ["HF_HOME"] = str(settings.hf_home)


def ensure_verified_model_file(settings: SidecarSettings) -> Path:
    configure_huggingface_home(settings)

    try:
        from huggingface_hub import hf_hub_download
    except ImportError as error:
        raise ModelVerificationError(
            "The local TTS service is missing huggingface-hub. Install the "
            "sidecar requirements before rendering."
        ) from error

    try:
        model_path = Path(
            hf_hub_download(
                repo_id=KOKORO_REPO_ID,
                filename=KOKORO_MODEL_FILE,
                local_files_only=settings.offline,
            )
        )
    except Exception as error:
        mode = "from the local Hugging Face cache" if settings.offline else "from Hugging Face"
        raise ModelVerificationError(
            f"Kokoro model weights could not be loaded {mode}. Check network "
            "access, disk space, and the sidecar requirements."
        ) from error

    actual_sha256 = sha256_file(model_path)
    if actual_sha256 != KOKORO_MODEL_SHA256:
        raise ModelVerificationError(
            "Kokoro model weight verification failed. Delete the cached "
            f"{KOKORO_MODEL_FILE} file and download it again from {KOKORO_REPO_ID}."
        )

    return model_path


def read_cached_model_status(settings: SidecarSettings) -> dict[str, str | bool | None]:
    configure_huggingface_home(settings)

    try:
        from huggingface_hub import hf_hub_download

        model_path = Path(
            hf_hub_download(
                repo_id=KOKORO_REPO_ID,
                filename=KOKORO_MODEL_FILE,
                local_files_only=True,
            )
        )
    except Exception:
        return {
            "present": False,
            "verified": False,
            "sha256": None,
        }

    actual_sha256 = sha256_file(model_path)
    return {
        "present": True,
        "verified": actual_sha256 == KOKORO_MODEL_SHA256,
        "sha256": actual_sha256,
    }


def next_render_path(settings: SidecarSettings) -> Path:
    settings.render_root.mkdir(parents=True, exist_ok=True)
    return settings.render_root / f"kokoro-{uuid.uuid4().hex}.wav"
