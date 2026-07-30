from __future__ import annotations

import argparse
import hashlib
import importlib.metadata
import json
import os
import shutil
import subprocess
import sys
import venv
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
EXPECTED_MANIFEST_PATH = Path(__file__).with_name("runtime-manifest.json")
REQUIREMENTS_PATH = Path(__file__).with_name("requirements-runtime.txt")
RUNTIME_ROOT = REPO_ROOT / "data" / "local-chatterbox"
TORCH_INDEX = "https://download.pytorch.org/whl/cu130"


class InstallationError(RuntimeError):
    """Raised when the optional runtime cannot be installed safely."""


def load_expected_manifest() -> dict[str, Any]:
    return json.loads(EXPECTED_MANIFEST_PATH.read_text(encoding="utf-8"))


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def verify_model_files(model_root: Path, manifest: dict[str, Any]) -> None:
    if model_root.is_symlink() or not model_root.is_dir():
        raise InstallationError("The pinned Chatterbox model directory is missing.")

    resolved_root = model_root.resolve(strict=True)
    for relative_name, expected in manifest["model"]["files"].items():
        relative_path = Path(relative_name)
        if relative_path.is_absolute() or ".." in relative_path.parts:
            raise InstallationError("The Chatterbox resource manifest is unsafe.")

        candidate = model_root / relative_path
        if candidate.is_symlink():
            raise InstallationError(
                f"Chatterbox resource must be a regular file: {relative_name}"
            )
        try:
            resolved = candidate.resolve(strict=True)
            resolved.relative_to(resolved_root)
        except (OSError, ValueError) as error:
            raise InstallationError(
                f"Chatterbox resource is missing: {relative_name}"
            ) from error
        if not resolved.is_file() or resolved.stat().st_size != expected["bytes"]:
            raise InstallationError(
                f"Chatterbox resource size verification failed: {relative_name}"
            )
        if sha256_file(resolved) != expected["sha256"]:
            raise InstallationError(
                f"Chatterbox resource SHA-256 verification failed: {relative_name}"
            )


def venv_python(environment_root: Path) -> Path:
    return environment_root / (
        "Scripts/python.exe" if os.name == "nt" else "bin/python"
    )


def run_checked(command: list[str]) -> None:
    subprocess.run(command, cwd=REPO_ROOT, check=True)


def copy_verified_model(
    source_root: Path,
    destination_root: Path,
    manifest: dict[str, Any],
) -> None:
    verify_model_files(source_root, manifest)
    destination_root.mkdir(parents=True, exist_ok=False)
    for relative_name in manifest["model"]["files"]:
        source = source_root / relative_name
        destination = destination_root / relative_name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(source, destination)

    model_card = source_root / "README.md"
    if model_card.is_file() and not model_card.is_symlink():
        shutil.copy2(model_card, destination_root / "MODEL_CARD.md")


def download_verified_model(
    destination_root: Path,
    manifest: dict[str, Any],
) -> None:
    from huggingface_hub import snapshot_download

    model = manifest["model"]
    destination_root.mkdir(parents=True, exist_ok=False)
    snapshot_download(
        repo_id=model["repoId"],
        revision=model["revision"],
        allow_patterns=[*model["files"], "README.md"],
        local_dir=destination_root,
    )
    downloaded_card = destination_root / "README.md"
    if downloaded_card.is_file():
        downloaded_card.replace(destination_root / "MODEL_CARD.md")


def copy_package_license(environment_root: Path, destination_root: Path) -> None:
    if os.name == "nt":
        site_packages = environment_root / "Lib" / "site-packages"
    else:
        candidates = sorted((environment_root / "lib").glob("python*/site-packages"))
        if not candidates:
            raise InstallationError("The Chatterbox site-packages directory is missing.")
        site_packages = candidates[0]

    license_candidates = sorted(
        site_packages.glob("chatterbox_tts-0.1.7.dist-info/licenses/LICENSE")
    )
    if len(license_candidates) != 1:
        raise InstallationError("The Chatterbox package license was not installed.")
    destination_root.mkdir(parents=True, exist_ok=False)
    shutil.copy2(license_candidates[0], destination_root / "Chatterbox-TTS-LICENSE.txt")


