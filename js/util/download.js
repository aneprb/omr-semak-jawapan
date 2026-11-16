import { isIOS } from './platform.js';

function anchorDownload(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.rel = 'noopener';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// iOS: a[download] on blobs sometimes opens a tab instead. Use the share sheet when files can be
// shared; fall back to the anchor method if share is unsupported or fails (not if user cancels).
// Returns a Promise<'shared'|'cancelled'|'downloaded'>; callers may ignore it.
export async function downloadText(filename, text, mime = 'text/csv;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  if (isIOS() && typeof navigator.share === 'function' && typeof navigator.canShare === 'function') {
    try {
      const file = new File([blob], filename, { type: mime.split(';')[0] });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: filename });
        return 'shared';
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return 'cancelled';
      // otherwise fall through to the anchor method
    }
  }
  anchorDownload(filename, blob);
  return 'downloaded';
}
