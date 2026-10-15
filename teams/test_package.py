"""Real CLI boundary checks: missing metadata and accidental replacement are regressions."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
import zipfile

HERE = Path(__file__).resolve().parent

class PackageTests(unittest.TestCase):
    def run_builder(self, config, output):
        return subprocess.run([sys.executable, str(HERE / 'build.py'), '--metadata', str(config), '--output', str(output)], capture_output=True, text=True)

    def test_missing_and_placeholder_metadata_never_creates_package(self):
        with tempfile.TemporaryDirectory() as directory:
            config, output = Path(directory) / 'meta.json', Path(directory) / 'app.zip'
            for metadata in [{}, {'websiteUrl': 'https://example.com', 'privacyUrl': 'https://example.com/privacy', 'termsOfUseUrl': 'https://example.com/terms'}]:
                config.write_text(json.dumps(metadata))
                result = self.run_builder(config, output)
                self.assertNotEqual(result.returncode, 0)
                self.assertIn('approved HTTPS', result.stderr)
                self.assertFalse(output.exists())

    def test_package_identity_scope_and_no_overwrite(self):
        with tempfile.TemporaryDirectory() as directory:
            output = Path(directory) / 'app.zip'
            result = self.run_builder(HERE / 'approved-links.json', output)
            self.assertEqual(result.returncode, 0, result.stderr)
            original = output.read_bytes()
            second = Path(directory) / 'second.zip'
            self.assertEqual(self.run_builder(HERE / 'approved-links.json', second).returncode, 0)
            self.assertEqual(second.read_bytes(), original)
            with zipfile.ZipFile(output) as archive:
                self.assertEqual(set(archive.namelist()), {'manifest.json', 'color.png', 'outline.png'})
                manifest = json.loads(archive.read('manifest.json'))
                self.assertEqual(manifest['staticTabs'][0]['scopes'], ['personal'])
                self.assertEqual(manifest['validDomains'], ['apps.powerapps.com'])
                self.assertNotIn('permissions', manifest)
                self.assertNotIn('webApplicationInfo', manifest)
                self.assertEqual(manifest['staticTabs'][0]['contentUrl'], 'https://apps.powerapps.com/play/e/5684204c-3254-ec15-93f4-276ec50cc65b/app/bfec495e-c223-4176-89a8-3e4d631337ae?tenantId=1dcbc0d3-e9b9-4622-bbd7-811ff1c1f7e9&source=teamstab')
            self.assertNotEqual(self.run_builder(HERE / 'approved-links.json', output).returncode, 0)
            self.assertEqual(output.read_bytes(), original)

if __name__ == '__main__':
    unittest.main()
