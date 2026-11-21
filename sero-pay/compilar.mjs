// Genera los archivos públicos del SDK a partir de src/ (sin dependencias ni bundler):
//   site/sdk/v1/            canal v1 (recibe correcciones compatibles; caché de 1 hora)
//   site/sdk/<versión>/     la misma versión, fija e inmutable (para usar con SRI)
// En cada carpeta:
//   sero-pay.js     navegador: <script>, window.SeroPay y <sero-pagar>
//   sero-pay.mjs    módulo ES universal (servidor o navegador), sin interfaz
//   referencia.txt  referencia técnica en texto plano
// También actualiza la versión y el SRI que muestra site/pagar-con-sero/index.html.
// Uso (desde sero-web/): node sdk/compilar.mjs
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const AQUI = dirname(fileURLToPath(import.meta.url));
const SITIO = join(AQUI, "..", "site");
const leer = (ruta) => readFileSync(join(AQUI, ruta), "utf8").replace(/\r\n/g, "\n");
const sinExport = (codigo) => codigo.replace(/^export (?=(async )?function |const |class )/gm, "");
const sri = (texto) => `sha384-${createHash("sha384").update(texto).digest("base64")}`;

const nucleo = leer("src/nucleo.js");
const version = nucleo.match(/export const VERSION = "([^"]+)"/)[1];

const API_NUCLEO = [
  "VERSION", "ErrorSero", "crearOrden", "ordenDeSuscripcion", "huellaDeToken", "enlaceLargo", "enlaceCorto",
  "enviarCobro", "cancelarCobro", "estadoDelCobro", "consultarPago", "esperarPago", "verificarReferencia",
  "periodoActual", "periodoLegible", "direccionCorta", "keccak256", "qrMatriz", "qrSvg",
];

const cabecera = (tipo) => `/*!
 * SERO Pay ${version} (${tipo})
 * Cobros en USDT con SERO para cualquier web: órdenes, cobro por notificación, QR y
 * verificación del pago en la red. Sin claves, sin cuentas y sin dependencias.
 * Documentación: https://web.sero.foundation/pagar-con-sero/
 * Licencia MIT. Copyright (c) 2026 Ostermann Laboratories.
 */
`;

const cuerpo = `${sinExport(leer("src/qr.js"))}\n${sinExport(nucleo)}`;

const navegador = `${cabecera("navegador")}(function () {
"use strict";
if (typeof window === "undefined") return;
if (window.SeroPay && window.SeroPay.VERSION) return;
${cuerpo}
${leer("src/interfaz.js")}
definirBoton();
window.SeroPay = Object.freeze({ ${API_NUCLEO.join(", ")}, pagar, suscribir });
window.dispatchEvent(new CustomEvent("sero:listo", { detail: { version: VERSION } }));
})();
`;

const modulo = `${cabecera("módulo ES")}${cuerpo}
export { ${API_NUCLEO.join(", ")} };
`;

const sriJs = sri(navegador);
const sriMjs = sri(modulo);
const referencia = leer("referencia.txt")
  .replaceAll("__VERSION__", version)
  .replaceAll("__SRI_JS__", sriJs)
  .replaceAll("__SRI_MJS__", sriMjs);

const sinV1 = process.argv.includes("--sin-v1");
for (const carpeta of sinV1 ? [version] : ["v1", version]) {
  const destino = join(SITIO, "sdk", carpeta);
  mkdirSync(destino, { recursive: true });
  writeFileSync(join(destino, "sero-pay.js"), navegador);
  writeFileSync(join(destino, "sero-pay.mjs"), modulo);
  writeFileSync(join(destino, "referencia.txt"), referencia);
}

const pagina = join(SITIO, "pagar-con-sero", "index.html");
const html = sinV1 ? readFileSync(pagina, "utf8") : readFileSync(pagina, "utf8")
  .replace(/(<span data-version>)[^<]*(<\/span>)/g, `$1${version}$2`)
  .replace(/src="\/sdk\/v1\/sero-pay\.js(?:\?v=[^"]*)?"/g, `src="/sdk/v1/sero-pay.js?v=${version}"`)
  .replace(/(<span data-sri-js>)[^<]*(<\/span>)/g, `$1${sriJs}$2`);
writeFileSync(pagina, html);
console.log(`SERO Pay ${version}`);
console.log(`  sero-pay.js   ${(Buffer.byteLength(navegador) / 1024).toFixed(1)} KB  ${sriJs}`);
console.log(`  sero-pay.mjs  ${(Buffer.byteLength(modulo) / 1024).toFixed(1)} KB  ${sriMjs}`);
