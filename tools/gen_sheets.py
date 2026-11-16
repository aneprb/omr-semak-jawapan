"""Penjana kertas jawapan sintetik (Pillow) untuk ujian enjin OMR (PLAN 8.3).

Profil:
  clean      halaman bersih 150 DPI, PNG
  distorted  atas latar bertekstur, perspektif <=15 darjah, putaran +-10, 10% terbalik 180,
             kabur, hingar, kecerunan cahaya, JPEG q60-90, sisi panjang 1200-2400 px
  blank      kertas kosong / gambar rawak / kertas dengan 3 penanda sahaja -> jangkaan NO_MARKERS
  key        kertas skema penuh (semua soalan satu jawapan, tiada ID)

Penggunaan:
  python tools/gen_sheets.py --profile clean --count 40 --seed 1 --out tests/fixtures/sheets/generated/clean
  python tools/gen_sheets.py --smoke
Semua data sintetik; nama pada kertas hanya "Pelajar Ujian N".
"""

from __future__ import annotations

import argparse
import json
import math
import random
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter, ImageFont

sys.path.insert(0, str(Path(__file__).resolve().parent))
from omr_layout import GOLDEN_CONFIGS, build_layout  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_OUT = ROOT / "tests" / "fixtures" / "sheets" / "generated"
SMOKE_OUT = ROOT / "tests" / "fixtures" / "sheets" / "smoke"
PROFILES = ("clean", "distorted", "blank", "key")
CONFIGS = [{"numQuestions": n, "numChoices": c, "idDigits": d} for n, c, d in GOLDEN_CONFIGS]
PAGE_W, PAGE_H = 210.0, 297.0


# ---------------------------------------------------------------- fon
def get_font(size_px: int) -> ImageFont.ImageFont:
    for name in ("C:/Windows/Fonts/arial.ttf", "DejaVuSans.ttf", "arial.ttf"):
        try:
            return ImageFont.truetype(name, size_px)
        except OSError:
            continue
    return ImageFont.load_default(size=size_px)


# ---------------------------------------------------------------- homografi kecil
def solve_h(src, dst):
    """Koefisien (a..h) supaya (x,y)->((ax+by+c)/(gx+hy+1), (dx+ey+f)/(gx+hy+1))."""
    A, B = [], []
    for (x, y), (u, v) in zip(src, dst):
        A.append([x, y, 1, 0, 0, 0, -x * u, -y * u])
        B.append(u)
        A.append([0, 0, 0, x, y, 1, -x * v, -y * v])
        B.append(v)
    n = 8
    for i in range(n):
        p = max(range(i, n), key=lambda r: abs(A[r][i]))
        A[i], A[p] = A[p], A[i]
        B[i], B[p] = B[p], B[i]
        for r in range(i + 1, n):
            f = A[r][i] / A[i][i]
            for c in range(i, n):
                A[r][c] -= f * A[i][c]
            B[r] -= f * B[i]
    x = [0.0] * n
    for i in range(n - 1, -1, -1):
        x[i] = (B[i] - sum(A[i][j] * x[j] for j in range(i + 1, n))) / A[i][i]
    return x


def apply_h(h, x, y):
    d = h[6] * x + h[7] * y + 1
    return ((h[0] * x + h[1] * y + h[2]) / d, (h[3] * x + h[4] * y + h[5]) / d)


