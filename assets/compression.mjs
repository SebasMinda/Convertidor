/** PDF processing without UI state. Pages are rendered sequentially to bound memory. */
export const COMPRESSION = Object.freeze({
  high: { dpi: 180, jpeg: 0.9 },
  balanced: { dpi: 144, jpeg: 0.82 },
});
export const MAX_PDF_BYTES = 100 * 1024 * 1024;
export const MAX_PAGES = 250;

export function checkCancelled(signal) {
  if (signal?.aborted) throw new DOMException('Operación cancelada', 'AbortError');
}

export function renderScale(width, height, dpi) {
  // A very large engineering sheet must not allocate an unbounded canvas.
  return Math.min(dpi / 72, 4000 / Math.max(width, height), Math.sqrt(8_000_000 / (width * height)));
}

export function chooseSmaller(original, candidate) {
  const reduced = candidate.byteLength < original.byteLength;
  return { bytes: reduced ? candidate : original, reduced,
    savedPercent: reduced ? (1 - candidate.byteLength / original.byteLength) * 100 : 0 };
}

function jpegBytes(canvas, quality) {
  return new Promise((resolve, reject) => canvas.toBlob(async (blob) => {
    if (!blob) { reject(new Error('No se pudo procesar esta página.')); return; }
    try { resolve(new Uint8Array(await blob.arrayBuffer())); } catch (error) { reject(error); }
  }, 'image/jpeg', quality));
}

/** Lossless keeps the existing document catalog, annotations, forms and text. */
export async function compressPDF(original, { mode, pdfLib, pdfjs, signal,
  onProgress = () => {}, createCanvas = () => document.createElement('canvas'), pdfOptions = {} }) {
  if (!original.byteLength || original.byteLength > MAX_PDF_BYTES) throw new Error('Elige un PDF de hasta 100 MB.');
  checkCancelled(signal);
  if (mode === 'lossless') {
    onProgress(10, 'Optimizando la estructura sin cambiar las páginas…');
    const source = await pdfLib.PDFDocument.load(original, { updateMetadata: false });
    checkCancelled(signal);
    if (source.getPageCount() > MAX_PAGES) throw new Error('El PDF supera las 250 páginas.');
    const candidate = await source.save({ useObjectStreams: true, updateFieldAppearances: false, objectsPerTick: 30 });
    checkCancelled(signal);
    onProgress(100, 'Optimización terminada.');
    return { ...chooseSmaller(original, candidate), pageCount: source.getPageCount() };
  }
  const profile = COMPRESSION[mode];
  if (!profile) throw new Error('Selecciona un tipo de compresión válido.');
  onProgress(2, 'Leyendo tu PDF…');
  // PDF.js transfers its data buffer to a worker. Preserve the original for fallback.
  const task = pdfjs.getDocument({ ...pdfOptions, data: original.slice(), isEvalSupported: false,
    enableXfa: false, useSystemFonts: true, stopAtErrors: true });
  const stopLoading = () => { void task.destroy().catch(() => {}); };
  signal?.addEventListener('abort', stopLoading, { once: true });
  let source;
  try {
    source = await task.promise;
    checkCancelled(signal);
    if (source.numPages > MAX_PAGES) throw new Error('El PDF supera las 250 páginas.');
    const output = await pdfLib.PDFDocument.create();
    output.setProducer('Convertidor · Compresión local');
    for (let index = 1; index <= source.numPages; index++) {
      checkCancelled(signal);
      onProgress(5 + (index - 1) / source.numPages * 88, `Procesando página ${index} de ${source.numPages}…`);
      const page = await source.getPage(index);
      const actual = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: renderScale(actual.width, actual.height, profile.dpi) });
      const canvas = createCanvas();
      let renderTask;
      const stopRendering = () => renderTask?.cancel();
      signal?.addEventListener('abort', stopRendering, { once: true });
      try {
        canvas.width = Math.max(1, Math.ceil(viewport.width));
        canvas.height = Math.max(1, Math.ceil(viewport.height));
        renderTask = page.render({ canvasContext: canvas.getContext('2d'), viewport,
          background: 'rgb(255,255,255)', intent: 'print', annotationMode: 1 });
        await renderTask.promise;
        checkCancelled(signal);
        const image = await output.embedJpg(await jpegBytes(canvas, profile.jpeg));
        const target = output.addPage([actual.width, actual.height]);
        target.drawImage(image, { x: 0, y: 0, width: actual.width, height: actual.height });
      } finally {
        signal?.removeEventListener('abort', stopRendering);
        canvas.width = 1; canvas.height = 1;
        page.cleanup();
      }
      // Allow progress, cancellation and other controls to update between pages.
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    checkCancelled(signal);
    onProgress(95, 'Comparando el tamaño con el original…');
    const candidate = await output.save({ useObjectStreams: true });
    checkCancelled(signal);
    onProgress(100, 'Tu PDF está listo.');
    return { ...chooseSmaller(original, candidate), pageCount: source.numPages };
  } finally {
    signal?.removeEventListener('abort', stopLoading);
    await task.destroy();
  }
}
