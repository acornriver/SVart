#!/usr/bin/env python3
"""Synchronize shared backend modules from canonical SVart/cloud into SVartTower/cloud.
Use --check for a read-only drift check. Filesystem access to the destination is required.
"""
import argparse
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
NAMES = ('schema.js', 'config.js', 'firebase.js', 'feed.js')
HEADER = '// Mirrored from SVart/cloud (schema v2). Update SVart first, then run scripts/sync-tower-cloud.py.\n'
parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument('--tower', type=Path, default=ROOT.parent / 'SVartTower')
parser.add_argument('--check', action='store_true')
args = parser.parse_args()
if not (args.tower / 'index.html').is_file():
    raise SystemExit('Not a Tower checkout: ' + str(args.tower))
errors = []
for name in NAMES:
    data = HEADER + (ROOT / 'cloud' / name).read_text()
    dest = args.tower / 'cloud' / name
    if args.check:
        if not dest.exists() or dest.read_text() != data:
            errors.append(str(dest))
    else:
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(data)
if errors:
    raise SystemExit('Shared module drift:\n' + '\n'.join(errors))
print('Tower shared modules match SVart schema v2.' if args.check else 'Tower shared modules synchronized from SVart.')
