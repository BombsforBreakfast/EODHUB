"""Build the public Census 2025 lookup from pre-downloaded national ZIPs.
Usage: python scripts/build-job-location-index.py <archive directory>
Archives: https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2025_Gazetteer/
No fuzzy matches, geocoder calls, credentials or job records are used.
"""
import csv
import hashlib
import io
import json
from pathlib import Path
import re
import sys
import unicodedata
import zipfile


def normalize(value):
    value = ''.join(c for c in unicodedata.normalize('NFKD', value) if not unicodedata.combining(c))
    value = re.sub(r'\bst\.?\b', 'saint', value.lower())
    value = re.sub(r'\bft\.?\b', 'fort', value)
    value = re.sub(r'\bair force base\b', 'afb', value)
    return re.sub(r'[^a-z0-9]+', ' ', value).strip()


def rows(archive):
    with zipfile.ZipFile(archive) as z:
        text = z.read(z.namelist()[0]).decode('utf-8-sig')
    return csv.DictReader(io.StringIO(text), delimiter='|' if '|' in text.splitlines()[0] else '\t')


directory = Path(sys.argv[1])
indexes = {}
hashes = {}
for kind in ('counties', 'place'):
    archive = directory / f'2025_Gaz_{kind}_national.zip'
    hashes[kind] = hashlib.sha256(archive.read_bytes()).hexdigest()
    index = {}
    for row in rows(archive):
        state, name = row['USPS'].strip(), row['NAME'].strip()
        if kind == 'place':
            name = re.sub(r' (?:city and borough|consolidated government|metropolitan government|unified government|municipality|CDP|city|town|village|borough|zona urbana|comunidad)$', '', name, flags=re.I)
        key = normalize(name)
        index.setdefault(key, set()).add(state)
        if kind == 'counties':
            short = re.sub(r' (?:county|parish|borough|municipio|census area|city and borough)$', '', name, flags=re.I)
            index.setdefault(normalize(short), set()).add(state)
    indexes[kind] = {key: ','.join(sorted(states)) for key, states in sorted(index.items())}
result = {'source': 'U.S. Census Bureau 2025 National Gazetteer counties and places', 'sha256': hashes, **indexes}
target = Path('app/lib/jobLocationIndex.generated.json')
target.write_text(json.dumps(result, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
print(json.dumps({'countyNames': len(result['counties']), 'placeNames': len(result['place']), 'bytes': target.stat().st_size}))
