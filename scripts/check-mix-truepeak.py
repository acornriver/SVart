#!/usr/bin/env python3
"""Measure rendered mix WAVs with FFmpeg; fail if true peak exceeds -1dBTP.
Usage: python3 scripts/check-mix-truepeak.py /tmp/svart-mix-audit
"""
from pathlib import Path
import subprocess,re,json,concurrent.futures,sys
if len(sys.argv) != 2:
    raise SystemExit(__doc__)
root=Path(sys.argv[1])
if not list(root.glob('*.wav')):
    raise SystemExit('No rendered WAV files found')
def inspect(p):
 r=subprocess.run(['ffmpeg','-hide_banner','-i',str(p),'-af','ebur128=peak=true','-f','null','-'],capture_output=True,text=True,check=True)
 s=r.stderr.rsplit('Summary:',1)[-1]
 return {'id':p.stem,'lufs':float(re.search(r'I:\s+([-\d.]+) LUFS',s).group(1)),'truePeakDb':float(re.search(r'Peak:\s+([-\d.]+) dBFS',s).group(1))}
with concurrent.futures.ThreadPoolExecutor(max_workers=6) as pool: rows=list(pool.map(inspect,sorted(root.glob('*.wav'))))
(root/'true-peak-report.json').write_text(json.dumps(rows,indent=2)+'\n')
print('Rendered files:',len(rows))
print('Highest true peaks:',sorted(rows,key=lambda x:x['truePeakDb'],reverse=True)[:8])
for prefix in ['voice-ko','voice-en','effect','melody','music','center']:
 a=[r for r in rows if r['id'].startswith(prefix)]
 print(prefix,'LUFS',round(min(r['lufs'] for r in a),1),round(max(r['lufs'] for r in a),1))
assert all(r['truePeakDb']<=-1 for r in rows),'True-peak headroom failed'