# ---------------------------------------------------------------- lukis halaman
def render_page(layout, *, dpi, answers, fills, id_code, name_text, skip_markers=(), title="Ujian Sintetik"):
    P = dpi / 25.4
    W, H = round(PAGE_W * P), round(PAGE_H * P)
    img = Image.new("RGB", (W, H), (255, 255, 255))
    d = ImageDraw.Draw(img)
    line_w = max(1, round(0.3 * P))
    f_small = get_font(max(8, round(3.2 * P)))
    f_txt = get_font(max(9, round(4.2 * P)))

    def px(v):
        return v * P

    for m in layout["markers"]:
        if m["id"] in skip_markers:
            continue
        h = m["size"] / 2
        d.rectangle([px(m["cx"] - h), px(m["cy"] - h), px(m["cx"] + h), px(m["cy"] + h)], fill=(0, 0, 0))
    ob = layout["orientationBar"]
    d.rectangle([px(ob["x"]), px(ob["y"]), px(ob["x"] + ob["w"]), px(ob["y"] + ob["h"])], fill=(0, 0, 0))

    reg = layout["regions"]
    d.text((px(reg["title"]["x"]), px(reg["title"]["y"] + 4)), title, fill=(0, 0, 0), font=f_txt, anchor="lm")
    for key, label in (("name", "Nama: "), ("className", "Kelas: "), ("date", "Tarikh: ")):
        r = reg[key]
        d.rectangle([px(r["x"]), px(r["y"]), px(r["x"] + r["w"]), px(r["y"] + r["h"])], outline=(120, 120, 120), width=line_w)
        d.text((px(r["x"] + 1.5), px(r["y"] + r["h"] / 2)), label, fill=(60, 60, 60), font=f_small, anchor="lm")
    d.text((px(reg["name"]["x"] + 22), px(reg["name"]["y"] + reg["name"]["h"] / 2)), name_text, fill=(20, 20, 90), font=f_txt, anchor="lm")
    if name_text.startswith("Pelajar"):
        d.text((px(reg["className"]["x"] + 22), px(reg["className"]["y"] + 5)), "Kelas Ujian", fill=(20, 20, 90), font=f_txt, anchor="lm")

    for hd in layout["choiceHeaders"]:
        d.text((px(hd["x"]), px(hd["y"])), hd["choice"], fill=(0, 0, 0), font=f_small, anchor="mm")

    def bubble(cx, cy, r, dark):
        box = [px(cx - r), px(cy - r), px(cx + r), px(cy + r)]
        d.ellipse(box, outline=(85, 85, 85), width=line_w)
        if dark > 0:
            rr = r * 0.88
            g = round(255 - dark * 215)
            d.ellipse([px(cx - rr), px(cy - rr), px(cx + rr), px(cy + rr)], fill=(g, g, g))

    for q in layout["questions"]:
        d.text((px(q["labelX"]), px(q["labelY"])), str(q["q"]), fill=(0, 0, 0), font=f_small, anchor="lm")
        for b in q["bubbles"]:
            bubble(b["cx"], b["cy"], b["r"], fills.get((q["q"], b["choice"]), 0.0))

    idb = layout["idBlock"]
    if idb:
        d.text((px(idb["label"]["x"]), px(idb["label"]["y"])), "No. ID", fill=(0, 0, 0), font=f_small, anchor="lm")
        for j, wb in enumerate(idb["writeBoxes"]):
            d.rectangle([px(wb["x"]), px(wb["y"]), px(wb["x"] + wb["w"]), px(wb["y"] + wb["h"])], outline=(120, 120, 120), width=line_w)
            if id_code:
                d.text((px(wb["x"] + wb["w"] / 2), px(wb["y"] + wb["h"] / 2)), id_code[j], fill=(20, 20, 90), font=f_txt, anchor="mm")
        for j, dg in enumerate(idb["digits"]):
            for b in dg["bubbles"]:
                on = bool(id_code) and int(id_code[j]) == b["digit"]
                bubble(b["cx"], b["cy"], b["r"], 0.95 if on else 0.0)

    ft = layout["footer"]
    d.text((px(ft["x"]), px(ft["y"])), ft["text"], fill=(90, 90, 90), font=f_small, anchor="mm")
    return img


