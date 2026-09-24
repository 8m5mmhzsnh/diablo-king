# Texterkennung (lokal gebündelt)

Wird von `inventar.js` erst beim ersten Screenshot geladen – von hier, nicht von einem CDN.

| Datei | Herkunft | Version | Lizenz | Größe |
|---|---|---|---|---|
| `tesseract.min.js`, `worker.min.js` | npm `tesseract.js` | 5.1.1 | Apache-2.0 | 67 KB + 124 KB |
| `core/tesseract-core-lstm.wasm.js`, `core/tesseract-core-simd-lstm.wasm.js` | npm `tesseract.js-core` | 5.1.1 | Apache-2.0 | je 3,9 MB |
| `lang/eng.traineddata.gz` | npm `@tesseract.js-data/eng` (4.0.0_best_int, aus tesseract-ocr/tessdata) | 1.0.0 | MIT / Apache-2.0 | 2,95 MB |

Gesamt ca. 11,0 MB. Der Browser lädt davon nur einen der beiden Kerne (SIMD, falls unterstützt) – also rund 7 MB beim ersten Screenshot, danach aus dem Browser-Cache.
