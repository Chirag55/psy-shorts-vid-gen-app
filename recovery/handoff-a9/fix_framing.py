#!/usr/bin/env python3
"""
fix_framing.py (CR-87E, revised by CR-89A)  -  check and repair clips/stills that are not the right aspect ratio.

  python fix_framing.py check  <folder>                 report size and aspect ratio only
  python fix_framing.py fix    <folder> [--out fixed]   files with the wrong aspect: scale-to-fill + centre-crop; right aspect: plain scale; identical: copied
  add --size 1920x1080 for landscape long-form thumbnails (default size is 1080x1920)

GEOMETRY ONLY. This tool never looks at pixel content and never crops a file that already has the right aspect ratio.
(An earlier version tried to detect "blurred or blank bands" from image sharpness and cut them. It flagged normal anime art with smooth
walls, night skies and soft backgrounds, and cut up to 40% of good frames. It was removed.)

Needs ffmpeg + ffprobe on PATH and Python 3.
"""
import argparse, json, os, shutil, subprocess, sys

W, H = 1080, 1920
VID = ('.mp4', '.mov', '.webm', '.mkv'); IMG = ('.png', '.jpg', '.jpeg', '.webp')

def probe(p):
    o = subprocess.run(['ffprobe', '-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'json', p], capture_output=True, text=True).stdout
    s = json.loads(o)['streams'][0]; return s['width'], s['height']

def frame(p, t=1.0):
    if p.lower().endswith(IMG): return Image.open(p).convert('L')
    f = tempfile.mktemp(suffix='.png')
    subprocess.run(['ffmpeg', '-v', 'error', '-y', '-ss', str(t), '-i', p, '-frames:v', '1', f], check=False)
    im = Image.open(f).convert('L'); os.remove(f); return im

def files(folder):
    return sorted(os.path.join(folder, f) for f in os.listdir(folder) if f.lower().endswith(VID + IMG))

def check(folder):
    bad = 0
    print(f"{'file':50} {'size':>11} {'ratio':>6}  verdict")
    for p in files(folder):
        w, h = probe(p); r = w / h; notes = []
        if abs(r - W / H) > 0.01: notes.append(f'NOT {W}x{H} aspect (set Flow to the right aspect ratio and regenerate, or run fix)')
        bad += bool(notes)
        print(f"{os.path.basename(p)[:50]:50} {w}x{h:>5} {r:6.3f}  {'OK' if not notes else '; '.join(notes)}")
    print(f"\n{bad} of {len(files(folder))} files need attention.")

def fix(folder, out):
    os.makedirs(out, exist_ok=True)
    for p in files(folder):
        w, h = probe(p); dst = os.path.join(out, os.path.basename(p))
        if w == W and h == H: vf = None
        elif abs(w / h - W / H) <= 0.01: vf = f'scale={W}:{H},setsar=1'
        else: vf = f'scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1'
        if vf is None: shutil.copy2(p, dst); print('copied unchanged', os.path.basename(p)); continue
        cmd = ['ffmpeg', '-v', 'error', '-y', '-i', p] + (['-vf', vf] if vf else [])
        if p.lower().endswith(VID): cmd += ['-c:v', 'libx264', '-crf', '17', '-preset', 'medium', '-pix_fmt', 'yuv420p', '-an', os.path.splitext(dst)[0] + '.mp4']
        else: cmd += [dst]
        subprocess.run(cmd, check=False); print('fixed' if vf else 're-encoded unchanged', os.path.basename(p))

if __name__ == '__main__':
    ap = argparse.ArgumentParser(); ap.add_argument('cmd', choices=['check', 'fix']); ap.add_argument('folder')
    ap.add_argument('--out', default='fixed'); ap.add_argument('--size', default='1080x1920'); a = ap.parse_args()
    W, H = (int(x) for x in a.size.lower().split('x'))
    check(a.folder) if a.cmd == 'check' else fix(a.folder, a.out)
