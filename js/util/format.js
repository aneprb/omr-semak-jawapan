const pad = (n) => String(n).padStart(2, '0');
export function formatDateTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function stamp(date = new Date()) {
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
}
export function stampWithTime(date = new Date()) {
  return `${stamp(date)}-${pad(date.getHours())}${pad(date.getMinutes())}`;
}
export function formatPercent(p) {
  return Number.isFinite(p) ? `${Math.round(p * 10) / 10}%` : '-';
}
export function slugify(s) {
  return String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'ujian';
}
