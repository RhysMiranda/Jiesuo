#!/usr/bin/env python3
"""Draw the app icons in app/icons/: 解 in a 田字格 practice square, as in the app.

Needs LXGW WenKai TC (SIL OFL), the font the app itself uses:
    https://github.com/google/fonts/raw/main/ofl/lxgwwenkaitc/LXGWWenKaiTC-Regular.ttf
Usage: python scripts/make_icons.py path/to/LXGWWenKaiTC-Regular.ttf app/icons
Cantonese app: python scripts/make_icons.py data/raw/yue/NotoSerifHK.ttf app/yue/icons --glyph 粵
(or --font FILE --out DIR).
"""
import argparse
from PIL import Image, ImageDraw, ImageFont
ap = argparse.ArgumentParser()
ap.add_argument("font", nargs="?"); ap.add_argument("outdir", nargs="?")
ap.add_argument("--font", dest="font_opt"); ap.add_argument("--out", dest="out_opt")
ap.add_argument("--glyph", default="解")
a = ap.parse_args()
font_path, out, GLYPH = a.font_opt or a.font, a.out_opt or a.outdir, a.glyph
if not font_path or not out: ap.error("need a font file and an output folder")
PAPER, SHEET, INK, GRID = "#f0f5ee", "#f8fbf6", "#1b2a2e", "#9fc4ad"

def icon(size, square_frac):
    S = 4 * size  # draw large, shrink for smooth edges
    im = Image.new("RGB", (S, S), PAPER)
    d = ImageDraw.Draw(im)
    side = round(S * square_frac); x0 = (S - side) // 2; x1 = x0 + side
    line = max(4, round(side * 0.022))
    d.rectangle([x0, x0, x1, x1], fill=SHEET, outline=GRID, width=line)
    mid, dash, gap, w = S // 2, round(side * 0.045), round(side * 0.06), max(2, round(side * 0.008))
    p = x0 + line
    while p < x1 - line:  # dashed 田字格 cross, as in the app's practice squares
        e = min(p + dash, x1 - line)
        d.line([(p, mid), (e, mid)], fill=GRID, width=w)
        d.line([(mid, p), (mid, e)], fill=GRID, width=w)
        p += dash + gap
    f = ImageFont.truetype(font_path, round(side * 0.74))
    d.text((S / 2, S / 2 + side * 0.01), GLYPH, font=f, fill=INK, anchor="mm")
    return im.resize((size, size), Image.LANCZOS)

icon(192, 0.78).save(f"{out}/icon-192.png", optimize=True)
icon(512, 0.78).save(f"{out}/icon-512.png", optimize=True)
icon(512, 0.56).save(f"{out}/icon-maskable-512.png", optimize=True)
icon(180, 0.78).save(f"{out}/apple-touch-icon.png", optimize=True)
icon(32, 0.9).save(f"{out}/favicon-32.png", optimize=True)
