# Third-Party Notices

## Optional Chatterbox High Quality narration

- `chatterbox-tts` 0.1.7, copyright (c) 2025 Resemble AI, is licensed
  under the MIT License. The complete license text is committed at
  `chatterbox_sidecar/LICENSE` and copied into each explicit local runtime
  installation.
- Model files come from `ResembleAI/chatterbox` at immutable revision
  `5bb1f6ee58e50c3b8d408bc82a6d3740c2db6e18`. The model card identifies the
  model as MIT licensed. Exact approved file sizes and SHA-256 digests are in
  `chatterbox_sidecar/runtime-manifest.json`.
- Chatterbox-generated audio includes Resemble AI's PerTh watermark. Adaptive
  Audio Player uses only the model's bundled default conditioning and does not
  accept reference audio or expose voice cloning.

This reviewed inventory applies to Adaptive Audio Player 0.1.0 for Windows x64.
The release generator fails if the packaged component set, pinned source locks,
artifact hashes, or license classifications differ from this file.

Full license and attribution texts remain packaged beside their components:

- Electron and Chromium: `LICENSE` and `LICENSES.chromium.html`.
- Node.js: `resources/runtime/node/LICENSE`.
- Python packages: `resources/runtime/tts/_internal/license-metadata/python/`.
- libsndfile: `resources/runtime/tts/_internal/_soundfile_data/COPYING`.

eSpeak NG 1.52.0 is distributed under GPL-3.0-or-later. Corresponding source
for the exact upstream release is available at
https://github.com/espeak-ng/espeak-ng/tree/1.52.0.

Kokoro model resources are from `hexgrad/Kokoro-82M` at immutable revision
`f3ff3571791e39611d31c381e3a41a3af07b4987` and are classified Apache-2.0.

## Build toolchain

| Component | Version | License |
| --- | --- | --- |
| @electron/fuses | 2.1.3 | MIT |
| @electron/packager | 20.0.0 | MIT |
| PyInstaller | 6.21.0 | GPL-2.0-only WITH PyInstaller-Bootloader-exception |
| Windows SDK | 10.0.26100.7705 | Microsoft Windows SDK terms |

## Bundled native libraries

| Component | Version | License |
| --- | --- | --- |
| eSpeak NG | 1.52.0 | GPL-3.0-or-later |
| libsndfile | 1.2.2 | LGPL-2.1-or-later |
| Microsoft runtime: MSVCP140_ATOMIC_WAIT.dll | 14.50.35719.0 | Microsoft Visual C++ Runtime terms |
| Microsoft runtime: msvcp140-a4c2229bdc2a2a630acdc095b4d86008.dll | 14.40.33810.0 | Microsoft Visual C++ Runtime terms |
| Microsoft runtime: msvcp140.dll | 14.44.35208.0 | Microsoft Visual C++ Runtime terms |
| Microsoft runtime: ucrtbase.dll | 10.0.22621.5040 | Microsoft Windows SDK terms |
| Microsoft runtime: vcruntime140_1.dll | 14.44.35208.0 | Microsoft Visual C++ Runtime terms |
| Microsoft runtime: vcruntime140.dll | 14.44.35208.0 | Microsoft Visual C++ Runtime terms |

## Desktop and language runtimes

| Component | Version | License |
| --- | --- | --- |
| Chromium bundled components | n/a | Chromium bundled third-party notices |
| CPython | 3.12.10 | PSF-2.0 |
| Electron | 43.1.1 | MIT |
| Node.js | 22.23.1 | Node.js bundled license notices |

## Kokoro model resources

