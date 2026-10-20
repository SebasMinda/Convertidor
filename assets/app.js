import { QUALITIES, imageDimensions, pageLayout, safeFilename } from './pdf-core.mjs';

const $ = (id) => document.getElementById(id);
const images = [];
const LIMIT = 100;
const MAX_BYTES = 50 * 1024 * 1024;
const ACCEPTED = new Set(['image/jpeg', 'image/png', 'image/webp']);
let busy = false;
let dragId = null;
const settings = () => ({ size: $('page-size').value, orientation: $('orientation').value, margin: $('margin').value });
const yieldFrame = () => new Promise((resolve) => setTimeout(resolve, 0));
const formatBytes = (bytes) => bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function announce(text, kind = '') {
  $('message').textContent = text;
  $('message').className = `message ${kind}`;
  $('message').hidden = !text;
}

// Decode one original at a time; release its URL once the thumbnail/export is ready.
async function loadImage(file) {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('No se pudo leer la imagen'));
      image.src = url;
    });
    return { image, release: () => { image.src = ''; URL.revokeObjectURL(url); } };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

function canvasBlob(canvas, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('No se pudo procesar la imagen')), 'image/jpeg', quality));
}

/** Rasterize with rotation and a white background for transparent source images. */
async function rasterize(image, rotation, maxSide, quality) {
  const [width, height] = imageDimensions(image.naturalWidth, image.naturalHeight, rotation);
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Tu navegador no permite procesar imágenes');
  context.fillStyle = '#fff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.translate(canvas.width / 2, canvas.height / 2);
  context.rotate(rotation * Math.PI / 180);
  const quarterTurn = rotation % 180 !== 0;
  const drawWidth = quarterTurn ? canvas.height : canvas.width;
  const drawHeight = quarterTurn ? canvas.width : canvas.height;
  context.drawImage(image, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
  try { return await canvasBlob(canvas, quality); }
  finally { canvas.width = 1; canvas.height = 1; }
}

function icon(name) {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('aria-hidden', 'true');
  const use = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  use.setAttribute('href', `#i-${name}`);
  svg.append(use);
  return svg;
}

function actionButton(label, name, callback, disabled = false) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = `icon-button ${name === 'trash' ? 'remove' : ''}`;
  button.setAttribute('aria-label', label);
  button.title = label;
  button.disabled = disabled || busy;
  button.append(icon(name));
  button.addEventListener('click', callback);
  return button;
}

function reorder(from, to, focusIndex) {
  if (busy || from < 0 || to < 0 || from >= images.length || to >= images.length || from === to) return;
  images.splice(to, 0, images.splice(from, 1)[0]);
  render();
  if (focusIndex !== undefined) $('image-list').children[to]?.querySelectorAll('button')[focusIndex]?.focus();
  announce(`Página movida a la posición ${to + 1}.`);
}

function render() {
  document.querySelectorAll('[role="tab"]').forEach((tab) => { tab.disabled = busy; });
  const count = images.length;
  $('image-count').textContent = count;
  $('clear-all').hidden = !count;
  $('clear-all').disabled = busy;
  $('list-toolbar').hidden = !count;
  $('dropzone').classList.toggle('compact', !!count);
  $('select-images').innerHTML = '';
  $('select-images').append(icon('plus'), document.createTextNode(count ? 'Añadir imágenes' : 'Elegir imágenes'));
  ['file-input', 'select-images', 'add-more'].forEach((id) => { $(id).disabled = busy; });
  $('convert').disabled = busy || !count;
  $('size-summary').textContent = `${count} ${count === 1 ? 'imagen' : 'imágenes'}`;
  $('summary').textContent = count ? `${count} ${count === 1 ? 'página' : 'páginas'} en tu PDF` : 'Todo listo para empezar';
  const fragment = document.createDocumentFragment();
  images.forEach((item, index) => {
    const li = document.createElement('li');
    li.className = 'image-item';
    li.draggable = !busy;
    const thumb = document.createElement('div');
    thumb.className = 'image-thumb';
    const img = document.createElement('img');
    img.src = item.thumbnail;
    img.alt = `Vista previa de ${item.file.name}`;
    img.draggable = false;
    img.style.transform = `rotate(${item.rotation}deg)`;
    if (item.rotation % 180) img.style.maxWidth = '80%';
    thumb.append(img);
    const details = document.createElement('div');
    details.className = 'image-details';
    const name = document.createElement('strong');
    name.textContent = item.file.name;
    name.title = item.file.name;
    const dimensions = document.createElement('p');
    const [width, height] = imageDimensions(item.width, item.height, item.rotation);
    dimensions.textContent = `${width} × ${height} · ${formatBytes(item.file.size)}`;
    const number = document.createElement('span');
    number.className = 'page-number';
    number.textContent = `PÁGINA ${String(index + 1).padStart(2, '0')}`;
    details.append(name, dimensions, number);
    const actions = document.createElement('div');
    actions.className = 'image-actions';
    actions.append(
      actionButton(`Subir página ${index + 1}`, 'up', () => reorder(index, index - 1, 1), index === 0),
      actionButton(`Bajar página ${index + 1}`, 'down', () => reorder(index, index + 1, 0), index === count - 1),
      actionButton(`Girar página ${index + 1}`, 'turn', () => { item.rotation = (item.rotation + 90) % 360; render(); $('image-list').children[index].querySelectorAll('button')[2].focus(); }),
      actionButton(`Quitar página ${index + 1}`, 'trash', () => { URL.revokeObjectURL(item.thumbnail); images.splice(index, 1); render(); announce('Imagen eliminada.'); })
    );
    li.append(thumb, details, actions);
    li.addEventListener('dragstart', (event) => {
      if (busy || event.target.closest('button')) { event.preventDefault(); return; }
      dragId = item.id;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.id);
      li.classList.add('dragging');
    });
    li.addEventListener('dragover', (event) => { if (dragId && !busy) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; li.classList.add('drop-target'); } });
    li.addEventListener('dragleave', () => li.classList.remove('drop-target'));
    li.addEventListener('dragend', () => { dragId = null; document.querySelectorAll('.dragging,.drop-target').forEach((node) => node.classList.remove('dragging', 'drop-target')); });
    li.addEventListener('drop', (event) => {
      if (!dragId || busy) return;
      event.preventDefault();
      const from = images.findIndex((image) => image.id === dragId);
      dragId = null;
      reorder(from, index);
    });
    fragment.append(li);
  });
  $('image-list').replaceChildren(fragment);
  updatePreview();
}

