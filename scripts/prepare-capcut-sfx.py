"""Rebuild the 11/10 CapCut-style accent cuts; originals remain untouched."""
from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'source/sfx/memes'
TARGET = ROOT / 'media/sfx/memes'
CUTS = [
    ('size', 'mac-quack.mp3', .1, .42, -16),
    ('sting', 'dudungtag.mp3', 0, 1.05, None),
    ('gasp', 'ddeuheog.mp3', 0, 1.05, None),
    ('shell', 'bbyororong.mp3', 0, 1.7, -9.6),
    ('roll', '0-dugudugu.mp3', 1, 1.8, None),
    ('fanfare', 'tada.mp3', 0, 1.95, None),
    ('clap', '0-bagsu.mp3', .15, 1.9, None),
]
manifest = []
for key, name, start, end, gain in CUTS:
    filters = f'atrim=start={start}:end={end},asetpts=PTS-STARTPTS,aformat=channel_layouts=mono,'
    filters += f'volume={gain}dB' if gain is not None else 'loudnorm=I=-29:TP=-9:LRA=7'
    filters += f',afade=t=in:d=0.008,afade=t=out:st={end-start-.06}:d=0.06'
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(SOURCE / name), '-af', filters,
                    '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k', str(TARGET / f'{key}.mp3')], check=True)
    manifest.append(dict(id=key, original=name, start=start, end=end, filters=filters))
    print(key, f'{end-start:.2f}s')
(SOURCE / 'capcut-edits.json').write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + '\n')
