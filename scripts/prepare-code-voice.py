#!/usr/bin/env python3
"""Build the delivered hearing-code phonemes with gain-only loudness matching.
Short units are looped for loudness measurement because BS.1770 needs 400 ms.
The reviewed, unequal word boundaries and original checksums are in segments.json.
Requires ffmpeg and ffprobe. Originals are never modified.
"""
import argparse
import array
import hashlib
import json
import math
import subprocess
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'source/voice/code-reading'
TARGET = ROOT / 'media/voice/code-reading'


def run(args):
    return subprocess.run(args, check=True, capture_output=True)


def levels(path):
    result = run(['ffmpeg', '-hide_banner', '-stream_loop', '-1', '-i', str(path),
                  '-t', '8', '-af', 'loudnorm=I=-27:TP=-3:LRA=11:print_format=json',
                  '-f', 'null', '-']).stderr.decode()
    measured = json.JSONDecoder().raw_decode(result[result.rfind('{'):])[0]
    return float(measured['input_i']), float(measured['input_tp'])


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--verify-only', action='store_true')
    args = parser.parse_args()
    manifest_path = SOURCE / 'segments.json'
    manifest = json.loads(manifest_path.read_text())
    for unit in manifest['units']:
        original = SOURCE / unit['source']
        if hashlib.sha256(original.read_bytes()).hexdigest() != unit['sourceSha256']:
            raise ValueError(f'Original checksum changed: {original}')
        dest = TARGET / unit['lang'] / (unit['id'] + '.mp3')
        if not args.verify_only:
            pcm = run(['ffmpeg', '-v', 'error', '-ss', str(unit['start']), '-i', str(original),
                       '-t', str(unit['end'] - unit['start']), '-ac', '1', '-ar', '44100',
                       '-f', 's16le', '-']).stdout
            samples = array.array('h', pcm)
            # Preserve weak consonants, plus 30 ms of context around voiced content.
            frame = 220
            active = [i for i in range(0, len(samples), frame)
                      if math.sqrt(sum(v * v for v in samples[i:i + frame]) /
                                   len(samples[i:i + frame])) > 32768 * 10 ** (-48 / 20)]
            if not active:
                raise ValueError(f'Empty phoneme: {unit["id"]}')
            start = max(0, active[0] - 1323) / 44100
            end = min(len(samples), active[-1] + frame + 1323) / 44100
            with tempfile.TemporaryDirectory() as temp:
                wav = Path(temp) / 'unit.wav'
                # Decode the preserved original again at the measured outer-silence trims.
                run(['ffmpeg', '-v', 'error', '-y', '-ss', str(unit['start'] + start),
                     '-i', str(original), '-t', str(end - start), '-ac', '1', '-ar', '44100',
                     '-af', f'afade=t=in:d=0.002,afade=t=out:st={max(0, end-start-0.002)}:d=0.002', str(wav)])
                loudness, peak = levels(wav)
                gain = min(manifest['targetLufs'] - loudness, -3.2 - peak)
                dest.parent.mkdir(parents=True, exist_ok=True)
                for attempt in range(3):
                    run(['ffmpeg', '-v', 'error', '-y', '-i', str(wav), '-af', f'volume={gain}dB',
                         '-c:a', 'libmp3lame', '-b:a', '128k', str(dest)])
                    encoded_loudness, encoded_peak = levels(dest)
                    correction = manifest['targetLufs'] - encoded_loudness
                    if abs(correction) <= .15 and encoded_peak <= -3:
                        break
                    gain += min(correction, -3.2 - encoded_peak)
            unit.update(trimStart=round(start, 6), trimEnd=round(end, 6), gainDb=round(gain, 2))
        loudness, peak = levels(dest)
        if abs(loudness - manifest['targetLufs']) > .35 or peak > -3:
            raise ValueError(f'{dest}: {loudness} LUFS, {peak} dBTP')
        print(f'{unit["lang"]}/{unit["id"]}: {loudness:.1f} LUFS / {peak:.1f} dBTP')
    expected = {f'{u["lang"]}/{u["id"]}.mp3' for u in manifest['units']}
    actual = {str(p.relative_to(TARGET)) for p in TARGET.rglob('*.mp3')}
    if actual != expected:
        raise ValueError(f'Unexpected/missing units: {actual ^ expected}')
    if not args.verify_only:
        manifest_path.write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
    print(f'Verified {len(expected)} units and their original checksums.')


if __name__ == '__main__':
    main()