function updatePreview() {
  const options = settings();
  $('orientation').disabled = busy || options.size === 'original';
  const first = images[0];
  const [width, height] = first ? imageDimensions(first.width, first.height, first.rotation) : [700, 990];
  const layout = pageLayout(width, height, options);
  const scale = Math.min(105 / layout.pageHeight, 140 / layout.pageWidth);
  const preview = $('page-preview');
  preview.style.width = `${layout.pageWidth * scale}px`;
  preview.style.height = `${layout.pageHeight * scale}px`;
  preview.style.padding = `${Number(options.margin) * 72 / 25.4 * scale}px`;
  if (first) {
    const img = document.createElement('img');
    img.src = first.thumbnail;
    img.alt = '';
    img.style.transform = `rotate(${first.rotation}deg)`;
    if (first.rotation % 180) { img.style.width = `${layout.drawHeight * scale}px`; img.style.height = `${layout.drawWidth * scale}px`; img.style.flexShrink = '0'; }
    $('preview-image').replaceChildren(img);
  } else $('preview-image').replaceChildren(icon('image'));
  const title = options.size === 'original' ? 'Tamaño de la imagen' : options.size === 'letter' ? 'Carta' : 'A4';
  $('preview-caption').textContent = `${title} · ${layout.pageWidth > layout.pageHeight ? 'Horizontal' : 'Vertical'}`;
}

async function addFiles(fileList) {
  if (busy || !fileList.length) return;
  busy = true;
  render();
  const errors = [];
  let added = 0;
  try {
    for (const file of fileList) {
      if (images.length >= LIMIT) { errors.push(`Puedes añadir hasta ${LIMIT} imágenes por documento.`); break; }
      if (!ACCEPTED.has(file.type) && !(!file.type && /\.(jpe?g|png|webp)$/i.test(file.name))) { errors.push(`${file.name}: usa JPG, PNG o WebP.`); continue; }
      if (file.size > MAX_BYTES) { errors.push(`${file.name}: supera los 50 MB.`); continue; }
      let source;
      try {
        source = await loadImage(file);
        const { naturalWidth: width, naturalHeight: height } = source.image;
        if (!width || !height || width * height > 80_000_000) throw new Error('La imagen supera los 80 megapíxeles o no es válida');
        const thumbnail = URL.createObjectURL(await rasterize(source.image, 0, 240, 0.75));
        images.push({ id: crypto.randomUUID(), file, width, height, rotation: 0, thumbnail });
        added++;
        announce(`Preparando imágenes… ${added} añadidas.`);
        await yieldFrame();
      } catch (error) { errors.push(`${file.name}: ${error.message}.`); }
      finally { source?.release(); }
    }
  } finally { busy = false; $('file-input').value = ''; render(); }
  const notice = added ? `${added} ${added === 1 ? 'imagen añadida' : 'imágenes añadidas'}. Puedes girarlas y cambiar su orden.` : '';
  announce([notice, ...errors].filter(Boolean).join('\n'), errors.length ? 'error' : '');
}

