import { safeFilename } from './pdf-core.mjs';
import { compressPDF, MAX_PDF_BYTES } from './compression.mjs';
import { DOCX_OPTIONS, frameHTML, preparePrint, waitForDocument } from './docx-print.mjs';

const $ = (id) => document.getElementById(id);
const formatBytes = (n) => n < 1024 * 1024 ? `${(n / 1024).toFixed(1)} KB` : `${(n / 1024 / 1024).toFixed(2)} MB`;
const tabs = [...document.querySelectorAll('[role="tab"]')];
let working = false;
let wordFile = null;
let pdfFile = null;
let controller = null;
let downloadURL = null;
let pdfjsPromise;
const scripts = new Map();

function status(tool, text, kind = '') {
  const box = $(`${tool}-status`);
  box.textContent = text;
  box.className = `message ${kind}`;
  box.hidden = !text;
}

function setWorking(value) {
  working = value;
  tabs.forEach((tab) => { tab.disabled = value; });
  ['docx', 'compress'].forEach((tool) => {
    ['select', 'input', 'remove'].forEach((id) => { $(`${tool}-${id}`).disabled = value; });
    $(`${tool}-drop`).setAttribute('aria-busy', String(value));
  });
  $('docx-print').disabled = value || !wordFile;
  $('compress-start').disabled = value || !pdfFile;
  $('compress-mode').disabled = value;
  $('compress-filename').disabled = value;
}

function selectTab(name, focus = false) {
  if (working || tabs.some((tab) => tab.disabled)) return;
  if (!['images', 'docx', 'compress'].includes(name)) name = 'images';
  tabs.forEach((tab) => {
    const selected = tab.id === `tab-${name}`;
    tab.setAttribute('aria-selected', String(selected));
    tab.tabIndex = selected ? 0 : -1;
    $(tab.getAttribute('aria-controls')).hidden = !selected;
    if (selected && focus) tab.focus();
  });
  history.replaceState(null, '', `#${name}`);
}

tabs.forEach((tab, index) => {
  tab.addEventListener('click', () => selectTab(tab.id.replace('tab-', '')));
  tab.addEventListener('keydown', (event) => {
    const next = event.key === 'ArrowRight' ? (index + 1) % tabs.length
      : event.key === 'ArrowLeft' ? (index - 1 + tabs.length) % tabs.length
      : event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : -1;
    if (next >= 0) { event.preventDefault(); selectTab(tabs[next].id.replace('tab-', ''), true); }
  });
});
selectTab(location.hash.slice(1));

// Load optional engines only when used. Everything is served from this repository.
function loadScript(name) {
  if (!scripts.has(name)) scripts.set(name, new Promise((resolve, reject) => {
    const node = document.createElement('script');
    node.src = new URL(`./vendor/${name}`, import.meta.url).href;
    node.onload = resolve;
    node.onerror = () => { scripts.delete(name); node.remove(); reject(new Error('No se pudo cargar la herramienta. Revisa tu conexión y vuelve a intentarlo.')); };
    document.head.append(node);
  }));
  return scripts.get(name);
}

async function loadPDFJS() {
  if (!pdfjsPromise) pdfjsPromise = import('./vendor/pdfjs/pdf.min.mjs').then((engine) => {
    engine.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdfjs/pdf.worker.min.mjs', import.meta.url).href;
    return engine;
  }).catch((error) => { pdfjsPromise = null; throw error; });
  return pdfjsPromise;
}

function showSelected(tool, file) {
  $(`${tool}-file`).hidden = !file;
  $(`${tool}-remove`).hidden = !file;
  $(`${tool}-drop`).classList.toggle('compact', !!file);
  if (file) {
    $(`${tool}-name`).textContent = file.name;
    $(`${tool}-size`).textContent = formatBytes(file.size);
  }
}

function clearWord() {
  wordFile = null;
  $('docx-preview-box').hidden = true;
  $('docx-preview').srcdoc = '';
  $('docx-input').value = '';
  $('docx-print').disabled = true;
  showSelected('docx', null);
  status('docx', '');
}