| Component | Version | License |
| --- | --- | --- |
| hexgrad/Kokoro-82M:config.json | f3ff3571791e39611d31c381e3a41a3af07b4987 | Apache-2.0 |
| hexgrad/Kokoro-82M:kokoro-v1_0.pth | f3ff3571791e39611d31c381e3a41a3af07b4987 | Apache-2.0 |
| hexgrad/Kokoro-82M:voices/af_bella.pt | f3ff3571791e39611d31c381e3a41a3af07b4987 | Apache-2.0 |
| hexgrad/Kokoro-82M:voices/af_heart.pt | f3ff3571791e39611d31c381e3a41a3af07b4987 | Apache-2.0 |
| hexgrad/Kokoro-82M:voices/am_michael.pt | f3ff3571791e39611d31c381e3a41a3af07b4987 | Apache-2.0 |
| hexgrad/Kokoro-82M | f3ff3571791e39611d31c381e3a41a3af07b4987 | Apache-2.0 |

## Next.js compiled dependencies

| Component | Version | License |
| --- | --- | --- |
| @babel/runtime | 7.27.0 | MIT |
| @edge-runtime/cookies | 6.0.0 | MIT |
| @edge-runtime/ponyfill | 4.0.0 | MIT |
| @edge-runtime/primitives | 6.0.0 | MIT |
| @vercel/og | 0.11.1 | MPL-2.0 |
| react-is | 19.3.0-canary-3f0b9e61-20260317 | MIT |
| react-refresh | 0.12.0 | MIT |
| regenerator-runtime | 0.13.4 | MIT |
| server-only | 0.0.1 | MIT |

## Node.js runtime packages

| Component | Version | License |
| --- | --- | --- |
| @img/colour | 1.1.0 | MIT |
| @img/sharp-win32-x64 | 0.35.0 | Apache-2.0 AND LGPL-3.0-or-later |
| @next/env | 16.2.6 | MIT |
| @swc/helpers | 0.5.15 | Apache-2.0 |
| @zip.js/zip.js | 2.8.31 | MIT |
| client-only | 0.0.1 | MIT |
| detect-libc | 2.1.2 | Apache-2.0 |
| next | 16.2.6 | MIT |
| react-dom | 19.2.3 | MIT |
| react | 19.2.3 | MIT |
| semver | 7.7.4 | ISC |
| sharp | 0.35.0 | Apache-2.0 |
| styled-jsx | 5.1.6 | MIT |

## Project-owned media and fonts

| Component | Version | License |
| --- | --- | --- |
| the-adventures-of-sherlock-holmes-ch01.mp3 | n/a | Project-owned asset |

## Python runtime packages

