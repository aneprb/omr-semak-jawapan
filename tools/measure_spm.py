"""Ukur geometri borang "KERTAS JAWAPAN OBJEKTIF SPM (LPM/KOM 28 PIN.6/2001)" daripada gambar sebenar.

Menggunakan Pillow sahaja. Langkah:
  1. peta kemerahan (R - max(G,B)) pada gambar,
  2. padankan 4 sisi "bingkai rujukan" (kawasan jawapan: garis menegak kiri, garis mendatar atas,
     tepi kanan dan garis bawah bingkai luar) berhampiran sudut petunjuk (--hint),
  3. luruskan gambar ke bingkai rujukan (homografi) dan simpan imej ke scratch/,
  4. kesan elips merah (bulatan jawapan) pada imej lurus, kelompokkan kepada 12 lajur x 30 baris,
  5. cetak parameter ternormal (0..1 relatif kepada bingkai rujukan) dan, dengan --write-js,
     tulis js/omr/forms/spm-kom28.js (blok PARAMS ialah JSON yang juga dibaca oleh gen_sheets.py).

Gambar sebenar (tests/fixtures/real/) tidak dikomit; skrip ini hanya alat pembangun.
  python tools/measure_spm.py [--image LALUAN] [--write-js] [--hint x,y;x,y;x,y;x,y]
"""

from __future__ import annotations

import argparse
import json
import statistics
import sys
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))
from gen_sheets import apply_h, solve_h  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
DEFAULT_IMAGE = ROOT / "tests" / "fixtures" / "real" / "spm-kom28-001.jpg"
SCRATCH = ROOT / "scratch"
OUT_JS = ROOT / "js" / "omr" / "forms" / "spm-kom28.js"
# TL, TR, BR, BL anggaran kasar bingkai rujukan pada spm-kom28-001.jpg (piksel imej asal)
DEFAULT_HINT = [(569, 671), (1375, 657), (1409, 1935), (557, 1937)]
CHROMA_MIN = 14  # ambang kemerahan pada imej asal


def parse_hint(text: str):
    pts = [tuple(float(v) for v in p.split(",")) for p in text.split(";")]
    if len(pts) != 4:
        raise SystemExit("--hint mesti 4 titik: TL;TR;BR;BL")
    return pts


def chroma_map(im: Image.Image) -> Image.Image:
    r, g, b = im.split()
    return ImageChops.subtract(r, ImageChops.lighter(g, b))


# ------------------------------------------------------------------ padanan sisi
def fit_side(px, size, p, q, vertical, band=16, n=120):
    """Titik puncak kemerahan sepanjang sisi p->q, kemudian regresi linear teguh. -> (a, b) dengan
    mendatar: y = a x + b ; menegak: x = a y + b."""
    w, h = size
    pts = []
    for i in range(n):
        t = 0.06 + 0.88 * i / (n - 1)
        x = p[0] + (q[0] - p[0]) * t
        y = p[1] + (q[1] - p[1]) * t
        best, bv = None, CHROMA_MIN
        for d in range(-band, band + 1):
            if vertical:
                xx, yy = int(round(x)) + d, int(round(y))
                if not (1 <= xx < w - 1 and 1 <= yy < h - 1):
                    continue
                v = sum(px[xx, yy + k] for k in (-1, 0, 1)) / 3
                if v > bv:
                    best, bv = (xx, y), v
            else:
                xx, yy = int(round(x)), int(round(y)) + d
                if not (1 <= xx < w - 1 and 1 <= yy < h - 1):
                    continue
                v = sum(px[xx + k, yy] for k in (-1, 0, 1)) / 3
                if v > bv:
                    best, bv = (x, yy), v
        if best:
            pts.append(best)
    if len(pts) < 20:
        raise SystemExit("terlalu sedikit titik sisi; semak --hint")
    xs = [(pt[1] if vertical else pt[0]) for pt in pts]
    ys = [(pt[0] if vertical else pt[1]) for pt in pts]
    keep = [True] * len(xs)
    a = b = 0.0
    for _ in range(5):
        kx = [x for x, k in zip(xs, keep) if k]
        ky = [y for y, k in zip(ys, keep) if k]
        mx, my = sum(kx) / len(kx), sum(ky) / len(ky)
        sxx = sum((x - mx) ** 2 for x in kx) or 1.0
        a = sum((x - mx) * (y - my) for x, y in zip(kx, ky)) / sxx
        b = my - a * mx
        res = [abs(y - (a * x + b)) for x, y in zip(xs, ys)]
        med = statistics.median([r for r, k in zip(res, keep) if k])
        keep = [r < max(2.5, 3 * med) for r in res]
    return a, b, sum(keep) / len(keep)