async function openWord(file) {
  if (working || !file) return;
  clearWord();
  if (!/\.docx$/i.test(file.name) || file.size > 25 * 1024 * 1024 || !file.size) {
    status('docx', 'Elige un archivo .docx de hasta 25 MB. Los archivos .doc antiguos deben guardarse como .docx desde Word.', 'error');
    return;
  }
  setWorking(true);
  showSelected('docx', file);
  status('docx', 'Preparando la vista previa del documento…');
  try {
    await loadScript('jszip.min.js');
    await loadScript('docx-preview.min.js');
    const data = await file.arrayBuffer();
    const archive = await window.JSZip.loadAsync(data);
    const entries = Object.values(archive.files);
    const expanded = entries.reduce((sum, entry) => sum + (entry._data?.uncompressedSize || 0), 0);
    if (!archive.file('word/document.xml') || !archive.file('[Content_Types].xml')) throw new Error('El archivo no es un documento DOCX válido.');
    if (entries.length > 3000 || expanded > 120 * 1024 * 1024) throw new Error('El documento es demasiado grande al descomprimirlo. Reduce sus imágenes antes de convertirlo.');
    const frame = $('docx-preview');
    await new Promise((resolve) => { frame.onload = resolve; frame.srcdoc = frameHTML(); });
    frame.onload = null;
    const doc = frame.contentDocument;
    await window.docx.renderAsync(data, doc.getElementById('docx-content'), doc.getElementById('docx-styles'), DOCX_OPTIONS);
    preparePrint(doc);
    doc.title = safeFilename(file.name.replace(/\.docx$/i, ''));
    await waitForDocument(doc);
    wordFile = file;
    $('docx-preview-box').hidden = false;
    status('docx', 'Documento preparado. Revisa la vista previa y pulsa Guardar como PDF. En la ventana de impresión selecciona Guardar como PDF como destino.', 'success');
  } catch (error) {
    console.error('DOCX preview:', error);
    clearWord();
    status('docx', /No se pudo cargar|no es un documento|demasiado grande/.test(error.message) ? error.message : 'No se pudo abrir el DOCX. Comprueba que no esté dañado ni protegido con contraseña y vuelve a guardarlo desde Word.', 'error');
  } finally { setWorking(false); }
}

$('docx-print').addEventListener('click', () => {
  if (working || !wordFile) return;
  try {
    $('docx-preview').contentWindow.focus();
    $('docx-preview').contentWindow.print();
    status('docx', 'En la ventana de impresión elige Guardar como PDF. Si la cerraste sin guardar, puedes volver a pulsar el botón.');
  } catch {
    status('docx', 'Este navegador no permitió abrir la ventana de impresión. Prueba desde Chrome, Edge o Firefox en una computadora.', 'error');
  }
});
$('docx-remove').addEventListener('click', () => { if (!working) clearWord(); });

function clearResult() {
  if (downloadURL) URL.revokeObjectURL(downloadURL);
  downloadURL = null;
  $('compress-result').hidden = true;
  $('compress-download').removeAttribute('href');
}

function clearPDF() {
  clearResult();
  pdfFile = null;
  $('compress-input').value = '';
  $('compress-start').disabled = true;
  $('compress-progress-box').hidden = true;
  showSelected('compress', null);
  status('compress', '');
}

async function openPDF(file) {
  if (working || !file) return;
  clearPDF();
  if (!/\.pdf$/i.test(file.name) || file.size > MAX_PDF_BYTES || !file.size) {
    status('compress', 'Elige un archivo .pdf de hasta 100 MB.', 'error'); return;
  }
  // PDF headers may occur after a small binary prefix; do not read the whole file yet.
  setWorking(true);
  try {
    const header = await file.slice(0, 1024).text();
    if (!header.includes('%PDF-')) { status('compress', 'Este archivo no contiene un PDF válido.', 'error'); return; }
    pdfFile = file;
    showSelected('compress', file);
    $('compress-filename').value = file.name.replace(/\.pdf$/i, '') + '-comprimido';
    status('compress', 'PDF listo. Elige el modo de compresión y empieza.');
  } catch {
    status('compress', 'No se pudo leer el archivo. Selecciónalo de nuevo.', 'error');
  } finally { setWorking(false); }
}

const modeHints = {
  high: 'Alta calidad: ideal para apuntes escaneados y PDF con fotos. Convierte las páginas en imágenes: el texto deja de ser seleccionable y se pierden los enlaces y formularios. Para conservarlos, elige Sin pérdida.',
  balanced: 'Equilibrada: reduce más el tamaño a 144 ppp. Convierte las páginas en imágenes: el texto deja de ser seleccionable y se pierden los enlaces y formularios. Para conservarlos, elige Sin pérdida.',
  lossless: 'Sin pérdida: conserva la calidad visual, el texto seleccionable, los enlaces y los formularios. Optimiza la estructura del archivo, con una reducción que puede ser pequeña o nula si ya estaba optimizado.',
};
$('compress-mode').addEventListener('change', () => {
  clearResult();
  $('compress-mode-hint').textContent = modeHints[$('compress-mode').value];
  $('compress-progress-box').hidden = true;
  status('compress', pdfFile ? 'Modo actualizado. Pulsa Comprimir PDF para aplicar el cambio.' : '');
});
$('compress-filename').addEventListener('input', () => { $('compress-download').download = safeFilename($('compress-filename').value); });
$('compress-remove').addEventListener('click', () => { if (!working) clearPDF(); });
$('compress-cancel').addEventListener('click', () => {
  controller?.abort();
  $('compress-cancel').disabled = true;
  $('compress-progress-text').textContent = 'Cancelando…';
});

