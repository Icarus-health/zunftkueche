"""Validate actual ZIP bytes; --schema additionally requires installed jsonschema."""
import argparse
import json
import zipfile
from build import HERE, LINK_KEYS, manifest, validate_icon

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('package')
parser.add_argument('--schema', action='store_true')
args = parser.parse_args()
with zipfile.ZipFile(args.package) as archive:
    if sorted(archive.namelist()) != ['color.png', 'manifest.json', 'outline.png']:
        raise ValueError('ZIP must have exactly three root entries, no duplicates')
    document = json.loads(archive.read('manifest.json'))
    metadata = {key: document['developer'].get(key) for key in LINK_KEYS}
    if document != manifest(metadata):
        raise ValueError('Manifest differs from reviewed personal-only permission-free contract')
    validate_icon(archive.read('color.png'), 192, False)
    validate_icon(archive.read('outline.png'), 32, True)
    if args.schema:
        import jsonschema
        schema = json.loads((HERE / 'reference' / 'MicrosoftTeams.schema.json').read_text())
        jsonschema.Draft4Validator(schema, format_checker=jsonschema.FormatChecker()).validate(document)
print('PASS: exact entries, private wrapper identity, app/tenant URLs, personal scope, no permissions, PNG dimensions/CRC/alpha' + ('; official v1.16 schema PASS' if args.schema else '; official schema NOT run'))
