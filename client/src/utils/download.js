/** Filename from a Content-Disposition header, or a safe fallback. Only the quoted filename= form is read. */
export function filenameFromDisposition(header, fallback = 'download.csv') {
  if (typeof header !== 'string') return fallback;
  const match = header.match(/filename="([^"\r\n]+)"/i);
  const name = match ? match[1].replace(/[^A-Za-z0-9._-]/g, '_') : '';
  return name || fallback;
}

/** Saves a Blob as a file in the browser. The object URL is released straight after the click. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  try {
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    URL.revokeObjectURL(url);
  }
}