def intersect(hline, vline):
    a, b = hline[0], hline[1]
    c, d = vline[0], vline[1]
    y = (a * d + b) / (1 - a * c)
    return (c * y + d, y)


def find_frame(im, hint):
    ch = chroma_map(im)
    px = ch.load()
    tl, tr, br, bl = hint
    top = fit_side(px, im.size, tl, tr, False)
    bot = fit_side(px, im.size, bl, br, False)
    left = fit_side(px, im.size, tl, bl, True)
    right = fit_side(px, im.size, tr, br, True)
    corners = [intersect(top, left), intersect(top, right), intersect(bot, right), intersect(bot, left)]
    return corners, {"top": top[2], "bottom": bot[2], "left": left[2], "right": right[2]}


# ------------------------------------------------------------------ luruskan
def rectify(im, corners, wr, hr, u0=-0.62, u1=1.06, v0=-0.45, v1=1.04):
    """Imej lurus meliputi u dalam [u0,u1], v dalam [v0,v1] (bingkai rujukan = [0,1]x[0,1])."""
    h_unit = solve_h([(0, 0), (wr, 0), (wr, hr), (0, hr)], corners)  # px bingkai -> imej
    w2, h2 = round((u1 - u0) * wr), round((v1 - v0) * hr)
    src = [(u0 * wr, v0 * hr), (u1 * wr, v0 * hr), (u1 * wr, v1 * hr), (u0 * wr, v1 * hr)]
    dst = [apply_h(h_unit, x, y) for x, y in src]
    coeffs = solve_h([(0, 0), (w2, 0), (w2, h2), (0, h2)], dst)
    out = im.transform((w2, h2), Image.PERSPECTIVE, coeffs, Image.BICUBIC)
    return out, (-u0 * wr, -v0 * hr), h_unit


# ------------------------------------------------------------------ komponen
def norm_red_mask(rgb: Image.Image, thr=0.10) -> Image.Image:
    """Topeng dakwat merah: (R - max(G,B)) / max(R, 50) > thr (tidak bergantung pada kecerahan)."""
    r, g, b = (list(band.tobytes()) for band in rgb.split())
    out = bytearray(len(r))
    for i, (rv, gv, bv) in enumerate(zip(r, g, b)):
        c = rv - (gv if gv > bv else bv)
        if c > 0 and c > thr * (rv if rv > 50 else 50):
            out[i] = 255
    m = Image.new("L", rgb.size)
    m.putdata(list(out))
    return m


def components(mask: Image.Image, min_area=20):
    w, h = mask.size
    data = mask.load()
    seen = bytearray(w * h)
    out = []
    for y0 in range(h):
        for x0 in range(w):
            if data[x0, y0] == 0 or seen[y0 * w + x0]:
                continue
            stack = [(x0, y0)]
            seen[y0 * w + x0] = 1
            n = 0
            sx = sy = 0
            mnx = mxx = x0
            mny = mxy = y0
            while stack:
                x, y = stack.pop()
                n += 1
                sx += x
                sy += y
                mnx, mxx = min(mnx, x), max(mxx, x)
                mny, mxy = min(mny, y), max(mxy, y)
                for dy in (-1, 0, 1):
                    for dx in (-1, 0, 1):
                        xx, yy = x + dx, y + dy
                        if 0 <= xx < w and 0 <= yy < h and data[xx, yy] and not seen[yy * w + xx]:
                            seen[yy * w + xx] = 1
                            stack.append((xx, yy))
            if n >= min_area:
                out.append({"n": n, "x0": mnx, "y0": mny, "x1": mxx, "y1": mxy, "cx": (mnx + mxx) / 2, "cy": (mny + mxy) / 2})
    return out


