"""Regression checks for streamed-map maintenance ownership."""
import runpy
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

Scanner = runpy.run_path(str(Path(__file__).resolve().parents[1] / 'scan-bundled-peak-data.py'))['BundledScanner']


class BundledScannerTests(unittest.TestCase):
    def test_exclusive_lock_is_released_on_success_and_failure(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            scanner = Scanner.__new__(Scanner)
            scanner._run_bounded = lambda: 'completed'
            lock = root / 'artifacts/peak-maintenance.lock'
            with patch.dict(Scanner.run_bounded.__globals__, ROOT=root / 'scripts'):
                self.assertEqual(scanner.run_bounded(), 'completed')
                self.assertFalse(lock.exists())
                def fail():
                    raise ValueError('incomplete map')
                scanner._run_bounded = fail
                with self.assertRaisesRegex(ValueError, 'incomplete map'):
                    scanner.run_bounded()
                self.assertFalse(lock.exists())

    def test_another_job_lock_is_never_removed(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            lock = root / 'artifacts/peak-maintenance.lock'
            lock.parent.mkdir()
            lock.write_text('other owner')
            scanner = Scanner.__new__(Scanner)
            scanner._run_bounded = lambda: self.fail('Overlapping extraction started')
            with patch.dict(Scanner.run_bounded.__globals__, ROOT=root / 'scripts'):
                with self.assertRaises(FileExistsError):
                    scanner.run_bounded()
            self.assertEqual(lock.read_text(), 'other owner')


if __name__ == '__main__':
    unittest.main()
