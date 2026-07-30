# -*- mode: python ; coding: utf-8 -*-

import os
import re
from importlib.metadata import distributions
from pathlib import Path

from PyInstaller.utils.hooks import collect_all, copy_metadata


PROJECT_ROOT = Path(SPECPATH).resolve().parent
ENTRY_PATH = Path(
    os.environ.get("ADAPTIVE_AUDIO_PLAYER_PYINSTALLER_ENTRY", "")
).resolve()
MODEL_ROOT_VALUE = os.environ.get(
    "ADAPTIVE_AUDIO_PLAYER_PYINSTALLER_MODEL_ROOT", ""
).strip()
MODEL_REVISION = os.environ.get(
    "ADAPTIVE_AUDIO_PLAYER_PYINSTALLER_MODEL_REVISION", ""
).strip()

if not ENTRY_PATH.is_file():
    raise ValueError(
        "ADAPTIVE_AUDIO_PLAYER_PYINSTALLER_ENTRY must name the generated "
        "sidecar bootstrap file."
    )
if not MODEL_ROOT_VALUE or not MODEL_REVISION:
    raise ValueError(
        "The model root and pinned revision must be provided by the sidecar builder."
    )

MODEL_ROOT = Path(MODEL_ROOT_VALUE).resolve()
MODEL_FILES = (
    "kokoro-v1_0.pth",
    "config.json",
    "voices/af_heart.pt",
    "voices/af_bella.pt",
    "voices/am_michael.pt",
)


def canonical_distribution_name(value):
    return re.sub(r"[-_.]+", "-", value).lower()


def read_runtime_lock():
    requirements_path = PROJECT_ROOT / "tts_sidecar" / "requirements.txt"
    locked = {}
    for raw_line in requirements_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith(("#", "--")):
            continue
        requirement = line.removesuffix("\\").strip()
        if "==" in requirement:
            raw_name, version = requirement.split("==", 1)
            name = raw_name.split("[", 1)[0]
        elif " @ " in requirement:
            name, url = requirement.split(" @ ", 1)
            match = re.search(r"-([0-9]+(?:\.[0-9]+)+)-py", url)
            if match is None:
                raise ValueError(f"Cannot read locked version from {requirement}")
            version = match.group(1)
        else:
            raise ValueError(f"Runtime requirement is not exact: {requirement}")
        key = canonical_distribution_name(name)
        if key in locked:
            raise ValueError(f"Duplicate runtime requirement: {name}")
        locked[key] = version.strip()
    return locked


runtime_lock = read_runtime_lock()
installed_distributions = {
    canonical_distribution_name(distribution.metadata["Name"]): distribution
    for distribution in distributions()
    if distribution.metadata["Name"]
}
for distribution_name, expected_version in runtime_lock.items():
    distribution = installed_distributions.get(distribution_name)
    if distribution is None:
        raise ValueError(
            f"Locked runtime distribution is not installed: {distribution_name}"
        )
    if distribution.version != expected_version:
        raise ValueError(
            f"Locked runtime distribution drift for {distribution_name}: "
            f"expected {expected_version}, received {distribution.version}"
        )

datas = []
binaries = []
hiddenimports = [
    "tts_sidecar.core",
    "tts_sidecar.server",
    "uvicorn.lifespan.off",
    "uvicorn.lifespan.on",
    "uvicorn.logging",
    "uvicorn.loops.auto",
    "uvicorn.protocols.http.auto",
    "uvicorn.protocols.websockets.auto",
]

for distribution_name in sorted(runtime_lock):
    distribution = installed_distributions[distribution_name]
    for source, destination in copy_metadata(distribution.metadata["Name"]):
        audit_destination = (
            Path("license-metadata") / "python" / Path(destination).name
        )
        datas.append((source, audit_destination.as_posix()))

model_destination = Path("models") / "kokoro" / MODEL_REVISION
for relative_name in MODEL_FILES:
    source_path = MODEL_ROOT / relative_name
    if not source_path.is_file():
        raise ValueError(f"Approved model resource is missing: {source_path}")
    destination = model_destination / Path(relative_name).parent
    datas.append((str(source_path), destination.as_posix()))

for package_name in (
    "en_core_web_sm",
    "espeakng_loader",
    "kokoro",
    "language_tags",
    "misaki",
):
    package_datas, package_binaries, package_hiddenimports = collect_all(
        package_name
    )
    datas.extend(package_datas)
    binaries.extend(package_binaries)
    hiddenimports.extend(package_hiddenimports)

analysis = Analysis(
    [str(ENTRY_PATH)],
    pathex=[str(PROJECT_ROOT)],
    binaries=binaries,
    datas=datas,
    hiddenimports=hiddenimports,
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=["IPython", "matplotlib", "pytest", "tkinter"],
    noarchive=False,
    optimize=1,
)
python_archive = PYZ(analysis.pure)

executable = EXE(
    python_archive,
    analysis.scripts,
    [],
    exclude_binaries=True,
    name="AdaptiveAudioPlayerTTS",
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=False,
    console=True,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
)

bundle = COLLECT(
    executable,
    analysis.binaries,
    analysis.datas,
    strip=False,
    upx=False,
    upx_exclude=[],
    name="AdaptiveAudioPlayerTTS",
)