def cluster_1d(values, gap):
    vs = sorted(values)
    groups = [[vs[0]]]
    for v in vs[1:]:
        if v - groups[-1][-1] > gap:
            groups.append([v])
        else:
            groups[-1].append(v)
    return groups


def smooth(vals, win):
    n = len(vals)
    half = win // 2
    out = []
    acc = [0.0]
    for v in vals:
        acc.append(acc[-1] + v)
    for i in range(n):
        lo, hi = max(0, i - half), min(n, i + half + 1)
        out.append((acc[hi] - acc[lo]) / (hi - lo))
    return out


def find_peaks(vals, win, min_frac, min_dist):
    sm = smooth(vals, win)
    top = max(sm)
    cand = [i for i in range(1, len(sm) - 1) if sm[i] >= sm[i - 1] and sm[i] > sm[i + 1] and sm[i] >= min_frac * top]
    cand.sort(key=lambda i: -sm[i])
    chosen = []
    for i in cand:
        if all(abs(i - j) >= min_dist for j in chosen):
            chosen.append(i)
    return sorted(chosen)


def com(vals, centre, half):
    lo, hi = max(0, int(centre) - half), min(len(vals), int(centre) + half + 1)
    tot = sum(vals[lo:hi])
    return sum(i * vals[i] for i in range(lo, hi)) / tot if tot else float(centre)


def measure(im, corners, wr, hr):
    rect, (ox, oy), _ = rectify(im, corners, wr, hr)
    # kawasan jawapan sahaja (bingkai rujukan, tolak sempadan)
    x_lo, x_hi = int(ox + 0.03 * wr), int(ox + 0.98 * wr)
    y_lo, y_hi = int(oy + 0.06 * hr), int(oy + 0.97 * hr)
    sub = norm_red_mask(rect.crop((x_lo, y_lo, x_hi, y_hi)))
    w, h = sub.size
    # saiz elips + lajur x: komponen elips yang munasabah dikelompokkan mengikut x (abaikan label nombor)
    comps = components(sub)
    ell = [c for c in comps if 24 <= c["x1"] - c["x0"] + 1 <= 33 and 15 <= c["y1"] - c["y0"] + 1 <= 23]
    groups = [g for g in cluster_1d([c["cx"] for c in ell], 0.02 * wr) if len(g) >= 10]
    xs = [statistics.median(g) + x_lo for g in groups]
    xs_seed = [round(v - x_lo) for v in xs]
    # baris y: profil mendatar pada lajur bulatan sahaja
    keep = Image.new("L", (w, h), 0)
    for xc in xs_seed:
        keep.paste(sub.crop((max(0, xc - 14), 0, min(w, xc + 15), h)), (max(0, xc - 14), 0))
    prof_y = list(keep.resize((1, h), Image.BOX).tobytes())
    ys_seed = find_peaks(prof_y, 9, 0.25, 15)
    ys = [com(prof_y, y, 10) + y_lo for y in ys_seed]
    return rect, (ox, oy), xs, ys, ell


