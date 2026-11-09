#!/usr/bin/env python3
"""Rebuild the four used meme accents from preserved originals; requires ffmpeg."""
from pathlib import Path
import json
import subprocess

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'source/sfx/memes'
TARGET = ROOT / 'media/sfx/memes'
TARGET.mkdir(parents=True, exist_ok=True)
for item in json.loads((SOURCE / 'edits.json').read_text()):
    duration = item['end'] - item['start']
    filters = (f"atrim=start={item['start']}:end={item['end']},asetpts=PTS-STARTPTS,"
               f"aformat=channel_layouts=mono,volume={item['gainDb']}dB,"
               f"afade=t=in:d=0.008,afade=t=out:st={max(0, duration - .045)}:d=0.045")
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(SOURCE / item['original']),
                    '-af', filters, '-ar', '44100', '-c:a', 'libmp3lame', '-b:a', '128k',
                    str(TARGET / (item['id'] + '.mp3'))], check=True)
    print(item['id'], f'{duration:.2f}s')
