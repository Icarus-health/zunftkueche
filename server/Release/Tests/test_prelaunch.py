"""Pure pre-load negative tests. No .NET/authentication/provider is loaded."""
import importlib.util,json,tempfile,unittest
from pathlib import Path
spec=importlib.util.spec_from_file_location('gate',Path(__file__).parents[1]/'prelaunch.py')
gate=importlib.util.module_from_spec(spec);spec.loader.exec_module(gate)
class GateTests(unittest.TestCase):
    def test_duplicate_json(self):
        with self.assertRaises(gate.Rejected):json.loads('{"x":1,"x":2}',object_pairs_hook=gate.unique)
    def test_missing_manifest(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(Exception):gate.verify(Path(d),Path(d),'a'*64,'b'*64,'c'*64,'d'*64)
    def test_pin_not_self_authority(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'m.json').write_text('{"files":[]}')
            with self.assertRaises(gate.Rejected):gate.load_pinned(p,'m.json','a'*64)
    def test_tampered_bytes(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'x').write_bytes(b'changed')
            with self.assertRaises(gate.Rejected):gate.entries(p,{'files':[{'path':'x','bytes':3,'sha256':gate.digest(b'old')}]},{'x'})
    def test_missing_entry(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(gate.Rejected):gate.entries(Path(d),{'files':[]},{'x'})
    def test_duplicate_entry(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'x').write_bytes(b'x');e={'path':'x','bytes':1,'sha256':gate.digest(b'x')}
            with self.assertRaises(gate.Rejected):gate.entries(p,{'files':[e,e]},{'x'})
    def test_extra_entry(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(gate.Rejected):gate.entries(Path(d),{'files':[{'path':'extra','bytes':0,'sha256':'a'*64}]},{'x'})
    def test_symlink(self):
        with tempfile.TemporaryDirectory() as d:
            p=Path(d);(p/'a').write_bytes(b'x');(p/'b').symlink_to(p/'a')
            with self.assertRaises(gate.Rejected):gate.trusted_bytes(p,'b')
    def test_parent_escape(self):
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(gate.Rejected):gate.trusted_bytes(Path(d),'../x')
    def test_absolute_path(self):
        with self.assertRaises(gate.Rejected):gate.trusted_bytes(Path('/tmp'),'/etc/passwd')
    def test_compile_closure_current_policy(self):
        self.assertIn('../Intake/ReceiptIntake.cs',gate.COMPILE);self.assertIn('../Documents/DocumentProtocol.cs',gate.COMPILE)
        self.assertIn('../Policy/BackupProtocol.cs',gate.COMPILE);self.assertFalse(any('FrozenPolicy' in p for p in gate.COMPILE))
    def test_default_no_auth(self):
        text=(Path(__file__).parents[1]/'prelaunch.py').read_text();self.assertLess(text.index("if args.mode=='plan'"),text.index('os.execve'))
if __name__=='__main__':unittest.main()