def build_params(xs, ys, ell, wr, hr, aspect, ox, oy):
    if len(xs) != 12:
        raise SystemExit(f"dijangka 12 lajur x, dapat {len(xs)}: {[round((v - ox) / wr, 3) for v in xs]}")
    if len(ys) != 30:
        raise SystemExit(f"dijangka 30 baris y, dapat {len(ys)}: {[round((v - oy) / hr, 3) for v in ys]}")
    rx = statistics.median([c["x1"] - c["x0"] + 1 for c in ell]) / 2 / wr
    ry = statistics.median([c["y1"] - c["y0"] + 1 for c in ell]) / 2 / hr
    col_x = [[round((xs[c * 4 + k] - ox) / wr, 5) for k in range(4)] for c in range(3)]
    row_v = [round((v - oy) / hr, 5) for v in ys]
    return {
        "aspect": round(aspect, 4),
        "choices": ["A", "B", "C", "D"],
        "maxQuestions": 80,
        "perColumn": 30,
        "blockSize": 5,
        "bubble": {"rx": round(rx, 5), "ry": round(ry, 5)},
        "colX": col_x,
        "rowV": row_v,
        "name": {"u": -0.55, "v": -0.205, "w": 0.53, "h": 0.093},
    }


JS_TEMPLATE = """// Geometri borang "KERTAS JAWAPAN OBJEKTIF SPM" (LPM/KOM 28 PIN.6/2001), dicetak dakwat merah.
// DIJANA oleh tools/measure_spm.py daripada gambar sebenar; blok PARAMS ialah JSON (dibaca juga oleh
// tools/gen_sheets.py). Koordinat ternormal: u = 0..1 merentas lebar, v = 0..1 merentas tinggi
// "bingkai rujukan" = kawasan jawapan: sisi kiri ialah garis menegak antara maklumat calon dan kawasan
// jawapan, sisi atas ialah garis mendatar di bawah kotak pengawas, sisi kanan dan bawah ialah bingkai luar.
// Unit panjang dalam lapis susun atur: x = u, y = v * aspect (supaya bulatan kekal bulat/elips sebenar).

/*PARAMS-START*/
export const SPM_KOM28_PARAMS = __PARAMS__;
/*PARAMS-END*/

export const SPM_KOM28 = "spm-kom28";
export const SPM_MAX_QUESTIONS = SPM_KOM28_PARAMS.maxQuestions;

/** Pusat bulatan (u, v) soalan q (1-based) pilihan k (0=A..3=D). */
export function bubbleUV(q, k) {
  const p = SPM_KOM28_PARAMS;
  const col = Math.floor((q - 1) / p.perColumn);
  const row = (q - 1) % p.perColumn;
  return { u: p.colX[col][k], v: p.rowV[row] };
}

/** Blok 5 soalan (indeks 0..): { col, row0 } untuk soalan pertama dalam blok. */
export function blockOf(q) {
  const p = SPM_KOM28_PARAMS;
  const col = Math.floor((q - 1) / p.perColumn);
  const row = (q - 1) % p.perColumn;
  return { col, block: Math.floor(row / p.blockSize), row };
}

function r4(v) {
  return Math.round(v * 1e4) / 1e4;
}

/**
 * Susun atur dalam bentuk yang sama dengan buildLayout() (supaya overlay/semakan berfungsi), tetapi
 * koordinat ialah unit bingkai: x = u, y = v * aspect. config = { numQuestions: 1..80 }.
 */
export function buildSpmLayout(config) {
  const p = SPM_KOM28_PARAMS;
  const n = config && Number.isInteger(config.numQuestions) ? config.numQuestions : 0;
  if (n < 1 || n > p.maxQuestions) {
    const err = new Error("LAYOUT_INVALID: numQuestions mesti integer 1.." + p.maxQuestions);
    err.code = "LAYOUT_INVALID";
    throw err;
  }
  const a = p.aspect;
  const rxy = p.bubble;
  const questions = [];
  for (let q = 1; q <= n; q++) {
    const { col, row } = blockOf(q);
    questions.push({
      q,
      col,
      row,
      labelX: r4(p.colX[col][0] - 0.05),
      labelY: r4(p.rowV[row] * a),
      bubbles: p.choices.map((choice, k) => ({
        choice,
        cx: r4(p.colX[col][k]),
        cy: r4(p.rowV[row] * a),
        r: r4(Math.sqrt(rxy.rx * rxy.ry)),
        rx: r4(rxy.rx),
        ry: r4(rxy.ry * a),
      })),
    });
  }
  const nm = p.name;
  return {
    schema: "omr-layout",
    format: SPM_KOM28,
    version: 1,
    code: "SPM-KOM28-Q" + n,
    config: { numQuestions: n, numChoices: 4, idDigits: 0 },
    page: { widthMm: 1, heightMm: a },
    frame: { aspect: a },
    markers: [],
    orientationBar: null,
    regions: {
      name: { x: nm.u, y: r4(nm.v * a), w: nm.w, h: r4(nm.h * a) },
      className: { x: nm.u, y: r4((nm.v + nm.h) * a), w: nm.w, h: r4(0.03 * a) },
    },
    choices: p.choices.slice(),
    bubbleRadius: r4(Math.sqrt(rxy.rx * rxy.ry)),
    questions,
    choiceHeaders: [],
    idBlock: null,
  };
}
"""


