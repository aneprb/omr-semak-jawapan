// Layout -> SVG answer sheet (mm units). All geometry comes from the Layout object only.
// Pure function: returns an SVG string. User text is XML-escaped.

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const FONT = 'font-family="Arial, Helvetica, sans-serif"';

/**
 * @param {object} layout from buildLayout()
 * @param {{title?: string, schoolName?: string, testName?: string, labels?: {name:string, className:string, date:string}}} opts
 */
export function renderSheetSvg(layout, { title = '', schoolName = '', testName = '', labels = {} } = {}) {
  const { page, markers, orientationBar: ob, regions: rg, questions, choiceHeaders, idBlock, footer } = layout;
  const L = { name: 'Nama', className: 'Kelas', date: 'Tarikh', ...labels };
  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${page.widthMm} ${page.heightMm}" width="${page.widthMm}mm" height="${page.heightMm}mm" role="img" aria-label="${esc(testName || title)}">`);
  out.push(`<rect x="0" y="0" width="${page.widthMm}" height="${page.heightMm}" fill="#fff"/>`);

  for (const m of markers) {
    out.push(`<rect x="${m.cx - m.size / 2}" y="${m.cy - m.size / 2}" width="${m.size}" height="${m.size}" fill="#000"/>`);
  }
  out.push(`<rect x="${ob.x}" y="${ob.y}" width="${ob.w}" height="${ob.h}" fill="#000"/>`);

  // Header text: school (small) and test title (bold) inside the title region.
  if (schoolName) out.push(`<text x="${rg.title.x}" y="${rg.title.y - 1}" ${FONT} font-size="3.2" fill="#000">${esc(schoolName)}</text>`);
  out.push(`<text x="${rg.title.x}" y="${rg.title.y + 6}" ${FONT} font-size="5" font-weight="bold" fill="#000">${esc(testName || title)}</text>`);

  for (const key of ['name', 'className', 'date']) {
    const r = rg[key];
    out.push(`<text x="${r.x}" y="${r.y + r.h - 2.5}" ${FONT} font-size="3.4" fill="#000">${esc(L[key])}:</text>`);
    out.push(`<line x1="${r.x + 16}" y1="${r.y + r.h - 1.5}" x2="${r.x + r.w}" y2="${r.y + r.h - 1.5}" stroke="#000" stroke-width="0.25"/>`);
  }

  if (idBlock) {
    out.push(`<text x="${idBlock.label.x}" y="${idBlock.label.y}" ${FONT} font-size="3.2" font-weight="bold" fill="#000">${esc(L.idLabel ?? 'Kod pelajar')}</text>`);
    for (const b of idBlock.writeBoxes) {
      out.push(`<rect x="${b.x}" y="${b.y}" width="${b.w}" height="${b.h}" fill="none" stroke="#000" stroke-width="0.3"/>`);
    }
    for (const col of idBlock.digits) {
      for (const b of col.bubbles) {
        out.push(`<circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" fill="none" stroke="#555" stroke-width="0.3"/>`);
        // Digit label sits beside the first column, never inside a bubble (would bias fill sampling).
        if (col.index === 0) out.push(`<text x="${b.cx - 4.6}" y="${b.cy + 0.9}" ${FONT} font-size="2.6" fill="#000" text-anchor="end">${b.digit}</text>`);
      }
    }
  }

  for (const hd of choiceHeaders) {
    out.push(`<text x="${hd.x}" y="${hd.y}" ${FONT} font-size="3.4" font-weight="bold" fill="#000" text-anchor="middle">${esc(hd.choice)}</text>`);
  }
  for (const q of questions) {
    out.push(`<text x="${q.labelX + 6}" y="${q.labelY + 1.2}" ${FONT} font-size="3.4" fill="#000" text-anchor="end">${q.q}</text>`);
    for (const b of q.bubbles) {
      out.push(`<circle cx="${b.cx}" cy="${b.cy}" r="${b.r}" fill="none" stroke="#555" stroke-width="0.3"/>`);
    }
  }

  out.push(`<text x="${footer.x}" y="${footer.y}" ${FONT} font-size="2.8" fill="#000" text-anchor="middle">${esc(footer.text)}</text>`);
  out.push(`<text x="${page.widthMm - 22}" y="${footer.y + 6}" ${FONT} font-size="2.4" fill="#666" text-anchor="end">${esc(layout.code)}</text>`);
  out.push('</svg>');
  return out.join('');
}

/** Parse the SVG string into a DOM node without innerHTML. */
export function svgToNode(svgString) {
  const doc = new DOMParser().parseFromString(svgString, 'image/svg+xml');
  return document.importNode(doc.documentElement, true);
}