async function exportPDF(event) {
  event.preventDefault();
  if (busy || !images.length) return;
  if (!window.PDFLib) { announce('No se pudo cargar el motor de PDF. Recarga la página e inténtalo de nuevo.', 'error'); return; }
  busy = true;
  const options = settings();
  const quality = QUALITIES[$('quality').value];
  render();
  $('settings-form').querySelectorAll('input,select').forEach((input) => { input.disabled = true; });
  $('progress-area').hidden = false;
  $('export-progress').value = 0;
  announce('');
  try {
    const pdf = await window.PDFLib.PDFDocument.create();
    pdf.setTitle($('filename').value.trim() || 'Mis imágenes');
    pdf.setCreator('Convertidor · Imágenes a PDF');
    for (let index = 0; index < images.length; index++) {
      $('progress-text').textContent = `Convirtiendo imagen ${index + 1} de ${images.length}…`;
      await yieldFrame();
      const item = images[index];
      const source = await loadImage(item.file);
      try {
        const jpeg = await rasterize(source.image, item.rotation, quality.maxSide, quality.jpeg);
        const embedded = await pdf.embedJpg(await jpeg.arrayBuffer());
        const [width, height] = imageDimensions(item.width, item.height, item.rotation);
        const { pageWidth, pageHeight, drawWidth, drawHeight, x, y } = pageLayout(width, height, options);
        const page = pdf.addPage([pageWidth, pageHeight]);
        page.drawImage(embedded, { x, y, width: drawWidth, height: drawHeight });
      } finally { source.release(); }
      $('export-progress').value = Math.round((index + 1) / images.length * 95);
    }
    $('progress-text').textContent = 'Guardando tu PDF…';
    await yieldFrame();
    const bytes = await pdf.save();
    const url = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = safeFilename($('filename').value);
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60_000);
    $('export-progress').value = 100;
    $('progress-text').textContent = `PDF listo · ${formatBytes(bytes.length)}`;
    announce(`Tu PDF está listo. Se ha iniciado la descarga de ${safeFilename($('filename').value)} con ${images.length} ${images.length === 1 ? 'página' : 'páginas'}.`, 'success');
  } catch (error) {
    console.error('PDF export failed:', error);
    $('progress-text').textContent = 'No se pudo completar la conversión.';
    announce('No se pudo crear el PDF. Prueba con menos imágenes o selecciona calidad Ligera para reducir la memoria necesaria.', 'error');
  } finally {
    busy = false;
    $('settings-form').querySelectorAll('input,select').forEach((input) => { input.disabled = false; });
    render();
  }
}

$('select-images').addEventListener('click', () => $('file-input').click());
$('add-more').addEventListener('click', () => $('file-input').click());
$('file-input').addEventListener('change', (event) => addFiles([...event.target.files]));
$('clear-all').addEventListener('click', () => {
  if (busy) return;
  images.forEach((item) => URL.revokeObjectURL(item.thumbnail));
  images.length = 0;
  $('progress-area').hidden = true;
  render();
  announce('Espacio de trabajo vacío. Puedes añadir nuevas imágenes.');
});
let dragDepth = 0;
$('dropzone').addEventListener('dragenter', (event) => { event.preventDefault(); if (!busy && !dragId) { dragDepth++; $('dropzone').classList.add('drag-over'); } });
$('dropzone').addEventListener('dragover', (event) => { event.preventDefault(); if (!busy && !dragId) event.dataTransfer.dropEffect = 'copy'; });
$('dropzone').addEventListener('dragleave', () => { if (--dragDepth <= 0) { dragDepth = 0; $('dropzone').classList.remove('drag-over'); } });
$('dropzone').addEventListener('drop', (event) => { event.preventDefault(); dragDepth = 0; $('dropzone').classList.remove('drag-over'); if (!dragId) addFiles([...event.dataTransfer.files]); });
// Avoid accidentally navigating away when files are dropped outside the upload area.
window.addEventListener('dragover', (event) => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
window.addEventListener('drop', (event) => { if ([...event.dataTransfer.types].includes('Files')) event.preventDefault(); });
document.addEventListener('paste', (event) => {
  if ($('panel-images').hidden) return;
  if (busy || ['INPUT', 'TEXTAREA'].includes(event.target.tagName)) return;
  const files = [...(event.clipboardData?.files || [])];
  if (files.length) { event.preventDefault(); addFiles(files); }
});
$('settings-form').addEventListener('submit', exportPDF);
['page-size', 'orientation', 'margin'].forEach((id) => $(id).addEventListener('change', updatePreview));
render();