# ---------------------------------------------------------------- jawapan rawak
def make_answers(rng, layout, full_single=False):
    letters = layout["choices"]
    answers, fills, light, multi = [], {}, [], []
    for q in range(1, layout["config"]["numQuestions"] + 1):
        roll = 0.0 if full_single else rng.random()
        if roll < 0.90:
            c = rng.choice(letters)
            answers.append(c)
            fills[(q, c)] = rng.uniform(0.85, 1.0)
        elif roll < 0.94:
            answers.append(None)
        elif roll < 0.97:
            a, b = rng.sample(letters, 2)
            answers.append("MULTI")
            multi.append(q)
            fills[(q, a)] = rng.uniform(0.85, 1.0)
            fills[(q, b)] = rng.uniform(0.85, 1.0)
        else:
            c = rng.choice(letters)
            answers.append(c)
            light.append(q)
            fills[(q, c)] = rng.uniform(0.40, 0.60)
    return answers, fills, light, multi


# ---------------------------------------------------------------- herotan
def gradient_mult(size, rng, lo):
    W, H = size
    D = int(math.hypot(W, H)) + 4
    g = Image.linear_gradient("L").resize((D, D))
    g = g.rotate(rng.uniform(0, 360), resample=Image.BICUBIC)
    left, top = (D - W) // 2, (D - H) // 2
    g = g.crop((left, top, left + W, top + H))
    g = g.point(lambda v: int(255 * (lo + (1 - lo) * v / 255)))
    return g.convert("RGB")


def add_noise(img, rng, sigma):
    if sigma <= 0:
        return img
    noise = Image.effect_noise(img.size, sigma).convert("RGB")
    return ImageChops.add(img, noise, scale=1.0, offset=-128)


def textured_background(size, rng):
    base = rng.randint(80, 170)
    bg = Image.new("RGB", size, (base, base - rng.randint(0, 12), base - rng.randint(0, 25)))
    return add_noise(bg, rng, rng.uniform(8, 25))


def distort(page, rng, *, out_long, dpi, flip180):
    """Letak halaman pada latar, perspektif+putaran. Pulang (imej, transform, corners_px)."""
    aspect = rng.uniform(0.70, 0.80)
    Hc = out_long
    Wc = round(Hc * aspect)
    rot = rng.uniform(-10, 10)
    tilt_x = rng.uniform(-15, 15)
    tilt_y = rng.uniform(-15, 15)
    theta = math.radians(rot + (180 if flip180 else 0))
    ax, ay = math.radians(tilt_x), math.radians(tilt_y)
    D = 450.0
    pts = []
    for sx, sy in ((-1, -1), (1, -1), (1, 1), (-1, 1)):
        X, Y = sx * PAGE_W / 2, sy * PAGE_H / 2
        X, Y = X * math.cos(theta) - Y * math.sin(theta), X * math.sin(theta) + Y * math.cos(theta)
        Z = 0.0
        X, Z = X * math.cos(ay) + Z * math.sin(ay), -X * math.sin(ay) + Z * math.cos(ay)
        Y, Z = Y * math.cos(ax) - Z * math.sin(ax), Y * math.sin(ax) + Z * math.cos(ax)
        pts.append((D * X / (D + Z), D * Y / (D + Z)))
    minx, maxx = min(p[0] for p in pts), max(p[0] for p in pts)
    miny, maxy = min(p[1] for p in pts), max(p[1] for p in pts)
    s = min(0.90 * Wc / (maxx - minx), 0.90 * Hc / (maxy - miny))
    slack_x = Wc - s * (maxx - minx)
    slack_y = Hc - s * (maxy - miny)
    ox = slack_x / 2 + rng.uniform(-0.3, 0.3) * slack_x
    oy = slack_y / 2 + rng.uniform(-0.3, 0.3) * slack_y
    quad = [((x - minx) * s + ox, (y - miny) * s + oy) for x, y in pts]

    Wp, Hp = page.size
    page_corners = [(0, 0), (Wp, 0), (Wp, Hp), (0, Hp)]
    coeffs = solve_h(quad, page_corners)  # keluaran -> halaman (format PIL)
    warped = page.transform((Wc, Hc), Image.PERSPECTIVE, coeffs, resample=Image.BICUBIC, fillcolor=(0, 0, 0))
    mask = Image.new("L", page.size, 255).transform((Wc, Hc), Image.PERSPECTIVE, coeffs, resample=Image.BILINEAR, fillcolor=0)
    bg = textured_background((Wc, Hc), rng)
    out = Image.composite(warped, bg, mask)

    fwd = solve_h([(0, 0), (PAGE_W, 0), (PAGE_W, PAGE_H), (0, PAGE_H)], quad)
    return out, {"rotationDeg": round(rot, 2), "tiltXDeg": round(tilt_x, 2), "tiltYDeg": round(tilt_y, 2),
                 "rotated180": flip180, "size": [Wc, Hc]}, fwd


