/** Calculations are independent of the interface so export and preview agree. */
export const QUALITIES = Object.freeze({
  compact: { maxSide: 1600, jpeg: 0.72 },
  balanced: { maxSide: 2400, jpeg: 0.86 },
  high: { maxSide: 4000, jpeg: 0.96 },
});
const MM_TO_PT = 72 / 25.4;
export function imageDimensions(width, height, rotation) {
  return rotation % 180 === 0 ? [width, height] : [height, width];
}
export function pageLayout(width, height, { size, orientation, margin }) {
  const inset = Math.max(0, Number(margin)) * MM_TO_PT;
  let pageWidth, pageHeight;
  if (size === 'original') {
    // Treat pixels as 96 dpi, keeping the PDF below its 14,400 point page limit.
    const ratio = Math.min(0.75, (14400 - inset * 2) / Math.max(width, height));
    pageWidth = width * ratio + inset * 2;
    pageHeight = height * ratio + inset * 2;
  } else {
    [pageWidth, pageHeight] = size === 'letter' ? [612, 792] : [595.276, 841.89];
    if (orientation === 'landscape' || (orientation === 'auto' && width > height)) {
      [pageWidth, pageHeight] = [pageHeight, pageWidth];
    }
  }
  const scale = Math.min((pageWidth - inset * 2) / width, (pageHeight - inset * 2) / height);
  const drawWidth = width * scale, drawHeight = height * scale;
  return { pageWidth, pageHeight, drawWidth, drawHeight, x: (pageWidth - drawWidth) / 2, y: (pageHeight - drawHeight) / 2 };
}
export function safeFilename(value) {
  return (value.trim().replace(/\.pdf$/i, '').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/\.+$/g, '').trim() || 'mis-imagenes') + '.pdf';
}
