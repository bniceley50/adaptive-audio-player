from __future__ import annotations

import tempfile
import unittest
from pathlib import Path

from tts_sidecar.core import is_loopback_host, resolve_voice, sha256_file


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


if __name__ == "__main__":
    unittest.main()
