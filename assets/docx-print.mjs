/** Print semantic HTML instead of screenshots to retain crisp, selectable text. */
export const DOCX_OPTIONS = Object.freeze({
  className: 'docx', inWrapper: true, hideWrapperOnPrint: true,
  breakPages: true, ignoreLastRenderedPageBreak: false, useBase64URL: true,
  renderHeaders: true, renderFooters: true, renderFootnotes: true,
  renderEndnotes: true, renderAltChunks: false, renderComments: false,
});

export function frameHTML() {
  // The preview never fetches remote document resources or executes document scripts.
  return `<!doctype html><html lang="es"><head><meta charset="utf-8">
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: blob:; font-src data: blob:; style-src 'unsafe-inline';">
    <title>Documento</title></head><body><div id="docx-styles"></div><div id="docx-content"></div></body></html>`;
}

export function preparePrint(doc) {
  doc.querySelectorAll('script,iframe,object,embed,form').forEach((node) => node.remove());
  // A preview is for reading: disable navigation and external resource references.
  doc.querySelectorAll('[href]').forEach((node) => {
    if (!node.getAttribute('href')?.startsWith('#')) node.removeAttribute('href');
  });
  doc.querySelectorAll('[src]').forEach((node) => {
    if (!/^(data:|blob:)/i.test(node.getAttribute('src') || '')) node.removeAttribute('src');
  });
  const sections = [...doc.querySelectorAll('section.docx')];
  if (!sections.length) throw new Error('El DOCX no contiene páginas que se puedan mostrar.');
  const css = [];
  sections.forEach((section, index) => {
    const page = `wordpage${index}`;
    const s = section.style;
    // Named pages preserve each section's paper size and margins, including landscape.
    const width = s.width || '595.3pt', height = s.minHeight || '841.9pt';
    const margins = [s.paddingTop, s.paddingRight, s.paddingBottom, s.paddingLeft].map((v) => v || '0pt');
    css.push(`@page ${page} { size: ${width} ${height}; margin: ${margins.join(' ')}; }`);
    css.push(`@media print { section.docx:nth-of-type(${index + 1}) { page: ${page}; } }`);
  });
  const style = doc.createElement('style');
  style.textContent = `
    html, body { margin: 0; padding: 0; } body { background: #ecebe6; }
    .docx-wrapper { padding: 20px !important; align-items: flex-start !important; width: max-content; min-width: 100%; box-sizing: border-box; background: #ecebe6 !important; }
    .docx-wrapper > section.docx { margin: 0 auto 20px; flex-shrink: 0; box-shadow: 0 2px 8px #0001; }
    @media print {
      html, body { background: white; }
      * { print-color-adjust: exact; -webkit-print-color-adjust: exact; }
      .docx-wrapper { display: block !important; padding: 0 !important; width: auto !important; min-width: 0 !important; background: white !important; }
      section.docx { display: block !important; width: auto !important; min-height: 0 !important; height: auto !important; padding: 0 !important; margin: 0 !important; overflow: visible !important; box-shadow: none !important; break-after: page; }
      section.docx:last-child { break-after: auto; }
      section.docx > article { margin: 0 !important; }
      tr, img { break-inside: avoid; } p { orphans: 2; widows: 2; }
    }
    ${css.join('\n')}`;
  doc.head.append(style);
  return sections.length;
}

/** Wait for embedded fonts and image decoding before enabling the print button. */
export async function waitForDocument(doc) {
  await doc.fonts?.ready;
  await Promise.all([...doc.images].map((image) => image.complete ? Promise.resolve() : new Promise((resolve) => {
    image.addEventListener('load', resolve, { once: true });
    image.addEventListener('error', resolve, { once: true });
  })));
}