def verify_runtime_versions() -> None:
    expected = load_expected_manifest()
    actual = {
        "chatterbox-tts": importlib.metadata.version("chatterbox-tts"),
        "torch": importlib.metadata.version("torch"),
        "torchaudio": importlib.metadata.version("torchaudio"),
    }
    required = {
        "chatterbox-tts": expected["package"]["version"],
        "torch": expected["runtime"]["torch"],
        "torchaudio": expected["runtime"]["torchaudio"],
    }
    if actual != required:
        raise InstallationError(
            "The installed Chatterbox package versions do not match the pinned runtime."
        )

    import chatterbox.tts  # noqa: F401
    import fastapi  # noqa: F401
    import soundfile  # noqa: F401
    import torch
    import uvicorn  # noqa: F401

    if not torch.cuda.is_available():
        raise InstallationError("The installed Chatterbox runtime cannot access CUDA.")


def finalize_install(staging_root: Path, reuse_model_root: Path | None) -> None:
    manifest = load_expected_manifest()
    verify_runtime_versions()
    model_root = staging_root / "model"
    if reuse_model_root is None:
        download_verified_model(model_root, manifest)
    else:
        copy_verified_model(reuse_model_root, model_root, manifest)
    verify_model_files(model_root, manifest)
    copy_package_license(staging_root / ".venv", staging_root / "licenses")
    shutil.copy2(EXPECTED_MANIFEST_PATH, staging_root / "install-manifest.json")


def install(reuse_model_root: Path | None) -> None:
    if sys.version_info[:2] != (3, 11):
        raise InstallationError(
            f"Python 3.11 is required; found {sys.version.split()[0]}."
        )
    if RUNTIME_ROOT.exists():
        raise InstallationError(
            "The app-managed Chatterbox runtime already exists. No files were changed."
        )

    RUNTIME_ROOT.parent.mkdir(parents=True, exist_ok=True)
    staging_root = RUNTIME_ROOT.with_name(
        f"{RUNTIME_ROOT.name}-installing-{os.getpid()}"
    )
    if staging_root.exists():
        raise InstallationError("A Chatterbox staging directory already exists.")

    print(f"Installing the optional Chatterbox runtime under {RUNTIME_ROOT}.")
    print("This explicit command downloads packages and about 3.2 GB of model assets.")
    venv.EnvBuilder(with_pip=True, clear=False, symlinks=False).create(
        staging_root / ".venv"
    )
    python = venv_python(staging_root / ".venv")
    run_checked(
        [
            str(python),
            "-m",
            "pip",
            "install",
            "--index-url",
            TORCH_INDEX,
            "torch==2.11.0",
            "torchaudio==2.11.0",
        ]
    )
    run_checked(
        [
            str(python),
            "-m",
            "pip",
            "install",
            "--no-deps",
            "chatterbox-tts==0.1.7",
        ]
    )
    run_checked(
        [
            str(python),
            "-m",
            "pip",
            "install",
            "--requirement",
            str(REQUIREMENTS_PATH),
        ]
    )

    finalize_args = [
        str(python),
        str(Path(__file__).resolve()),
        "--finalize-staging-root",
        str(staging_root),
    ]
    if reuse_model_root is not None:
        finalize_args.extend(["--reuse-model-root", str(reuse_model_root)])
    run_checked(finalize_args)
    staging_root.replace(RUNTIME_ROOT)
    print("Chatterbox High Quality is installed. Restart pnpm dev to enable it.")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Install the optional, revision-pinned local Chatterbox runtime."
    )
    parser.add_argument(
        "--reuse-model-root",
        type=Path,
        help="Copy a previously downloaded model only after all pinned hashes verify.",
    )
    parser.add_argument(
        "--finalize-staging-root",
        type=Path,
        help=argparse.SUPPRESS,
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    try:
        if args.finalize_staging_root is not None:
            finalize_install(args.finalize_staging_root, args.reuse_model_root)
        else:
            install(args.reuse_model_root)
    except (InstallationError, OSError, subprocess.CalledProcessError) as error:
        print(f"Chatterbox installation failed: {error}", file=sys.stderr)
        raise SystemExit(1) from error


if __name__ == "__main__":
    main()
