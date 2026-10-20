# Convertidor · Herramientas PDF

Tres herramientas en español para trabajar con documentos desde el navegador, sin cuentas, marcas de agua ni envío de archivos a un servidor.

**Página:** https://sebasminda.github.io/Convertidor/

## Imágenes a PDF

- Añade imágenes JPG, PNG y WebP, arrastra archivos o pega desde el portapapeles.
- Reordena con arrastre o flechas y gira en pasos de 90 grados.
- Exporta una imagen por página en A4, Carta o al tamaño de cada imagen.
- Elige orientación, márgenes, calidad y nombre del archivo.

Las transparencias se colocan sobre blanco. El PDF usa JPEG. Límite: 100 imágenes de hasta 50 MB y 80 megapíxeles cada una. La capacidad real depende de la memoria disponible.

## DOCX a PDF

1. Abre un `.docx` de hasta 25 MB. El formato antiguo `.doc` no es compatible.
2. Revisa el texto, tablas e imágenes en la vista previa.
3. Pulsa **Guardar como PDF** y selecciona ese destino en la ventana de impresión del navegador.

La impresión de HTML conserva el texto seleccionable, sin convertirlo en capturas de pantalla. Usa escala 100 %, los márgenes predeterminados y desactiva los encabezados y pies del navegador. El título de la vista previa propone el nombre del archivo.

El motor respeta tamaños y márgenes de las secciones, saltos explícitos y estilos compatibles con HTML. La impresión permite que el contenido largo continúe en nuevas hojas. La paginación puede variar respecto a Word, al igual que las fuentes no instaladas, campos, elementos flotantes y diseños complejos. No se calculan de nuevo los índices de Word. Para un documento que exija fidelidad exacta, exporta desde Word o LibreOffice.

La vista previa está aislada en un iframe sin ejecución de scripts, con una política que bloquea recursos externos. Las imágenes y fuentes incrustadas se leen del archivo. Se desactivan los fragmentos HTML externos de DOCX y la navegación por enlaces. Los archivos con más de 3000 entradas ZIP o 120 MB descomprimidos se rechazan antes del renderizado.

## Comprimir PDF

- **Alta calidad:** JPEG con calidad 90 %, hasta 180 ppp.
- **Equilibrada:** JPEG con calidad 82 %, hasta 144 ppp.
- **Sin pérdida:** vuelve a guardar la estructura con objetos comprimidos, conservando texto, formularios, enlaces y calidad visual. La reducción puede ser pequeña o nula.

Los dos primeros modos convierten cada página en una imagen sobre fondo blanco. Son útiles para escaneos y fotografías, pero eliminan la selección de texto, los enlaces y los formularios interactivos. Esta diferencia se explica antes de procesar el archivo. No se incluyen adjuntos del PDF en esos modos.

La herramienta compara el resultado con el original y ofrece el original cuando la compresión no reduce el tamaño. La descarga es explícita y muestra los tamaños antes y después.

Se admiten archivos de hasta 100 MB y 250 páginas sin contraseña. Las páginas se procesan de una en una para limitar memoria. Las hojas muy grandes se limitan a 4000 píxeles por lado y 8 megapíxeles. El usuario puede cancelar entre operaciones y durante el renderizado. Conserva los documentos firmados como originales, porque volver a guardar un PDF puede invalidar las firmas digitales.

## Código y desarrollo

No hay compilación ni servicios remotos. Sirve esta carpeta con HTTP, por ejemplo `python3 -m http.server 8000`, y abre `http://localhost:8000` en un navegador moderno.

| Archivo | Responsabilidad |
| --- | --- |
| `index.html` | Pestañas, formularios y estructura accesible |
| `assets/styles.css` | Estilo adaptable compartido |
| `assets/app.js` | Imágenes, miniaturas, orden y exportación |
| `assets/pdf-core.mjs` | Cálculos de página y nombres seguros |
| `assets/tools.js` | Selección de DOCX/PDF, progreso, cancelación y descargas |
| `assets/docx-print.mjs` | Vista previa aislada y reglas de impresión de Word |
| `assets/compression.mjs` | Compresión sin interfaz, perfiles y comparación de tamaños |
| `assets/vendor/` | Motores, recursos de fuentes y licencias |
| `.github/workflows/pages.yml` | Publicación al actualizar main |

Los motores opcionales se cargan al utilizar cada herramienta. Las pestañas usan flechas, Inicio y Fin con teclado. Los archivos nuevos y los cambios de modo eliminan las descargas anteriores para evitar resultados desactualizados.

### Dependencias locales

- pdf-lib 1.17.1 · MIT.
- JSZip 3.10.1 · MIT, utilizado con esa licencia.
- docx-preview 0.3.7 · Apache 2.0.
- PDF.js 4.10.38 · Apache 2.0, con worker, mapas CMap y fuentes estándar locales.

Se conservan las licencias junto a cada dependencia. No se requieren claves API. GitHub Pages sirve los scripts y recursos, pero los documentos permanecen en el dispositivo.

## Publicación

En **Settings → Pages**, deja **Source → GitHub Actions**. El flujo **Publicar en GitHub Pages** publica la raíz y assets al actualizar main y también admite ejecución manual.
