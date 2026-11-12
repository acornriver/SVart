#!/usr/bin/env python3
"""Regenerate meme guides from original recordings and the reviewed segment manifest.
Requires ffmpeg/ffprobe; uses gain only (no stretching or dynamic compression).
"""
import argparse
import json
import subprocess
import tempfile
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
    parser.add_argument('--ids', nargs='+', help='Regenerate only these guide IDs')
    args = parser.parse_args()
    source = SOURCE / 'en' if args.lang == 'en' else SOURCE
    target = TARGET / 'en' if args.lang == 'en' else TARGET
    manifest = json.loads((source / 'segments.json').read_text())
    if args.ids and set(args.ids) - {s['id'] for s in manifest['segments']}:
        parser.error('Unknown guide ID in --ids')
    target.mkdir(parents=True, exist_ok=True)
    for segment in manifest['segments']:
        dest = target / (segment['id'] + '.mp3')
        parts = segment.get('parts')
        if parts is None:
            parts = [{'source': manifest['source'], 'start': segment['start'],
                      'end': segment['end'], 'gainDb': segment['gainDb']}]
        if not args.verify_only and (not args.ids or segment['id'] in args.ids):
            # Decode each source only once, then concatenate PCM before the final encode.
            # This keeps the replacement acting and the original gesture instructions.
            with tempfile.TemporaryDirectory() as tmp:
                clips = []
                for index, part in enumerate(parts):
                    clip = Path(tmp) / f'{index}.wav'
                    run(['ffmpeg', '-v', 'error', '-y', '-ss', str(part['start']),
                         '-i', str(source / part['source']),
                         '-t', str(round(part['end'] - part['start'], 6)), '-ac', '1', '-ar', '44100',
                         '-af', f"volume={part['gainDb']}dB", '-c:a', 'pcm_s24le', str(clip)])
                    clips.append(clip)
                inputs = [arg for clip in clips for arg in ['-i', str(clip)]]
                filters = ''.join(f'[{i}:a]' for i in range(len(clips)))
                filters += f"concat=n={len(clips)}:v=0:a=1,volume={segment.get('outputGainDb', 0)}dB[out]"
                run(['ffmpeg', '-v', 'error', '-y', *inputs, '-filter_complex', filters,
                     '-map', '[out]', '-c:a', 'libmp3lame', '-b:a', '128k',
                     '-metadata', 'title=' + segment['id'], str(dest)])
        info = json.loads(run(['ffprobe', '-v', 'error', '-show_entries', 'format=duration', '-of', 'json', str(dest)]).stdout)
        duration = float(info['format']['duration'])
        expected = sum(part['end'] - part['start'] for part in parts)
        if abs(duration - expected) > 0.12:
            raise ValueError(f"{segment['id']}: unexpected duration {duration} (expected {expected})")
        run(['ffmpeg', '-v', 'error', '-i', str(dest), '-f', 'null', '-'])
        print(f"{segment['id']}: {duration:.3f}s / {len(parts)} source part(s)")
    actual = {p.stem for p in target.glob('*.mp3')}
    expected = {s['id'] for s in manifest['segments']}
    if actual != expected:
        raise ValueError(f'Unexpected/missing clips: {actual ^ expected}')
    print(f'Verified {len(expected)} clips.')


if __name__ == '__main__':
    main()
