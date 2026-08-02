#!/usr/bin/env python3
"""Generate the hero image for the Collections Plus 2.5 blog post.

Reuses the store-image toolkit (real dark-theme palette, fonts, panel mockup) to
render a 1600x840 banner: left-side headline + feature pills, right-side a faithful
side-panel mock showing folders and collections *interleaved* (the 2.5 headline
feature). Output: store-assets/hero-collections-plus-2.5.png

Requires Pillow. Run:  python tools/make_hero_image.py
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from PIL import Image, ImageDraw, ImageFilter
from make_store_images import (
    font, Pen, grad, cover, panel_frame, S, ICON, OUT,
    BG, ELEV, ELEV2, BORDER, TEXT, DIM, FAINT, ACCENT, ACCENT_STRONG, WHITE, COVER_HUES,
)

W, H = 1600, 840


def glow(base, cx, cy, r, color, alpha):
    """Composite a soft radial glow (blurred ellipse) onto the base image."""
    layer = Image.new("RGBA", base.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(layer)
    d.ellipse(
        [(cx - r) * S, (cy - r) * S, (cx + r) * S, (cy + r) * S],
        fill=color + (alpha,),
    )
    layer = layer.filter(ImageFilter.GaussianBlur(radius=120 * S))
    base.alpha_composite(layer)


def draw_interleaved(pen, x, y, w):
    """A side-panel list that alternates folders and collections, to show the new
    shared manual order (Collection, Folder, Collection, Folder)."""
    pad = 16
    cx = x + pad
    cw = w - pad * 2

    # Top bar
    pen.text(cx, y + 16, "Collections Plus", font(17, "sb"), TEXT)
    bw = 60
    pen.rrect(cx + cw - bw - 40, y + 12, cx + cw - 40, y + 38, 6, fill=ACCENT_STRONG)
    pen.text(cx + cw - bw - 40 + 12, y + 17, "+ New", font(13, "sb"), WHITE)
    pen.text(cx + cw - 26, y + 14, "⋯", font(20), DIM)

    # Search
    sy = y + 50
    pen.rrect(cx, sy, cx + cw - 40, sy + 32, 6, fill=ELEV, outline=BORDER, width=1)
    pen.text(cx + 10, sy + 8, "Search collections and items…", font(13), FAINT)
    pen.rrect(cx + cw - 34, sy, cx + cw, sy + 32, 6, fill=ELEV, outline=BORDER, width=1)
    pen.text(cx + cw - 17, sy + 9, "AI", font(12, "sb"), ACCENT, anchor="ma")

    def card(yy, title, meta, hue, pinned=False):
        ch = 76
        pen.rrect(cx, yy, cx + cw, yy + ch, 8,
                  fill=ELEV, outline=ACCENT_STRONG if pinned else BORDER, width=1)
        pen.text(cx + 12, yy + ch / 2 - 8, "⠿", font(13), FAINT)  # drag handle
        cover(pen, cx + 30, yy + 12, 52, hue)
        tx = cx + 94
        pen.text(tx, yy + 15, title, font(15, "sb"), TEXT)
        pen.text(tx, yy + 37, meta, font(12), DIM)
        # bottom action row (the new 2.5 layout): a few faint dots
        adot = cx + cw - 18
        for i in range(4):
            pen.text(adot - i * 18, yy + ch - 22, "·", font(20), FAINT)
        return yy + ch + 10

    def folder(yy, name, count, open_, highlight=False):
        fh = 34
        if highlight:
            pen.rrect(cx - 2, yy, cx + cw + 2, yy + fh, 8, outline=ACCENT, width=2)
        pen.line(cx, yy + 1, cx + cw, yy + 1, BORDER, 1)
        pen.text(cx + 2, yy + 8, "⠿", font(12), ACCENT if highlight else FAINT)  # folder drag handle
        pen.text(cx + 22, yy + 7, "▾" if open_ else "▸", font(15), DIM)
        # folder glyph
        fx = cx + 44
        pen.rrect(fx, yy + 13, fx + 20, yy + 26, 2, fill=ACCENT_STRONG)
        pen.rrect(fx, yy + 10, fx + 10, yy + 15, 1, fill=ACCENT_STRONG)
        pen.text(fx + 28, yy + 9, name, font(14, "sb"), TEXT)
        pen.text(cx + cw - 14, yy + 10, str(count), font(12), FAINT)
        return yy + fh + 6

    yy = sy + 48
    # Collection, then a Folder, then a Collection, then a Folder — interleaved.
    yy = card(yy, "Recipes", "9 items", COVER_HUES[3], pinned=True)
    yy = folder(yy, "Work", 2, True, highlight=True)
    yy = card(yy, "Project parts", "8 items", COVER_HUES[2])
    yy = card(yy, "Travel", "5 items", COVER_HUES[0])
    yy = folder(yy, "Reading", 12, False)


def pill(pen, x, y, label):
    tw = pen.textlen(label, font(15, "sb"))
    pad = 16
    pen.rrect(x, y, x + tw + pad * 2 + 18, y + 34, 17, fill=ELEV2, outline=BORDER, width=1)
    pen.ellipse(x + 14, y + 13, x + 22, y + 21, fill=ACCENT)
    pen.text(x + pad + 18, y + 8, label, font(15, "sb"), (223, 235, 246))
    return x + tw + pad * 2 + 18 + 12


def main():
    os.makedirs(OUT, exist_ok=True)
    img = Image.new("RGB", (W * S, H * S), BG)
    grad(img, (22, 27, 38), (11, 13, 20))
    img = img.convert("RGBA")

    # Soft accent glow behind the panel + a fainter one bottom-left.
    glow(img, W - 300, H // 2, 320, ACCENT, 60)
    glow(img, 120, H - 80, 260, ACCENT_STRONG, 55)

    pen = Pen(ImageDraw.Draw(img))

    lx = 96
    # Brand row
    try:
        ic = Image.open(ICON).convert("RGBA").resize((80 * S, 80 * S), Image.LANCZOS)
        img.paste(ic, (lx * S, 96 * S), ic)
    except Exception:
        pass
    pen.text(lx + 96, 108, "Collections Plus", font(28, "sb"), WHITE)
    # version chip
    pen.rrect(lx + 96, 148, lx + 158, 176, 14, fill=ACCENT_STRONG)
    pen.text(lx + 96 + 31, 152, "v2.5", font(15, "b"), WHITE, anchor="ma")

    # Headline
    hy = 250
    pen.text(lx, hy, "Recover what Edge", font(58, "b"), WHITE)
    pen.text(lx, hy + 68, "left behind.", font(58, "b"), ACCENT)

    # Subhead
    sy = hy + 160
    pen.text(lx, sy, "Bring your collections back from Edge's leftover", font(22), (206, 220, 236))
    pen.text(lx, sy + 32, "database — and arrange folders and", font(22), (206, 220, 236))
    pen.text(lx, sy + 64, "collections in any order you like.", font(22), (206, 220, 236))

    # Feature pills
    py = sy + 122
    x = pill(pen, lx, py, "SQLite recovery")
    x = pill(pen, x, py, "Interleave folders")
    pill(pen, lx, py + 46, "Tidier menus")
    x2 = pill(pen, lx, py + 46, "Tidier menus")
    pill(pen, x2, py + 46, "Cleaner rows")

    # Footer tagline
    pen.text(lx, H - 84, "Free · open source · local-first · no account, no server",
             font(16), FAINT)

    # Right: floating side-panel mock (interleaved list)
    pw, ph = 380, 540
    px, pyy = W - pw - 96, (H - ph) // 2
    panel = panel_frame(img, px, pyy, pw, ph)
    draw_interleaved(panel, px, pyy, pw)

    img = img.convert("RGB").resize((W, H), Image.LANCZOS)
    path = os.path.join(OUT, "hero-collections-plus-2.5.png")
    img.save(path)
    print("wrote", path, f"({W}x{H})")


if __name__ == "__main__":
    main()
