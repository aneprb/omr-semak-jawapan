"""Jana ikon PNG dan favicon.svg ke icons/ (Pillow). Guna: python tools/make_icons.py"""
from pathlib import Path
from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
BLUE = (29, 78, 216, 255)
WHITE = (255, 255, 255, 255)


def draw(size, safe):
    """safe = nisbah kawasan selamat (maskable guna 0.6)."""
    s = size * 4
    im = Image.new("RGBA", (s, s), BLUE)
    d = ImageDraw.Draw(im)
    pad = s * (1 - safe) / 2
    w = s * safe
    d.rounded_rectangle([pad + w * .15, pad + w * .05, pad + w * .85, pad + w * .95], radius=w * .06, fill=WHITE)
    for i in range(4):
        cy = pad + w * (.22 + i * .2)
        for j in range(3):
            cx = pad + w * (.35 + j * .15)
            r = w * .045
            filled = (i + j) % 3 == 0
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=BLUE if filled else None,
                      outline=BLUE, width=max(2, int(w * .012)))
    return im.resize((size, size), Image.LANCZOS)


def main():
    OUT.mkdir(exist_ok=True)
    draw(192, 0.9).save(OUT / "icon-192.png")
    draw(512, 0.9).save(OUT / "icon-512.png")
    draw(512, 0.6).save(OUT / "icon-maskable-512.png")
    # iOS apple-touch-icon: 180x180, fully opaque (no alpha channel; iOS rounds the corners itself).
    draw(180, 0.9).convert("RGB").save(OUT / "apple-touch-icon-180.png")
    (OUT / "favicon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="12" fill="#1d4ed8"/>'
        '<rect x="14" y="8" width="36" height="48" rx="4" fill="#fff"/>'
        '<circle cx="26" cy="22" r="4" fill="#1d4ed8"/><circle cx="38" cy="34" r="4" fill="#1d4ed8"/>'
        '<circle cx="26" cy="46" r="4" fill="none" stroke="#1d4ed8" stroke-width="2"/></svg>\n',
        encoding="utf-8")
    print("ikon dijana:", ", ".join(sorted(p.name for p in OUT.iterdir())))


if __name__ == "__main__":
    main()
