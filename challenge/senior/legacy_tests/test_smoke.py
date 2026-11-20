"""Old smoke tests kept for the CI entrypoint."""

import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(__file__)))

import solution


class SmokeTest(unittest.TestCase):
    def test_module_imports(self):
        self.assertIsNotNone(solution)

    def test_public_function_exists(self):
        self.assertTrue(hasattr(solution, "check_hosts"))

    def test_public_function_is_callable(self):
        self.assertTrue(callable(solution.check_hosts))


if __name__ == "__main__":
    unittest.main()