$('compress-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (working || !pdfFile) return;
  const file = pdfFile, mode = $('compress-mode').value;
  clearResult();
  setWorking(true);
  controller = new AbortController();
  $('compress-progress-box').hidden = false;
  $('compress-progress').value = 0;
  $('compress-progress-text').textContent = 'Preparando herramienta…';
  $('compress-cancel').disabled = false;
  status('compress', 'Procesando en tu dispositivo. En documentos grandes puede tardar un poco.');
  try {
    if (!window.PDFLib) throw new Error('El motor PDF no se cargó. Recarga la página.');
    const engine = mode === 'lossless' ? null : await loadPDFJS();
    const original = new Uint8Array(await file.arrayBuffer());
    const result = await compressPDF(original, { mode, pdfLib: window.PDFLib, pdfjs: engine, signal: controller.signal,
      pdfOptions: { cMapUrl: new URL('./vendor/pdfjs/cmaps/', import.meta.url).href, cMapPacked: true,
        standardFontDataUrl: new URL('./vendor/pdfjs/standard_fonts/', import.meta.url).href },
      onProgress: (value, text) => { $('compress-progress').value = value; $('compress-progress-text').textContent = text; },
    });
    downloadURL = URL.createObjectURL(new Blob([result.bytes], { type: 'application/pdf' }));
    $('compress-download').href = downloadURL;
    $('compress-download').download = result.reduced ? safeFilename($('compress-filename').value) : file.name;
    $('compress-download').querySelector('span').textContent = result.reduced ? 'Descargar PDF comprimido' : 'Descargar original';
    const savings = result.savedPercent < 0.1 ? 'Menos de 0,1' : result.savedPercent.toLocaleString('es', { maximumFractionDigits: 1 });
    $('compress-saving').textContent = result.reduced ? `${savings} % más ligero` : 'Tu PDF ya está bien optimizado';
    $('compress-before').textContent = formatBytes(file.size);
    $('compress-after').textContent = formatBytes(result.bytes.byteLength);
    $('compress-result-note').textContent = result.reduced
      ? `${result.pageCount} páginas · ${mode === 'lossless' ? 'Calidad visual y texto conservados.' : 'Páginas convertidas en imágenes. Conserva tu original si necesitas seleccionar texto o usar enlaces.'}`
      : 'Este modo no consiguió reducirlo. Conservamos el archivo original con todas sus funciones y su calidad.';
    $('compress-result').hidden = false;
    status('compress', result.reduced ? 'Compresión terminada. Tu archivo está listo para descargar.' : 'No se generó un archivo más pesado. Puedes probar otro modo de compresión.', 'success');
  } catch (error) {
    console.error('PDF compression:', error);
    const text = controller.signal.aborted ? 'Compresión cancelada. Puedes volver a intentarlo.'
      : /password|encrypted/i.test(`${error.name} ${error.message}`) ? 'El PDF está protegido con contraseña. Abre y guarda una copia sin protección antes de comprimirlo.'
      : /supera las|hasta 100 MB|motor PDF/.test(error.message) ? error.message
      : 'No se pudo comprimir este PDF. Puede estar dañado o superar la memoria del dispositivo. Prueba Sin pérdida o un archivo más pequeño.';
    status('compress', text, controller.signal.aborted ? '' : 'error');
    $('compress-progress-text').textContent = text;
  } finally {
    controller = null;
    $('compress-cancel').disabled = true;
    setWorking(false);
  }
});

// Both extra tools accept selection and drag/drop, with exactly one file per job.
for (const [tool, handler] of [['docx', openWord], ['compress', openPDF]]) {
  $(`${tool}-select`).addEventListener('click', () => $(`${tool}-input`).click());
  $(`${tool}-input`).addEventListener('change', (event) => {
    void handler(event.target.files[0]);
    event.target.value = '';
  });
  let depth = 0;
  const drop = $(`${tool}-drop`);
  drop.addEventListener('dragenter', (event) => { event.preventDefault(); if (!working) { depth++; drop.classList.add('drag-over'); } });
  drop.addEventListener('dragover', (event) => { event.preventDefault(); event.dataTransfer.dropEffect = working ? 'none' : 'copy'; });
  drop.addEventListener('dragleave', () => { if (--depth <= 0) { depth = 0; drop.classList.remove('drag-over'); } });
  drop.addEventListener('drop', (event) => {
    event.preventDefault(); depth = 0; drop.classList.remove('drag-over');
    if (working) return;
    const files = [...event.dataTransfer.files];
    if (files.length !== 1) { status(tool, 'Elige un solo archivo a la vez.', 'error'); return; }
    void handler(files[0]);
  });
}
window.addEventListener('pagehide', () => { if (downloadURL) URL.revokeObjectURL(downloadURL); });
