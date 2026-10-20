"""Unit tests for version metadata provider."""

import unittest
from slmstudio.version import get_version_info


class TestVersionInfo(unittest.TestCase):
    def test_version_info_fields(self):
        info = get_version_info()
        self.assertIn("version", info)
        self.assertIn("python", info)
        self.assertIn("platform", info)
        self.assertTrue(info["local_first"])


if __name__ == "__main__":
    unittest.main()