# ---------------------------------------------------------------- penjana
def sheet_name(profile, idx):
    return "Kertas Skema" if profile == "key" else f"Pelajar Ujian {idx + 1}"


def generate(profile, count, seed, out_dir, *, dpi=150, long_range=(1200, 2400), configs=None,
             start=0, smoke=False):
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    entries = []
    for idx in range(start, start + count):
        rng = random.Random(f"omr:{profile}:{seed}:{idx}")
        cfg_list = configs or CONFIGS
        config = dict(cfg_list[(idx - start) % len(cfg_list)] if configs else cfg_list[idx % len(cfg_list)])
        layout = build_layout(config)
        base = f"{profile}-{idx + 1:03d}"
        meta = {"profile": profile, "seed": seed, "index": idx, "config": config, "layoutCode": layout["code"]}
        q_jpeg = rng.randint(60, 90) if not smoke else 82

        if profile in ("clean", "key", "distorted"):
            answers, fills, light, multi = make_answers(rng, layout, full_single=(profile == "key"))
            id_len = config["idDigits"]
            id_code = None if profile == "key" or id_len == 0 else "".join(str(rng.randint(0, 9)) for _ in range(id_len))
            page = render_page(layout, dpi=dpi, answers=answers, fills=fills, id_code=id_code or "",
                               name_text=sheet_name(profile, idx))
            meta.update(answers=answers, idCode=id_code, lightQuestions=light, multiQuestions=multi)
            if profile == "distorted":
                flip = rng.random() < 0.10
                long_px = rng.randint(*long_range)
                img, tr, fwd = distort(page, rng, out_long=long_px, dpi=dpi, flip180=flip)
                blur = rng.uniform(0, 1.5) * (long_px / 2000)
                if blur > 0.05:
                    img = img.filter(ImageFilter.GaussianBlur(blur))
                lo = rng.uniform(0.6, 1.0)
                img = ImageChops.multiply(img, gradient_mult(img.size, rng, lo))
                sigma = rng.uniform(2, 12)
                img = add_noise(img, rng, sigma)
                tr.update(blurSigma=round(blur, 2), noiseSigma=round(sigma, 2), lightMin=round(lo, 2), jpegQuality=q_jpeg)
                tr["corners"] = [[round(v, 1) for v in apply_h(fwd, m["cx"], m["cy"])] for m in layout["markers"]]
                meta["transform"] = tr
                fname, fmt, kw = base + ".jpg", "JPEG", {"quality": q_jpeg}
            else:
                img = page
                meta["transform"] = {"rotationDeg": 0, "rotated180": False, "size": list(page.size)}
                fname, fmt, kw = base + ".png", "PNG", {}
        else:  # blank
            kind = ("empty", "photo", "three")[idx % 3]
            meta.update(answers=[], idCode=None, blankKind=kind, expectedError="NO_MARKERS")
            if kind == "three":
                page = render_page(layout, dpi=dpi, answers=[], fills={}, id_code="", name_text=sheet_name("clean", idx),
                                   skip_markers=("BL",))
                img = page
            else:
                long_px = round(PAGE_H * dpi / 25.4)
                size = (round(long_px * 0.72), long_px)
                if kind == "empty":
                    img = Image.new("RGB", size, (245, 245, 242))
                else:
                    img = textured_background(size, rng)
                    dr = ImageDraw.Draw(img)
                    for _ in range(rng.randint(6, 14)):
                        x0, y0 = rng.randint(0, size[0] - 40), rng.randint(0, size[1] - 40)
                        x1, y1 = x0 + rng.randint(30, 400), y0 + rng.randint(30, 400)
                        col = tuple(rng.randint(0, 255) for _ in range(3))
                        (dr.ellipse if rng.random() < 0.5 else dr.rectangle)([x0, y0, x1, y1], fill=col)
                    img = img.filter(ImageFilter.GaussianBlur(rng.uniform(0.5, 3)))
                img = ImageChops.multiply(img, gradient_mult(img.size, rng, rng.uniform(0.7, 1.0)))
                img = add_noise(img, rng, rng.uniform(2, 8))
            meta["transform"] = {"size": list(img.size), "jpegQuality": q_jpeg}
            fname, fmt, kw = base + ".jpg", "JPEG", {"quality": q_jpeg}

        meta["file"] = fname
        img.save(out_dir / fname, fmt, **kw)
        (out_dir / (base + ".json")).write_text(json.dumps(meta, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
        entries.append({"file": fname, "expected": base + ".json", "profile": profile,
                        "layoutCode": layout["code"], "size": list(img.size)})
    return entries


def write_manifest(out_dir, entries, seed, note=""):
    manifest = {"generator": "tools/gen_sheets.py", "seed": seed, "note": note, "count": len(entries), "items": entries}
    (Path(out_dir) / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")


def smoke(out_dir, seed=7):
    """~8 imej kecil: 2 bersih, 3 herot, 2 kosong (kosong + 3 penanda), 1 skema."""
    out_dir = Path(out_dir)
    for old in list(out_dir.glob("*")) if out_dir.exists() else []:
        if old.suffix in (".png", ".jpg", ".json"):
            old.unlink()
    q = {c["numQuestions"]: c for c in CONFIGS}
    e = []
    e += generate("clean", 2, seed, out_dir, dpi=100, configs=[q[10], q[20]], smoke=True)
    e += generate("distorted", 3, seed, out_dir, dpi=100, long_range=(1100, 1200), configs=[q[20], q[40], q[60]], smoke=True)
    e += generate("blank", 1, seed, out_dir, dpi=100, configs=[q[20]], start=0, smoke=True)
    e += generate("blank", 1, seed, out_dir, dpi=100, configs=[q[20]], start=2, smoke=True)
    e += generate("key", 1, seed, out_dir, dpi=100, configs=[q[40]], smoke=True)
    write_manifest(out_dir, e, seed, "set smoke kecil (dikomit)")
    return e


def main(argv=None):
    ap = argparse.ArgumentParser(description="Jana kertas jawapan sintetik")
    ap.add_argument("--profile", choices=PROFILES, default="clean")
    ap.add_argument("--count", type=int, default=10)
    ap.add_argument("--seed", type=int, default=1)
    ap.add_argument("--out", default=None, help="folder output (lalai generated/<profile>)")
    ap.add_argument("--dpi", type=int, default=150)
    ap.add_argument("--smoke", action="store_true", help="tulis ~8 imej kecil ke tests/fixtures/sheets/smoke/")
    args = ap.parse_args(argv)

    if args.smoke:
        entries = smoke(Path(args.out) if args.out else SMOKE_OUT, args.seed if args.seed != 1 else 7)
        print(f"smoke: {len(entries)} imej -> {args.out or SMOKE_OUT}")
        return 0
    out = Path(args.out) if args.out else DEFAULT_OUT / args.profile
    entries = generate(args.profile, args.count, args.seed, out, dpi=args.dpi)
    write_manifest(out, entries, args.seed)
    print(f"{args.profile}: {len(entries)} imej -> {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
