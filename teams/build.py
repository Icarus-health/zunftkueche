"""Deterministic personal-only Teams package; Python standard library only."""
import argparse
import io
import ipaddress
import json
from pathlib import Path
import struct
import sys
from urllib.parse import urlsplit
import uuid
import zipfile
import zlib

HERE = Path(__file__).resolve().parent
WRAPPER_ID = 'a93e06f2-e1e8-4572-bb29-a52acc9c2c7a'
PLAY_URL = ('https://apps.powerapps.com/play/e/5684204c-3254-ec15-93f4-276ec50cc65b/'
            'app/bfec495e-c223-4176-89a8-3e4d631337ae?tenantId=1dcbc0d3-e9b9-4622-bbd7-811ff1c1f7e9')
SCHEMA = 'https://developer.microsoft.com/json-schemas/teams/v1.16/MicrosoftTeams.schema.json'
LINK_KEYS = ('websiteUrl', 'privacyUrl', 'termsOfUseUrl')


def approved_links(metadata):
    for key in LINK_KEYS:
        value = metadata.get(key)
        if not isinstance(value, str):
            raise ValueError(f'{key}: explicitly approved HTTPS public URL required (no placeholders)')
        try:
            url = urlsplit(value if isinstance(value, str) else '')
            host = url.hostname or ''
            host.encode('ascii')
            placeholder = any(word in value.lower() for word in ('example.', 'placeholder', 'pending', 'changeme', 'localhost', 'todo', '<', '>', '{', '}'))
            invalid = (not value or value != value.strip() or any(c.isspace() for c in value)
                       or url.scheme != 'https' or '.' not in host or url.username or url.password
                       or url.port not in (None, 443) or placeholder)
            try:
                ipaddress.ip_address(host)
                invalid = True
            except ValueError:
                pass
            if invalid:
                raise ValueError()
        except (TypeError, ValueError, UnicodeError):
            raise ValueError(f'{key}: explicitly approved HTTPS public URL required (no placeholders)') from None
    return {key: metadata[key] for key in LINK_KEYS}


def manifest(metadata):
    return {
        '$schema': SCHEMA, 'manifestVersion': '1.16', 'version': '0.1.0', 'id': WRAPPER_ID,
        'packageName': 'de.schelmenzunft.zunftkueche.private',
        'developer': {'name': 'Schelmenzunft Staufen', **approved_links(metadata)},
        'name': {'short': 'Zunftküche', 'full': 'Zunftküche – privater Teams-Test'},
        'description': {'short': 'Privater experimenteller Zugang zur Zunftküche.',
                        'full': 'Experimenteller persönlicher Zugang zur bestehenden Zunftküche in Power Apps. Nur für den freigegebenen Testzugang.'},
        'icons': {'color': 'color.png', 'outline': 'outline.png'}, 'accentColor': '#264E43',
        'staticTabs': [{'entityId': 'zunftkueche', 'name': 'Zunftküche', 'contentUrl': PLAY_URL + '&source=teamstab',
                        'websiteUrl': PLAY_URL, 'scopes': ['personal']}],
        'validDomains': ['apps.powerapps.com'],
    }


def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))


def icon(size, outline):
    # Original geometric stockpot: body, lid, handles. No organizational logo.
    rows = []
    for y in range(size):
        row = bytearray()
        for x in range(size):
            px, py = (x + .5) / size, (y + .5) / size
            pot = (.28 <= px <= .72 and .38 <= py <= .72)
            lid = (.25 <= px <= .75 and .30 <= py <= .36) or (.44 <= px <= .56 and .24 <= py <= .30)
            handles = ((.19 <= px <= .28 or .72 <= px <= .81) and .42 <= py <= .49)
            painted = pot or lid or handles
            row.extend((255, 255, 255, 255) if painted else ((0, 0, 0, 0) if outline else (38, 78, 67, 255)))
        rows.append(b'\x00' + row)
    return (b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', size, size, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(b''.join(rows), 9)) + chunk(b'IEND', b''))


def validate_icon(data, size, outline):
    if data[:8] != b'\x89PNG\r\n\x1a\n':
        raise ValueError('Invalid PNG signature')
    offset, compressed, header = 8, b'', None
    while offset < len(data):
        length = struct.unpack('>I', data[offset:offset + 4])[0]
        kind, payload = data[offset + 4:offset + 8], data[offset + 8:offset + 8 + length]
        crc = struct.unpack('>I', data[offset + 8 + length:offset + 12 + length])[0]
        if zlib.crc32(kind + payload) != crc:
            raise ValueError('PNG CRC mismatch')
        if kind == b'IHDR':
            header = struct.unpack('>IIBBBBB', payload)
        elif kind == b'IDAT':
            compressed += payload
        offset += length + 12
    if header != (size, size, 8, 6, 0, 0, 0):
        raise ValueError('PNG dimensions/encoding mismatch')
    raw = zlib.decompress(compressed)
    if len(raw) != size * (size * 4 + 1):
        raise ValueError('PNG raster length mismatch')
    pixels = []
    for y in range(size):
        row = raw[y * (size * 4 + 1):(y + 1) * (size * 4 + 1)]
        if row[0] != 0:
            raise ValueError('Unsupported PNG filter')
        pixels.extend(tuple(row[i:i + 4]) for i in range(1, len(row), 4))
    if outline:
        if set(pixels) != {(255, 255, 255, 255), (0, 0, 0, 0)}:
            raise ValueError('Outline must contain opaque white artwork and transparent background')
    elif any(pixel[3] != 255 for pixel in pixels):
        raise ValueError('Color icon must be opaque')


def build(metadata, output):
    document = manifest(metadata)
    uuid.UUID(document['id'])
    if document['id'] in ('ba1cabe6-dfd2-4334-96c0-0dcdf86e18e5', 'bfec495e-c223-4176-89a8-3e4d631337ae'):
        raise ValueError('Wrapper identity must be separate')
    files = {'manifest.json': (json.dumps(document, ensure_ascii=False, indent=2) + '\n').encode()}
    for name, size, outline in [('color.png', 192, False), ('outline.png', 32, True)]:
        data = (HERE / 'icons' / name).read_bytes()
        validate_icon(data, size, outline)
        if data != icon(size, outline):
            raise ValueError(f'{name}: not the reviewed deterministic artwork')
        files[name] = data
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, 'w', compression=zipfile.ZIP_STORED) as archive:
        for name, data in files.items():
            info = zipfile.ZipInfo(name, date_time=(2026, 10, 15, 0, 0, 0))
            info.external_attr = 0o100644 << 16
            archive.writestr(info, data)
    with output.open('xb') as destination:
        destination.write(buffer.getvalue())


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--metadata', type=Path, required=True, help='JSON with explicitly approved websiteUrl, privacyUrl, termsOfUseUrl')
    parser.add_argument('--output', type=Path, required=True, help='New ZIP path; never overwritten')
    args = parser.parse_args()
    try:
        build(json.loads(args.metadata.read_text()), args.output)
    except (OSError, ValueError, TypeError) as error:
        parser.exit(1, f'Package refused: {error}\n')
    print(f'Created experimental personal-only package: {args.output}')

if __name__ == '__main__':
    main()
