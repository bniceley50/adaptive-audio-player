from __future__ import annotations

import argparse
import hashlib
import json
import os
import platform
import re
import secrets
import shutil
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import time
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener


PROJECT_ROOT = Path(__file__).resolve().parents[1]
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from tts_sidecar.core import (  # noqa: E402
    KOKORO_RESOURCE_SHA256,
    KOKORO_REVISION,
    verify_kokoro_resources,
)


RUNTIME_REQUIREMENTS = PROJECT_ROOT / "tts_sidecar" / "requirements.txt"
BUILD_REQUIREMENTS = PROJECT_ROOT / "tts_sidecar" / "requirements-build.txt"
SPEC_FILE = PROJECT_ROOT / "tts_sidecar" / "sidecar.spec"
BUNDLE_NAME = "AdaptiveAudioPlayerTTS"
TTS_SECRET_HEADER = "x-adaptive-audio-player-tts-secret"
EXECUTABLE_NAME = f"{BUNDLE_NAME}.exe"
PYINSTALLER_VERSION = "6.21.0"


def parse_arguments() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build and verify the frozen Windows Kokoro sidecar."
    )
    parser.add_argument(
        "--output",
        type=Path,
        required=True,
        help="A new directory that will receive the one-folder bundle.",
    )
    parser.add_argument(
        "--model-source",
        type=Path,
        required=True,
        help=(
            "A flat directory containing the five approved Kokoro resources "
            "for the pinned revision."
        ),
    )
    parser.add_argument(
        "--wheelhouse",
        type=Path,
        help="Optional local wheel directory used with --no-index.",
    )
    return parser.parse_args()


def run(command: list[str], *, env: dict[str, str] | None = None) -> None:
    subprocess.run(command, cwd=PROJECT_ROOT, env=env, check=True)


def sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as file:
        for chunk in iter(lambda: file.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_supported_builder() -> None:
    if sys.version_info[:2] != (3, 12):
        raise RuntimeError("The sidecar builder requires Python 3.12.x.")
    if sys.maxsize <= 2**32 or platform.machine().lower() not in {"amd64", "x86_64"}:
        raise RuntimeError("The sidecar builder requires 64-bit x64 Python.")
    if os.name != "nt":
        raise RuntimeError("The v1 sidecar bundle must be built on Windows.")


def require_new_directory(path: Path, label: str) -> Path:
    resolved = path.expanduser().resolve()
    if resolved.exists():
        raise RuntimeError(f"{label} must not already exist: {resolved}")
    resolved.parent.mkdir(parents=True, exist_ok=True)
    return resolved


def require_existing_directory(path: Path, label: str) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.is_dir():
        raise RuntimeError(f"{label} is missing: {resolved}")
    return resolved


def venv_python(venv_root: Path) -> Path:
    return venv_root / "Scripts" / "python.exe"


def canonical_distribution_name(value: str) -> str:
    return re.sub(r"[-_.]+", "-", value).lower()


def read_runtime_lock() -> dict[str, str]:
    locked: dict[str, str] = {}
    hash_count = 0
    for raw_line in RUNTIME_REQUIREMENTS.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("--hash=sha256:"):
            if not re.fullmatch(r"--hash=sha256:[0-9a-f]{64}", line):
                raise RuntimeError(f"Invalid runtime requirement hash: {line}")
            hash_count += 1
            continue
        if line.startswith("--"):
            continue
        requirement = line.removesuffix("\\").strip()
        if "==" in requirement:
            raw_name, version = requirement.split("==", 1)
            name = raw_name.split("[", 1)[0]
        elif " @ " in requirement:
            name, url = requirement.split(" @ ", 1)
            match = re.search(r"-([0-9]+(?:\.[0-9]+)+)-py", url)
            if match is None:
                raise RuntimeError(
                    f"Cannot read locked version from {requirement}"
                )
            version = match.group(1)
        else:
            raise RuntimeError(f"Runtime requirement is not exact: {requirement}")
        key = canonical_distribution_name(name)
        if key in locked:
            raise RuntimeError(f"Duplicate runtime requirement: {name}")
        locked[key] = version.strip()
    if hash_count != len(locked):
        raise RuntimeError(
            "Every runtime distribution must have exactly one reviewed SHA-256."
        )
    return locked


def verify_runtime_environment(python_executable: Path) -> None:
    expected = read_runtime_lock()
    inventory_source = (
        "import importlib.metadata,json,re;"
        "c=lambda v:re.sub(r'[-_.]+','-',v).lower();"
        "print(json.dumps({c(d.metadata['Name']):d.version for d in "
        "importlib.metadata.distributions() if d.metadata['Name']}))"
    )
    completed = subprocess.run(
        [str(python_executable), "-c", inventory_source],
        cwd=PROJECT_ROOT,
        check=True,
        capture_output=True,
        text=True,
    )
    installed = json.loads(completed.stdout)
    installed.pop("pip", None)
    if installed != expected:
        missing = sorted(set(expected) - set(installed))
        unexpected = sorted(set(installed) - set(expected))
        changed = sorted(
            name
            for name in set(expected) & set(installed)
            if expected[name] != installed[name]
        )
        raise RuntimeError(
            "Installed sidecar runtime differs from the reviewed closure: "
            f"missing={missing}, unexpected={unexpected}, changed={changed}"
        )


def install_build_environment(
    work_root: Path, wheelhouse: Path | None
) -> tuple[Path, dict[str, str]]:
    venv_root = work_root / "build-venv"
    run([sys.executable, "-m", "venv", str(venv_root)])
    python_executable = venv_python(venv_root)
    install_environment = os.environ.copy()
    install_environment.update(
        {
            "PIP_DISABLE_PIP_VERSION_CHECK": "1",
            "PYTHONDONTWRITEBYTECODE": "1",
        }
    )
    source_arguments = ["--no-cache-dir"]
    if wheelhouse is not None:
        source_arguments.extend(["--no-index", "--find-links", str(wheelhouse)])

    run(
        [
            str(python_executable),
            "-m",
            "pip",
            "install",
            *source_arguments,
            "--require-hashes",
            "--requirement",
            str(RUNTIME_REQUIREMENTS),
        ],
        env=install_environment,
    )
    verify_runtime_environment(python_executable)
    run(
        [
            str(python_executable),
            "-m",
            "pip",
            "install",
            *source_arguments,
            "--require-hashes",
            "--requirement",
            str(BUILD_REQUIREMENTS),
        ],
        env=install_environment,
    )
    run(
        [str(python_executable), "-m", "pip", "check"],
        env=install_environment,
    )
    version = subprocess.run(
        [str(python_executable), "-m", "PyInstaller", "--version"],
        cwd=PROJECT_ROOT,
        env=install_environment,
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()
    if version != PYINSTALLER_VERSION:
        raise RuntimeError(
            f"Expected PyInstaller {PYINSTALLER_VERSION}, received {version}."
        )
    return python_executable, install_environment


def build_bundle(
    python_executable: Path,
    install_environment: dict[str, str],
    work_root: Path,
    output_root: Path,
    model_source: Path,
) -> Path:
    bootstrap = work_root / "sidecar_bootstrap.py"
    bootstrap.write_text(
        "from tts_sidecar.server import main\n\n"
        "if __name__ == '__main__':\n"
        "    main()\n",
        encoding="utf-8",
        newline="\n",
    )
    build_environment = install_environment.copy()
    build_environment.update(
        {
            "ADAPTIVE_AUDIO_PLAYER_PYINSTALLER_ENTRY": str(bootstrap),
            "ADAPTIVE_AUDIO_PLAYER_PYINSTALLER_MODEL_ROOT": str(model_source),
            "ADAPTIVE_AUDIO_PLAYER_PYINSTALLER_MODEL_REVISION": KOKORO_REVISION,
            "PYTHONHASHSEED": "0",
            "SOURCE_DATE_EPOCH": "0",
        }
    )
    run(
        [
            str(python_executable),
            "-m",
            "PyInstaller",
            "--noconfirm",
            "--clean",
            "--distpath",
            str(output_root),
            "--workpath",
            str(work_root / "pyinstaller-work"),
            str(SPEC_FILE),
        ],
        env=build_environment,
    )
    executable = output_root / BUNDLE_NAME / EXECUTABLE_NAME
    if not executable.is_file():
        raise RuntimeError(f"Frozen sidecar executable is missing: {executable}")
    return executable


def choose_loopback_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as listener:
        listener.bind(("127.0.0.1", 0))
        return int(listener.getsockname()[1])


def request_json(
    opener, url: str, deadline: float, launch_secret: str
) -> dict[str, object]:
    last_error: Exception | None = None
    while time.monotonic() < deadline:
        try:
            request = Request(url, headers={TTS_SECRET_HEADER: launch_secret})
            with opener.open(request, timeout=2) as response:
                return json.loads(response.read().decode("utf-8"))
        except (HTTPError, URLError, TimeoutError, ConnectionError) as error:
            last_error = error
            time.sleep(0.25)
    raise RuntimeError(f"Frozen sidecar did not become healthy: {last_error}")


def assert_health_contract(health: dict[str, object], ready: bool) -> None:
    if set(health) != {"component", "protocolVersion", "ready"} or health != {
        "component": "adaptive-audio-player-local-tts",
        "protocolVersion": 1,
        "ready": ready,
    }:
        raise RuntimeError("Frozen sidecar returned an incompatible health contract.")


def packaged_model_root(executable: Path) -> Path:
    return (
        executable.parent
        / "_internal"
        / "models"
        / "kokoro"
        / KOKORO_REVISION
    )


def freeze_model_resources(resource_root: Path) -> dict[str, object]:
    verified_paths = verify_kokoro_resources(resource_root)
    for path in verified_paths.values():
        path.chmod(stat.S_IREAD | stat.S_IRGRP | stat.S_IROTH)

    read_only = all(
        not path.stat().st_mode & stat.S_IWRITE for path in verified_paths.values()
    )
    if not read_only:
        raise RuntimeError("Packaged model resources are not read-only.")

    verify_kokoro_resources(resource_root)
    return {
        "root": str(resource_root),
        "revision": KOKORO_REVISION,
        "resourceCount": len(verified_paths),
        "readOnly": read_only,
        "sha256": KOKORO_RESOURCE_SHA256,
    }


def frozen_runtime_environment(
    executable: Path,
    model_root: Path,
    runtime_root: Path,
    port: int,
    launch_secret: str,
) -> dict[str, str]:
    runtime_environment = os.environ.copy()
    windows_root = Path(os.environ.get("SystemRoot", r"C:\Windows"))
    runtime_path = os.pathsep.join(
        [str(executable.parent), str(windows_root / "System32")]
    )
    runtime_environment.update(
        {
            "ADAPTIVE_AUDIO_PLAYER_TTS_DATA_ROOT": str(runtime_root),
            "ADAPTIVE_AUDIO_PLAYER_TTS_DEVICE": "cpu",
            "ADAPTIVE_AUDIO_PLAYER_TTS_HOST": "127.0.0.1",
            "ADAPTIVE_AUDIO_PLAYER_TTS_MODEL_ROOT": str(model_root),
            "ADAPTIVE_AUDIO_PLAYER_TTS_PORT": str(port),
            "ADAPTIVE_AUDIO_PLAYER_TTS_SECRET": launch_secret,
            "HF_HUB_OFFLINE": "1",
            "HTTPS_PROXY": "http://127.0.0.1:9",
            "HTTP_PROXY": "http://127.0.0.1:9",
            "NO_PROXY": "127.0.0.1,localhost",
            "PATH": runtime_path,
            "PYTHONNOUSERSITE": "1",
            "TRANSFORMERS_OFFLINE": "1",
        }
    )
    for name in (
        "ADAPTIVE_AUDIO_PLAYER_TTS_HF_HOME",
        "ADAPTIVE_AUDIO_PLAYER_TTS_OFFLINE",
        "HF_HOME",
        "PYTHONHOME",
        "PYTHONPATH",
    ):
        runtime_environment.pop(name, None)
    if shutil.which("python", path=runtime_path) is not None:
        raise RuntimeError("The frozen-runtime PATH unexpectedly contains Python.")
    return runtime_environment


def verify_offline_failure(
    executable: Path,
    work_root: Path,
) -> dict[str, object]:
    port = choose_loopback_port()
    launch_secret = secrets.token_hex(32)
    missing_model_root = work_root / "missing-model-resources"
    missing_model_root.mkdir()
    runtime_environment = frozen_runtime_environment(
        executable,
        missing_model_root,
        work_root / "failure-runtime-data",
        port,
        launch_secret,
    )
    log_path = work_root / "frozen-sidecar-offline-failure.log"
    creation_flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    with log_path.open("w+", encoding="utf-8") as log_file:
        process = subprocess.Popen(
            [str(executable)],
            cwd=executable.parent,
            env=runtime_environment,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            creationflags=creation_flags,
        )
        try:
            opener = build_opener(ProxyHandler({}))
            deadline = time.monotonic() + 60
            health = request_json(
                opener,
                f"http://127.0.0.1:{port}/health",
                deadline,
                launch_secret,
            )
            assert_health_contract(health, False)

            payload = json.dumps(
                {"text": "This render must fail offline.", "voice": "marlowe"}
            ).encode("utf-8")
            request = Request(
                f"http://127.0.0.1:{port}/render",
                data=payload,
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    TTS_SECRET_HEADER: launch_secret,
                },
            )
            try:
                with opener.open(request, timeout=30):
                    pass
            except HTTPError as error:
                response_body = json.loads(error.read().decode("utf-8"))
                status_code = error.code
            else:
                raise RuntimeError(
                    "Frozen sidecar rendered without approved model resources."
                )

            detail = str(response_body.get("detail", ""))
            if status_code != 503 or "missing" not in detail.lower():
                raise RuntimeError(
                    "Frozen sidecar did not return the expected offline resource error."
                )
            return {
                "httpStatus": status_code,
                "health": health,
                "error": detail,
            }
        finally:
            if process.poll() is None:
                try:
                    process.send_signal(signal.CTRL_BREAK_EVENT)
                    process.wait(timeout=10)
                except (OSError, subprocess.TimeoutExpired):
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
            log_file.flush()
            if process.returncode not in {0, None}:
                log_file.seek(0)
                log_output = log_file.read().strip()
                if log_output:
                    print(log_output, file=sys.stderr)


def verify_real_sample(
    executable: Path,
    model_root: Path,
    work_root: Path,
) -> dict[str, object]:
    port = choose_loopback_port()
    launch_secret = secrets.token_hex(32)
    runtime_root = work_root / "runtime-data"
    runtime_environment = frozen_runtime_environment(
        executable, model_root, runtime_root, port, launch_secret
    )

    log_path = work_root / "frozen-sidecar.log"
    creation_flags = getattr(subprocess, "CREATE_NEW_PROCESS_GROUP", 0)
    with log_path.open("w+", encoding="utf-8") as log_file:
        process = subprocess.Popen(
            [str(executable)],
            cwd=executable.parent,
            env=runtime_environment,
            stdin=subprocess.DEVNULL,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            creationflags=creation_flags,
        )
        try:
            opener = build_opener(ProxyHandler({}))
            deadline = time.monotonic() + 60
            health = request_json(
                opener,
                f"http://127.0.0.1:{port}/health",
                deadline,
                launch_secret,
            )
            if process.poll() is not None:
                raise RuntimeError("Frozen sidecar exited before the sample proof.")
            assert_health_contract(health, True)

            payload = json.dumps(
                {
                    "text": "The river moved quietly beneath the morning light.",
                    "voice": "marlowe",
                    "speed": 1.0,
                }
            ).encode("utf-8")
            request = Request(
                f"http://127.0.0.1:{port}/render",
                data=payload,
                method="POST",
                headers={
                    "Content-Type": "application/json",
                    TTS_SECRET_HEADER: launch_secret,
                },
            )
            with opener.open(request, timeout=180) as response:
                audio = response.read()
                content_type = response.headers.get_content_type()
            if content_type != "audio/wav":
                raise RuntimeError(
                    f"Frozen sidecar returned unexpected content type: {content_type}"
                )
            if len(audio) <= 44 or audio[:4] != b"RIFF" or audio[8:12] != b"WAVE":
                raise RuntimeError("Frozen sidecar did not return a valid WAV sample.")
            return {
                "health": health,
                "offline": True,
                "pythonOnPath": False,
                "sampleBytes": len(audio),
                "sampleSha256": hashlib.sha256(audio).hexdigest(),
            }
        finally:
            if process.poll() is None:
                try:
                    process.send_signal(signal.CTRL_BREAK_EVENT)
                    process.wait(timeout=10)
                except (OSError, subprocess.TimeoutExpired):
                    process.terminate()
                    try:
                        process.wait(timeout=5)
                    except subprocess.TimeoutExpired:
                        process.kill()
                        process.wait(timeout=5)
            log_file.flush()
            if process.returncode not in {0, None}:
                log_file.seek(0)
                log_output = log_file.read().strip()
                if log_output:
                    print(log_output, file=sys.stderr)


def inventory_bundle(executable: Path) -> dict[str, object]:
    bundle_root = executable.parent
    entries = list(bundle_root.rglob("*"))
    links = [path for path in entries if path.is_symlink()]
    if links:
        raise RuntimeError(f"Frozen sidecar contains symlinks: {links[0]}")
    files = sorted(path for path in entries if path.is_file())
    return {
        "bundleDirectory": str(bundle_root),
        "bundleBytes": sum(path.stat().st_size for path in files),
        "bundleFiles": len(files),
        "executable": str(executable),
        "executableSha256": sha256_file(executable),
    }


def main() -> None:
    arguments = parse_arguments()
    require_supported_builder()
    output_root = require_new_directory(arguments.output, "Output directory")
    model_source = require_existing_directory(
        arguments.model_source, "Model source directory"
    )
    verify_kokoro_resources(model_source)
    wheelhouse = (
        require_existing_directory(arguments.wheelhouse, "Wheelhouse")
        if arguments.wheelhouse is not None
        else None
    )

    with tempfile.TemporaryDirectory(prefix="adaptive-audio-sidecar-build-") as temporary:
        work_root = Path(temporary)
        python_executable, install_environment = install_build_environment(
            work_root, wheelhouse
        )
        executable = build_bundle(
            python_executable,
            install_environment,
            work_root,
            output_root,
            model_source,
        )
        model_root = packaged_model_root(executable)
        model_evidence = freeze_model_resources(model_root)
        evidence = inventory_bundle(executable)
        evidence["modelResources"] = model_evidence
        evidence["offlineFailureProof"] = verify_offline_failure(
            executable, work_root
        )
        evidence["runtimeProof"] = verify_real_sample(
            executable, model_root, work_root
        )
        print(json.dumps(evidence, indent=2, sort_keys=True))


if __name__ == "__main__":
    main()
