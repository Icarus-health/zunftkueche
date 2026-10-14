"""Verify runtime dependency isolation in the real generated plugin NuGet package."""
from pathlib import Path
from zipfile import ZipFile
from hashlib import sha256
import json
package = Path(__file__).parent / 'artifacts/Zunftkueche.Dataverse.1.0.0.nupkg'
with ZipFile(package) as archive:
    dlls = sorted(n for n in archive.namelist() if n.lower().endswith('.dll'))
    assert dlls == ['lib/net462/Kitchen.Dataverse.dll', 'lib/net462/Newtonsoft.Json.dll'], dlls
    assert not any('/Tests/' in n or n.endswith('.json') for n in archive.namelist())
report = {'package': package.name, 'sha256': sha256(package.read_bytes()).hexdigest(), 'runtimeAssemblies': dlls, 'compiledTarget': 'net462', 'liveDataverseVerified': False}
(package.parent / 'package-verification.json').write_text(json.dumps(report, indent=2) + '\n')
print(json.dumps(report, indent=2))