def main(argv=None):
    ap = argparse.ArgumentParser(description="Ukur geometri borang SPM KOM28")
    ap.add_argument("--image", default=str(DEFAULT_IMAGE))
    ap.add_argument("--hint", default=None, help="TL;TR;BR;BL sebagai x,y;x,y;x,y;x,y")
    ap.add_argument("--write-js", action="store_true", help="tulis js/omr/forms/spm-kom28.js")
    args = ap.parse_args(argv)

    path = Path(args.image)
    if not path.exists():
        print(f"Gambar tiada: {path}", file=sys.stderr)
        return 1
    im = Image.open(path).convert("RGB")
    hint = parse_hint(args.hint) if args.hint else DEFAULT_HINT
    corners, support = find_frame(im, hint)
    print("sudut bingkai (TL,TR,BR,BL):", [(round(x, 1), round(y, 1)) for x, y in corners])
    print("sokongan sisi:", {k: round(v, 2) for k, v in support.items()})

    wt = (abs(corners[1][0] - corners[0][0]) + abs(corners[2][0] - corners[3][0])) / 2
    ht = (abs(corners[3][1] - corners[0][1]) + abs(corners[2][1] - corners[1][1])) / 2
    wr, hr = round(wt), round(ht)
    aspect = hr / wr
    print(f"saiz lurus {wr}x{hr}, aspect {aspect:.4f}")

    rect, (ox, oy), xs, ys, ell = measure(im, corners, wr, hr)
    SCRATCH.mkdir(exist_ok=True)
    rect.save(SCRATCH / "spm_rect.png")
    print(f"lajur x: {len(xs)}; baris y: {len(ys)}; elips contoh saiz: {len(ell)}")
    params = build_params(xs, ys, ell, wr, hr, aspect, ox, oy)
    print(json.dumps(params))

    # imej semak: grid hasil ukuran dilukis pada imej lurus
    ov = rect.copy()
    d = ImageDraw.Draw(ov)
    rx, ry = params["bubble"]["rx"] * wr, params["bubble"]["ry"] * hr
    for q in range(1, 81):
        col = (q - 1) // 30
        row = (q - 1) % 30
        for k in range(4):
            cx = ox + params["colX"][col][k] * wr
            cy = oy + params["rowV"][row] * hr
            d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], outline=(0, 160, 0), width=1)
    nm = params["name"]
    d.rectangle([ox + nm["u"] * wr, oy + nm["v"] * hr, ox + (nm["u"] + nm["w"]) * wr, oy + (nm["v"] + nm["h"]) * hr], outline=(0, 0, 255), width=2)
    ov.save(SCRATCH / "spm_overlay.png")
    print("imej semak:", SCRATCH / "spm_overlay.png")

    if args.write_js:
        OUT_JS.parent.mkdir(parents=True, exist_ok=True)
        body = "{" + chr(10) + ("," + chr(10)).join(f'  "{k}": {json.dumps(v)}' for k, v in params.items()) + chr(10) + "}"
        text = JS_TEMPLATE.replace("__PARAMS__", body)
        OUT_JS.write_text(text, encoding="utf-8", newline="\n")
        print("ditulis:", OUT_JS)
    return 0


if __name__ == "__main__":
    sys.exit(main())