| Component | Version | License |
| --- | --- | --- |
| addict | 2.4.0 | MIT |
| annotated-doc | 0.0.4 | MIT |
| annotated-types | 0.7.0 | MIT |
| anyio | 4.14.2 | MIT |
| attrs | 26.1.0 | MIT |
| babel | 2.18.0 | BSD-3-Clause |
| blis | 1.3.3 | BSD-3-Clause |
| catalogue | 2.0.10 | MIT |
| certifi | 2026.7.22 | MPL-2.0 |
| cffi | 2.1.0 | MIT-0 |
| charset-normalizer | 3.4.9 | MIT |
| click | 8.4.2 | BSD-3-Clause |
| cloudpathlib | 0.24.0 | MIT |
| colorama | 0.4.6 | BSD-3-Clause |
| confection | 1.3.3 | MIT |
| csvw | 4.1.0 | Apache-2.0 |
| curated-tokenizers | 0.0.9 | MIT |
| curated-transformers | 0.1.1 | MIT |
| cymem | 2.0.13 | MIT |
| dlinfo | 2.0.0 | MIT |
| docopt | 0.6.2 | MIT |
| en_core_web_sm | 3.8.0 | MIT |
| espeakng-loader | 0.2.4 | MIT |
| fastapi | 0.139.0 | MIT |
| filelock | 3.32.0 | MIT |
| fsspec | 2026.6.0 | BSD-3-Clause |
| h11 | 0.16.0 | MIT |
| hf-xet | 1.5.2 | Apache-2.0 |
| httpcore | 1.0.9 | BSD-3-Clause |
| httptools | 0.8.0 | MIT |
| httpx | 0.28.1 | BSD-3-Clause |
| huggingface_hub | 1.22.0 | Apache-2.0 |
| idna | 3.18 | BSD-3-Clause |
| isodate | 0.7.2 | BSD-3-Clause |
| Jinja2 | 3.1.6 | BSD-3-Clause |
| joblib | 1.5.3 | BSD-3-Clause |
| jsonschema-specifications | 2025.9.1 | MIT |
| jsonschema | 4.26.0 | MIT |
| kokoro | 0.9.4 | Apache-2.0 |
| language-tags | 1.3.1 | MIT |
| loguru | 0.7.3 | MIT |
| markdown-it-py | 4.2.0 | MIT |
| MarkupSafe | 3.0.3 | BSD-3-Clause |
| mdurl | 0.1.2 | MIT |
| misaki | 0.9.4 | Apache-2.0 |
| mpmath | 1.3.0 | BSD-3-Clause |
| murmurhash | 1.0.15 | MIT |
| networkx | 3.6.1 | BSD-3-Clause |
| num2words | 0.5.14 | LGPL-2.1-or-later |
| numpy | 2.5.1 | BSD-3-Clause AND 0BSD AND MIT AND Zlib AND CC0-1.0 |
| packaging | 26.2 | Apache-2.0 OR BSD-2-Clause |
| phonemizer-fork | 3.3.2 | GPL-3.0-or-later |
| preshed | 3.0.13 | MIT |
| pycparser | 3.0 | BSD-3-Clause |
| pydantic_core | 2.46.4 | MIT |
| pydantic | 2.13.4 | MIT |
| Pygments | 2.20.0 | BSD-2-Clause |
| pyparsing | 3.3.2 | MIT |
| python-dateutil | 2.9.0.post0 | BSD-3-Clause OR Apache-2.0 |
| python-dotenv | 1.2.2 | BSD-3-Clause |
| PyYAML | 6.0.3 | MIT |
| rdflib | 7.6.0 | BSD-3-Clause |
| referencing | 0.37.0 | MIT |
| regex | 2026.7.19 | Apache-2.0 AND CNRI-Python |
| requests | 2.34.2 | Apache-2.0 |
| rfc3986 | 1.5.0 | Apache-2.0 |
| rich | 15.0.0 | MIT |
| rpds-py | 2026.6.3 | MIT |
| safetensors | 0.8.0 | Apache-2.0 |
| segments | 2.4.0 | Apache-2.0 |
| setuptools | 83.0.0 | MIT |
| shellingham | 1.5.4 | ISC |
| six | 1.17.0 | MIT |
| smart_open | 8.0.1 | MIT |
| soundfile | 0.14.0 | BSD-3-Clause |
| spacy-curated-transformers | 0.3.1 | MIT |
| spacy-legacy | 3.0.12 | MIT |
| spacy-loggers | 1.0.5 | MIT |
| spacy | 3.8.14 | MIT |
| srsly | 2.5.3 | MIT |
| starlette | 1.3.1 | BSD-3-Clause |
| sympy | 1.14.0 | BSD-3-Clause |
| termcolor | 3.3.0 | MIT |
| thinc | 8.3.13 | MIT |
| tokenizers | 0.22.2 | Apache-2.0 |
| torch | 2.13.0 | Apache-2.0 AND Apache-2.0 WITH LLVM-exception AND BSD-2-Clause AND BSD-3-Clause AND BSL-1.0 AND MIT |
| tqdm | 4.69.0 | MPL-2.0 AND MIT |
| transformers | 5.14.1 | Apache-2.0 |
| typer | 0.27.0 | MIT |
| typing_extensions | 4.16.0 | PSF-2.0 |
| typing-inspection | 0.4.2 | MIT |
| uritemplate | 4.2.0 | BSD-3-Clause OR Apache-2.0 |
| urllib3 | 2.7.0 | MIT |
| uvicorn | 0.50.2 | BSD-3-Clause |
| wasabi | 1.1.3 | MIT |
| watchfiles | 1.2.0 | MIT |
| weasel | 1.0.0 | MIT |
| websockets | 16.1.1 | BSD-3-Clause |
| win32_setctime | 1.2.0 | MIT |
| wrapt | 2.2.2 | BSD-2-Clause |
