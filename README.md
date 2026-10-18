# Convertidor · Imágenes a PDF

Página en español para reunir imágenes JPG, PNG y WebP en un PDF. Los archivos se procesan en el navegador y no se envían a ningún servidor.

## Funciones

- Selección de varias imágenes, arrastrar archivos y pegar desde el portapapeles.
- Vista previa, reordenación mediante arrastre o botones y giro en pasos de 90 grados.
- Una imagen por página con tamaño A4, Carta o ajustado a la imagen.
- Orientación vertical, horizontal o automática y márgenes de 0, 10 o 20 mm.
- Tres niveles de calidad y nombre personalizado para la descarga.
- Diseño adaptable a computadoras y teléfonos, con controles de teclado y etiquetas accesibles.

Las imágenes transparentes se colocan sobre fondo blanco. El PDF usa JPEG para controlar su tamaño. Se admiten hasta 100 imágenes de 50 MB y 80 megapíxeles cada una. La cantidad que pueda convertirse depende de la memoria del dispositivo.

## Desarrollo

No hay instalación ni compilación. Sirve esta carpeta con un servidor HTTP estático, por ejemplo `python3 -m http.server 8000`, y abre `http://localhost:8000`.

- `index.html`: estructura y controles.
- `assets/styles.css`: diseño adaptable.
- `assets/app.js`: lectura, miniaturas, orden y exportación secuencial.
- `assets/pdf-core.mjs`: cálculos de páginas y nombres de archivo.
- `assets/vendor/pdf-lib.min.js`: pdf-lib 1.17.1, incluida localmente bajo licencia MIT.
- `.github/workflows/pages.yml`: despliegue automático al actualizar `main`.

## GitHub Pages

Dirección prevista: https://SebasMinda.github.io/Convertidor/

El flujo intenta activar Pages automáticamente. Si GitHub impide la activación inicial con su token de Actions, abre **Settings → Pages → Build and deployment → Source → GitHub Actions** y vuelve a ejecutar el flujo **Publicar en GitHub Pages**. Las siguientes actualizaciones se publican automáticamente.

La página no utiliza fuentes, scripts ni servicios externos para convertir archivos.
