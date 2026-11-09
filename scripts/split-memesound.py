#!/usr/bin/env python3
"""Regenerate meme guides from the lossless source and reviewed segment manifest.
Requires ffmpeg/ffprobe; uses gain only (no stretching or dynamic compression).
"""
import argparse
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'source/voice/memesound'
TARGET = ROOT / 'media/voice/memesound'


def run(args):
    return subprocess.run(args, check=True, capture_output=True, text=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-only', action='store_true')
    parser.add_argument('--lang', choices=['ko', 'en'], default='ko')
    args = parser.parse_args()
    source = SOURCE / 'en' if args.lang == 'en' else SOURCE
    target = TARGET / 'en' if args.lang == 'en' else TARGET
    manifest = json.loads((source / 'segments.json').read_text())
    target.mkdir(parents=True, exist_ok=True)
    for segment in manifest['segments']:
        dest = target / (segment['id'] + '.mp3')
        if not args.verify_only:
            run(['ffmpeg', '-v', 'error', '-y', '-ss', str(segment['start']), '-i', str(source / manifest['source']),
                 '-t', str(round(segment['end'] - segment['start'], 6)), '-ac', '1', '-ar', '44100',
                 '-af', f"volume={segment['gainDb']}dB", '-c:a', 'libmp3lame', '-b:a', '128k',
                 '-metadata', 'title=' + segment['id'], str(dest)])
        info = json.loads(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(dest)]).stdout)
        duration = float(info['format']['duration'])
        expected = segment['end'] - segment['start']
        if abs(duration - expected) > 0.12:
            raise ValueError(f"{segment['id']}: unexpected duration {duration} (expected {expected})")
        run(['ffmpeg', '-v', 'error', '-i', str(dest), '-f', 'null', '-'])
        print(f"{segment['id']}: {duration:.3f}s / gain {segment['gainDb']:+.2f}dB")
    actual = {p.stem for p in target.glob('*.mp3')}
    expected = {s['id'] for s in manifest['segments']}
    if actual != expected:
        raise ValueError(f'Unexpected/missing clips: {actual ^ expected}')
    print(f'Verified {len(expected)} clips.')


if __name__ == '__main__':
    main()
