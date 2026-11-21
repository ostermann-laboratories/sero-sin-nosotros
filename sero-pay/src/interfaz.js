// ─── Interfaz (solo navegador) ─────────────────────────────────────────────────
// Ventana de pago y botón «Pagar con SERO». Todo vive en Shadow DOM con hojas de estilo
// construidas (adoptedStyleSheets): los estilos del comercio no la alteran y una CSP estricta
// en style-src no la bloquea. Ningún dato del comercio se inserta como HTML.

const TINTA = "#050505";
const VERDE = "#0a9f55";
// Las mismas medidas que la app SERO: su fuente, botones de 46 px y una línea, sin sombras.
const FUENTE = `-apple-system, BlinkMacSystemFont, "SF Pro Display", "SF Pro Text", "Inter", "Segoe UI", system-ui, sans-serif`;
const MONO = `ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`;
const CLAVE_BILLETERA = "sero-pay:billetera";
const BILLETERA_DEMO = "0x2b9f4d0e6a1c3f5e7d9b0a2c4e6f8a1b3c5d7e9f";

const MARCA_SVG = ["0 0 24 24", [
  ["circle", { cx: 12, cy: 12, r: 8.6, fill: "none", stroke: "currentColor", "stroke-width": 2 }],
  ["circle", { cx: 12, cy: 12, r: 3.5, fill: "currentColor" }],
  ["circle", { cx: 12, cy: 3.4, r: 2.1, fill: "currentColor" }],
]];

const CSS_VENTANA = `
:host { all: initial; }
.fondo { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(11, 11, 12, .44); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); font-family: ${FUENTE}; color: ${TINTA}; -webkit-font-smoothing: antialiased; animation: aparecer .18s ease-out; }
.hoja { position: relative; box-sizing: border-box; width: 100%; max-width: 400px; max-height: calc(100dvh - 32px); overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; padding: 20px 24px 18px; border-radius: 28px; background: #fff; box-shadow: 0 30px 80px rgba(11, 11, 12, .28); animation: subir .24s cubic-bezier(.2, .8, .2, 1); }
@media (max-width: 520px) {
  .fondo { align-items: flex-end; padding: 0; }
  .hoja { max-width: none; max-height: 94dvh; border-radius: 28px 28px 0 0; padding-bottom: calc(20px + env(safe-area-inset-bottom)); }
}
.hoja::-webkit-scrollbar { display: none; }
@keyframes aparecer { from { opacity: 0; } }
@keyframes subir { from { transform: translateY(18px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .fondo, .hoja { animation: none; } }
* { box-sizing: border-box; }
button { font: inherit; color: inherit; }
.cabeza { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.sello { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 650; letter-spacing: -.01em; }
.sello svg { width: 18px; height: 18px; }
.cerrar { display: grid; place-items: center; width: 36px; height: 36px; margin: -6px -8px -6px 0; border: 0; border-radius: 50%; background: #f3f3f4; cursor: pointer; }
.cerrar:hover { background: #e9e9eb; }
.cerrar svg { width: 14px; height: 14px; }
.negocio { margin: 0; font-size: 12px; font-weight: 650; letter-spacing: .16em; text-transform: uppercase; color: rgba(5, 5, 5, .5); text-align: center; overflow-wrap: anywhere; }
.orden { margin: 6px 0 0; font-size: 13.5px; font-weight: 600; letter-spacing: -.01em; color: rgba(5, 5, 5, .55); text-align: center; }
/* El monto: la tipografía del saldo en la app (peso 670, juntos), no una negrita gruesa. */
.total { margin: 8px 0 0; text-align: center; font-size: 46px; font-weight: 670; letter-spacing: -.047em; line-height: 1.05; font-variant-numeric: tabular-nums; overflow-wrap: anywhere; }
.total small { font-size: 17px; font-weight: 680; letter-spacing: -.01em; margin-left: 6px; }
.productos { display: block; margin: 8px auto 0; padding: 6px 14px; border: 1px solid rgba(5, 5, 5, .1); border-radius: 999px; background: #fff; font-size: 13px; font-weight: 600; letter-spacing: -.01em; color: rgba(5, 5, 5, .62); cursor: pointer; }
.productos:hover { color: ${TINTA}; border-color: rgba(5, 5, 5, .2); }
.detalle { margin: 12px 0 0; padding: 6px 16px; max-height: 190px; overflow-y: auto; overscroll-behavior: contain; border-radius: 18px; background: #f5f5f6; }
.linea { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; font-size: 14px; font-weight: 600; letter-spacing: -.01em; }
.linea + .linea { border-top: 1px solid rgba(11, 11, 12, .07); }
.linea span:first-child { min-width: 0; overflow-wrap: break-word; }
.linea span:last-child { flex: none; font-variant-numeric: tabular-nums; font-weight: 650; }
.qr { position: relative; display: grid; place-items: center; width: 196px; height: 196px; margin: 14px auto 0; padding: 11px; border: 1px solid rgba(11, 11, 12, .08); border-radius: 24px; background: #fff; box-shadow: 0 10px 30px rgba(11, 11, 12, .06); }
.qr canvas { width: 172px; height: 172px; image-rendering: pixelated; }
.qr p { margin: 0; font-size: 13px; color: rgba(11, 11, 12, .5); text-align: center; }
.indicacion { margin: 12px 0 0; font-size: 14px; line-height: 1.45; letter-spacing: -.01em; color: rgba(5, 5, 5, .58); text-align: center; text-wrap: balance; }
/* Botones de la app: 46 px, una sola línea, mismo ancho; el principal negro y el otro blanco. */
.principal, .enlace { display: flex; align-items: center; justify-content: center; width: 100%; height: 46px; margin-top: 18px; padding: 0 18px; border: 0; border-radius: 999px; background: ${TINTA}; color: #fff; font-size: 14px; font-weight: 650; letter-spacing: -.015em; white-space: nowrap; overflow: hidden; cursor: pointer; transition: transform .12s ease, opacity .12s ease; }
.enlace { margin-top: 10px; background: #fff; color: ${TINTA}; border: 1px solid rgba(0, 0, 0, .18); }
.principal:active, .enlace:active { transform: scale(.985); }
.principal[disabled], .enlace[disabled] { opacity: .42; cursor: default; }
.enlace:hover { border-color: rgba(0, 0, 0, .32); }
.pie { margin: 16px 0 0; padding-top: 14px; border-top: 1px solid rgba(11, 11, 12, .07); font-size: 12.5px; color: rgba(11, 11, 12, .5); text-align: center; }
.pie a { color: inherit; font-weight: 600; }
.titulo { margin: 4px 0 0; font-size: 22px; font-weight: 680; letter-spacing: -.03em; text-align: center; }
/* La dirección: solo se pega (nunca se escribe a mano) y se muestra abreviada, como en la app. */
.campo { display: block; width: 100%; height: 46px; margin-top: 18px; padding: 0 18px; border: 1px solid rgba(0, 0, 0, .14); border-radius: 999px; background: #f7f7f8; font: 600 14px ${FUENTE}; letter-spacing: -.01em; color: ${TINTA}; text-align: center; caret-color: transparent; outline: none; }
.campo::placeholder { color: rgba(5, 5, 5, .42); }
.campo:focus { border-color: ${TINTA}; background: #fff; }
.direccion { display: flex; align-items: center; justify-content: center; height: 46px; margin-top: 18px; padding: 0 18px; border: 1px solid rgba(0, 0, 0, .105); border-radius: 999px; background: linear-gradient(180deg, rgba(255, 255, 255, .96), rgba(247, 247, 248, .88)); font: 600 15px ${MONO}; letter-spacing: -.01em; }
.campo-demo { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; }
.campo-demo small { font: 600 12px ${FUENTE}; color: rgba(11, 11, 12, .55); }
.qr-demo { cursor: pointer; font: inherit; transition: transform .2s ease, box-shadow .2s ease; }
.qr-demo:hover, .qr-demo:focus-visible { transform: translateY(-2px); box-shadow: 0 14px 34px rgba(11, 11, 12, .12); outline: none; }
.qr-demo:active { transform: scale(.98); }
.error { margin: 12px 0 0; font-size: 13.5px; line-height: 1.4; font-weight: 600; letter-spacing: -.01em; color: #d42020; text-align: center; text-wrap: balance; }
.estado { margin: 18px 0 0; text-align: center; }
.estado b { display: block; font-size: 17px; font-weight: 650; letter-spacing: -.02em; }
.estado > span { display: block; margin-top: 6px; font-size: 14px; line-height: 1.45; color: rgba(11, 11, 12, .62); }
.mono { font-family: ${MONO}; font-weight: 600; }
.espera { display: block; width: 28px; height: 28px; margin: 22px auto 0; border: 2.5px solid rgba(11, 11, 12, .1); border-top-color: ${TINTA}; border-radius: 50%; animation: girar .9s linear infinite; }
@keyframes girar { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .espera { animation-duration: 2.4s; } }
.listo { display: grid; place-items: center; width: 64px; height: 64px; margin: 8px auto 0; border-radius: 50%; background: ${VERDE}; color: #fff; }
.listo svg { width: 30px; height: 30px; }
.referencia { display: block; width: 100%; margin-top: 16px; padding: 12px 14px; border: 0; border-radius: 14px; background: #f6f6f7; text-align: center; cursor: pointer; }
.referencia small { display: block; font-size: 11.5px; font-weight: 650; letter-spacing: .12em; text-transform: uppercase; color: rgba(11, 11, 12, .5); }
.referencia span { display: block; margin-top: 4px; font: 600 14px ${MONO}; }
.demo { margin: 0 0 14px; padding: 8px 12px; border-radius: 12px; background: #f3f3f4; color: rgba(5, 5, 5, .62); font-size: 12.5px; font-weight: 600; text-align: center; }
`;

const CSS_BOTON = `
:host { display: inline-block; vertical-align: middle; width: 260px; max-width: 100%; }
:host([ancho="completo"]) { display: block; width: auto; }
/* Un solo tamaño para todos los botones de SERO (pagar o suscribirse): 260 × 46, como en la app. */
button { display: inline-flex; align-items: center; justify-content: center; gap: 8px; width: 100%; height: 46px; padding: 0 18px; border: 0; border-radius: 999px; background: ${TINTA}; color: #fff; font: 650 14px ${FUENTE}; letter-spacing: -.015em; white-space: nowrap; overflow: hidden; cursor: pointer; -webkit-font-smoothing: antialiased; transition: transform .12s ease, opacity .12s ease; }
button:hover { opacity: .9; }
button:active { transform: scale(.985); }
button:focus-visible { outline: 3px solid rgba(11, 11, 12, .35); outline-offset: 3px; }
button[disabled] { opacity: .42; cursor: not-allowed; }
:host([tema="claro"]) button { background: #fff; color: ${TINTA}; box-shadow: inset 0 0 0 1px rgba(0, 0, 0, .18); }
svg { width: 17px; height: 17px; flex: none; }
`;

function hojaDeEstilo(raiz, css) {
  try {
    const hoja = new CSSStyleSheet();
    hoja.replaceSync(css);
    raiz.adoptedStyleSheets = [hoja];
  } catch {
    const estilo = document.createElement("style");
    estilo.textContent = css;
    raiz.appendChild(estilo);
  }
}

function el(etiqueta, atributos = {}, ...hijos) {
  const nodo = document.createElement(etiqueta);
  for (const [clave, valor] of Object.entries(atributos)) {
    if (valor === undefined || valor === null || valor === false) continue;
    if (clave.startsWith("on")) nodo.addEventListener(clave.slice(2), valor);
    else if (clave === "texto") nodo.textContent = valor;
    else nodo.setAttribute(clave, valor === true ? "" : String(valor));
  }
  for (const hijo of hijos.flat()) if (hijo !== null && hijo !== undefined && hijo !== false) nodo.append(hijo);
  return nodo;
}

// Íconos construidos con el DOM (sin innerHTML): funcionan también con Trusted Types.
function svg([vista, formas]) {
  const NS = "http://www.w3.org/2000/svg";
  const raiz = document.createElementNS(NS, "svg");
  raiz.setAttribute("viewBox", vista);
  raiz.setAttribute("aria-hidden", "true");
  raiz.setAttribute("focusable", "false");
  for (const [etiqueta, atributos] of formas) {
    const forma = document.createElementNS(NS, etiqueta);
    for (const [clave, valor] of Object.entries(atributos)) forma.setAttribute(clave, String(valor));
    raiz.append(forma);
  }
  return raiz;
}

const ICONO_CERRAR = ["0 0 14 14", [["path", { d: "M1.5 1.5l11 11M12.5 1.5l-11 11", stroke: "currentColor", "stroke-width": 2, "stroke-linecap": "round" }]]];
const ICONO_LISTO = ["0 0 24 24", [["path", { d: "M5 12.5l4.5 4.5L19 7.5", fill: "none", stroke: "currentColor", "stroke-width": 2.6, "stroke-linecap": "round", "stroke-linejoin": "round" }]]];

function leerBilletera() {
  try { return localStorage.getItem(CLAVE_BILLETERA) || ""; } catch { return ""; }
}

function guardarBilletera(direccion) {
  try { localStorage.setItem(CLAVE_BILLETERA, direccion); } catch { /* sin almacenamiento */ }
}

// ── QR con la marca de SERO al centro ──
function dibujarMarca(ctx, cx, cy, radio) {
  ctx.save();
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(cx, cy, radio * 1.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = TINTA;
  ctx.strokeStyle = TINTA;
  const escala = radio / 12;
  ctx.lineWidth = 2 * escala;
  ctx.beginPath();
  ctx.arc(cx, cy, 8.6 * escala, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy, 3.5 * escala, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - 8.6 * escala, 2.1 * escala, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function dibujarQr(ctx, texto, x, y, lado) {
  const matriz = qrMatriz(texto, "H");
  const n = matriz.length;
  const modulo = lado / n;
  ctx.fillStyle = TINTA;
  matriz.forEach((fila, fy) => fila.forEach((oscuro, fx) => {
    if (oscuro) ctx.fillRect(Math.floor(x + fx * modulo), Math.floor(y + fy * modulo), Math.ceil(modulo), Math.ceil(modulo));
  }));
  // La marca tapa menos del 7 % del área: el nivel H recupera hasta el 30 %.
  dibujarMarca(ctx, x + lado / 2, y + lado / 2, lado * 0.085);
}

function lienzoQr(texto, ladoCss) {
  const razon = Math.min(3, Math.max(1, window.devicePixelRatio || 1));
  const lienzo = el("canvas", { width: Math.round(ladoCss * razon), height: Math.round(ladoCss * razon), role: "img", "aria-label": "Código QR de la orden" });
  const ctx = lienzo.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, lienzo.width, lienzo.height);
  dibujarQr(ctx, texto, 0, 0, lienzo.width);
  return lienzo;
}

function textoAjustado(ctx, texto, anchoMaximo) {
  if (ctx.measureText(texto).width <= anchoMaximo) return texto;
  let corto = texto;
  while (corto.length > 1 && ctx.measureText(`${corto}…`).width > anchoMaximo) corto = corto.slice(0, -1);
  return `${corto.trimEnd()}…`;
}

// Imagen de 1080 × 1350 para guardar y escanear después desde la galería con SERO.
async function imagenDeOrden(orden, enlace) {
  const lienzo = document.createElement("canvas");
  lienzo.width = 1080;
  lienzo.height = 1350;
  const ctx = lienzo.getContext("2d");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, 1080, 1350);
  ctx.textAlign = "center";
  ctx.fillStyle = "rgba(11,11,12,.55)";
  ctx.font = `800 30px ${FUENTE}`;
  ctx.letterSpacing = "6px";
  ctx.fillText(textoAjustado(ctx, (orden.negocio || "Orden SERO").toUpperCase(), 900), 540, 128);
  ctx.letterSpacing = "0px";
  ctx.font = `600 34px ${FUENTE}`;
  ctx.fillStyle = "rgba(11,11,12,.62)";
  ctx.fillText(orden.suscripcion ? `Suscripción de ${orden.suscripcion.etiqueta}` : `Orden de compra N.º ${orden.numero}`, 540, 186);
  ctx.fillStyle = TINTA;
  ctx.font = `800 104px ${FUENTE}`;
  ctx.fillText(`${orden.total} USDT`, 540, 318);
  ctx.font = `600 32px ${FUENTE}`;
  ctx.fillStyle = "rgba(11,11,12,.58)";
  ctx.fillText(orden.cantidadDeProductos === 1 ? "1 producto" : `${orden.cantidadDeProductos} productos`, 540, 372);
  // Tarjeta del QR.
  ctx.fillStyle = "#fff";
  ctx.strokeStyle = "rgba(11,11,12,.1)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") ctx.roundRect(210, 430, 660, 660, 56);
  else ctx.rect(210, 430, 660, 660);
  ctx.fill();
  ctx.stroke();
  dibujarQr(ctx, enlace, 250, 470, 580);
  ctx.fillStyle = "rgba(11,11,12,.66)";
  ctx.font = `600 32px ${FUENTE}`;
  ctx.fillText("Escanéalo con SERO desde «Pagos y envíos»", 540, 1168);
  ctx.fillText("o desde una foto de tu galería.", 540, 1212);
  ctx.fillStyle = TINTA;
  ctx.font = `800 26px ${FUENTE}`;
  ctx.fillText("PAGAR CON SERO", 540, 1296);
  return new Promise((listo) => lienzo.toBlob((blob) => listo(blob), "image/png"));
}

async function descargarImagen(orden, enlace) {
  const blob = await imagenDeOrden(orden, enlace);
  if (!blob) return;
  const nombre = `orden-sero-${orden.numero}.png`;
  const archivo = typeof File === "function" ? new File([blob], nombre, { type: "image/png" }) : null;
  const tactil = window.matchMedia?.("(pointer: coarse)").matches;
  if (tactil && archivo && navigator.canShare?.({ files: [archivo] })) {
    try {
      await navigator.share({ files: [archivo], title: `Orden de compra N.º ${orden.numero}` });
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = el("a", { href: url, download: nombre });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ── Ventana de pago ──
let ventanaAbierta = null;

function abrirVentana(orden, opciones = {}) {
  if (ventanaAbierta) ventanaAbierta.cerrar(null);
  const demostracion = Boolean(opciones.demostracion);
  const pasarela = opciones.pasarela;
  const origen = opciones.origen || window;

  return new Promise((resolver) => {
    const anfitrion = el("div", { "data-sero-pay": "" });
    const raiz = anfitrion.attachShadow({ mode: "open" });
    hojaDeEstilo(raiz, CSS_VENTANA);
    const titulo = `sero-titulo-${Math.random().toString(36).slice(2, 8)}`;
    const hoja = el("div", { class: "hoja", role: "dialog", "aria-modal": "true", "aria-labelledby": titulo });
    const fondo = el("div", { class: "fondo" }, hoja);
    raiz.append(fondo);

    const control = new AbortController();
    const estado = { pantalla: "inicio", enlace: "", cobro: null, destino: leerBilletera() || (demostracion ? BILLETERA_DEMO : ""), error: "", recibo: null, detalle: false, enviando: false };
    let lienzo = null;
    let resuelto = false;
    let vigiaCobro = null;
    const focoAnterior = document.activeElement;
    const desbordeAnterior = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";

    const emitir = (nombre, detalle, cancelable = false) => {
      const evento = new CustomEvent(nombre, { detail: detalle, bubbles: true, composed: true, cancelable });
      origen.dispatchEvent(evento);
      return evento;
    };

    const alPagar = (recibo) => {
      if (resuelto) return;
      resuelto = true;
      estado.recibo = recibo;
      estado.pantalla = "pagado";
      clearInterval(vigiaCobro);
      control.abort();
      try { opciones.alPagar?.(recibo); } catch (error) { console.error(error); }
      emitir("sero:pagado", recibo);
      resolver(recibo);
      pintar();
    };

    const cerrar = (motivo = "cerrado") => {
      if (!anfitrion.isConnected) return;
      control.abort();
      clearInterval(vigiaCobro);
      if (estado.cobro && !estado.recibo && !demostracion) void cancelarCobro(estado.cobro, { pasarela });
      document.removeEventListener("keydown", teclado, true);
      document.documentElement.style.overflow = desbordeAnterior;
      anfitrion.remove();
      ventanaAbierta = null;
      if (!resuelto) {
        resuelto = true;
        try { opciones.alCerrar?.(motivo); } catch (error) { console.error(error); }
        emitir("sero:cerrado", { orden: orden.id, motivo });
        resolver(null);
      }
      if (focoAnterior && typeof focoAnterior.focus === "function") focoAnterior.focus();
    };
    ventanaAbierta = { cerrar };

    const teclado = (evento) => {
      if (evento.key === "Escape") { evento.stopPropagation(); cerrar(); return; }
      if (evento.key !== "Tab") return;
      const enfocables = [...hoja.querySelectorAll("button, input, a[href]")].filter((n) => !n.disabled);
      if (!enfocables.length) return;
      const primero = enfocables[0];
      const ultimo = enfocables[enfocables.length - 1];
      const activo = raiz.activeElement;
      if (evento.shiftKey && (activo === primero || !hoja.contains(activo))) { evento.preventDefault(); ultimo.focus(); }
      else if (!evento.shiftKey && (activo === ultimo || !hoja.contains(activo))) { evento.preventDefault(); primero.focus(); }
    };
    document.addEventListener("keydown", teclado, true);

    const productosTexto = orden.cantidadDeProductos === 1 ? "1 producto" : `${orden.cantidadDeProductos} productos`;

    const cabecera = () => el("div", { class: "cabeza" },
      el("span", { class: "sello" }, svg(MARCA_SVG), "Pagar con SERO Latam"),
      el("button", { class: "cerrar", type: "button", "aria-label": "Cerrar", onclick: () => cerrar() }, svg(ICONO_CERRAR)));

    const resumen = () => [
      el("p", { class: "negocio", id: titulo, texto: orden.negocio || "Orden SERO" }),
      el("p", { class: "orden", texto: orden.suscripcion ? `Suscripción de ${orden.suscripcion.etiqueta}` : `Orden de compra N.º ${orden.numero}` }),
      el("p", { class: "total" }, orden.total, el("small", { texto: "USDT" })),
      el("button", { class: "productos", type: "button", "aria-expanded": String(estado.detalle), texto: productosTexto, onclick: () => { estado.detalle = !estado.detalle; pintar(); } }),
      estado.detalle ? el("div", { class: "detalle" }, orden.productos.map((p) => el("div", { class: "linea" },
        el("span", { texto: p.cantidad > 1 ? `${p.cantidad} × ${p.nombre}` : p.nombre }),
        el("span", { texto: p.subtotal })))) : null,
    ];

    const pantallas = {
      inicio: () => [
        resumen(),
        demostracion
          ? el("button", { class: "qr qr-demo", type: "button", "aria-label": "Simular que tu cliente escanea el QR", onclick: () => { estado.destino = estado.destino || BILLETERA_DEMO; void enviar(); } }, lienzo || el("p", { texto: "Preparando el QR" }))
          : el("div", { class: "qr" }, lienzo || el("p", { texto: "Preparando el QR" })),
        el("p", { class: "indicacion", texto: demostracion ? "Demostración: toca el QR para ver lo que pasa en el teléfono de tu cliente." : "Escanéalo con SERO desde «Pagos y envíos»." }),
        el("button", { class: "principal", type: "button", texto: "Enviar el cobro a mi billetera", onclick: () => { estado.pantalla = "direccion"; estado.error = ""; pintar(); } }),
        demostracion ? null : el("button", { class: "enlace", type: "button", texto: "Descargar el QR", disabled: !estado.enlace, onclick: () => void descargarImagen(orden, estado.enlace) }),
        el("p", { class: "pie" }, "¿Aún no tienes SERO? ", el("a", { href: "https://sero.foundation", target: "_blank", rel: "noopener", texto: "Actívalo en sero.foundation" })),
      ],
      direccion: () => {
        const valida = /^0x[0-9a-fA-F]{40}$/.test(estado.destino);
        // Se acepta solo pegada: escribirla a mano es donde nacen los errores.
        const aceptar = (texto) => {
          const t = String(texto || "").trim();
          if (/^0x[0-9a-fA-F]{40}$/.test(t)) { estado.destino = t; estado.error = ""; }
          else estado.error = "Eso no es una dirección SERO. Cópiala en tu teléfono, en «Recibir fondos».";
          pintar();
        };
        const pegar = async () => {
          try { aceptar(await navigator.clipboard.readText()); }
          catch { estado.error = "Mantén presionado el campo y elige «Pegar»."; pintar(); }
        };
        const caja = demostracion || valida
          ? el("div", { class: "direccion", "aria-label": "Tu dirección SERO" }, direccionCorta(estado.destino || BILLETERA_DEMO))
          : el("input", {
            class: "campo", type: "text", inputmode: "none", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
            placeholder: "Pega aquí tu dirección SERO", value: "", "aria-label": "Pega aquí tu dirección SERO",
            onbeforeinput: (e) => { if (e.inputType !== "insertFromPaste" && e.inputType !== "insertFromDrop") e.preventDefault(); },
            onpaste: (e) => { e.preventDefault(); aceptar(e.clipboardData?.getData("text")); },
          });
        return [
          el("p", { class: "titulo", id: titulo, texto: "Enviar el cobro a tu billetera" }),
          el("p", { class: "indicacion", texto: "Copia tu dirección en SERO, en «Recibir fondos», y pégala aquí. Te llegará una notificación para revisar y pagar." }),
          caja,
          estado.error ? el("p", { class: "error", role: "alert", texto: estado.error }) : null,
          demostracion || valida
            ? el("button", { class: "principal", type: "button", disabled: estado.enviando, texto: estado.enviando ? "Enviando" : "Enviar cobro", onclick: enviar })
            : el("button", { class: "principal", type: "button", texto: "Pegar mi dirección", onclick: pegar }),
          !demostracion && valida
            ? el("button", { class: "enlace", type: "button", texto: "Usar otra dirección", onclick: () => { estado.destino = ""; estado.error = ""; pintar(); } })
            : el("button", { class: "enlace", type: "button", texto: "Volver", onclick: () => { estado.pantalla = "inicio"; pintar(); } }),
        ];
      },
      enviado: () => [
        resumen(),
        el("div", { class: "estado", role: "status" },
          el("b", {}, "Cobro enviado a ", el("span", { class: "mono", texto: direccionCorta(estado.destino) })),
          el("span", { texto: "Toca la notificación en tu teléfono para revisar y pagar." })),
        el("span", { class: "espera", "aria-hidden": "true" }),
        el("p", { class: "indicacion", texto: "Esperando el pago" }),
        el("button", { class: "enlace", type: "button", texto: "Mostrar el QR", onclick: () => { estado.pantalla = "inicio"; pintar(); } }),
        el("button", { class: "enlace", type: "button", texto: "Cancelar el cobro", onclick: cancelar }),
      ],
      pagado: () => [
        el("div", { class: "listo" }, svg(ICONO_LISTO)),
        el("div", { class: "estado", role: "status" },
          el("b", { id: titulo, texto: "Pago recibido" }),
          el("span", { texto: `${orden.total} USDT${orden.negocio ? ` a ${orden.negocio}` : ""}` })),
        el("button", {
          class: "referencia", type: "button", title: "Copiar el número de referencia",
          onclick: (e) => {
            void navigator.clipboard?.writeText(estado.recibo.referencia).then(() => {
              const pequeno = e.currentTarget.querySelector("small");
              if (pequeno) pequeno.textContent = "Copiado";
            }).catch(() => undefined);
          },
        }, el("small", { texto: "Número de referencia" }), el("span", { texto: direccionCorta(estado.recibo?.referencia || "") })),
        el("button", { class: "principal", type: "button", texto: "Listo", onclick: () => cerrar("pagado") }),
      ],
    };

    function pintar() {
      const enfocado = raiz.activeElement?.textContent;
      // replaceChildren convierte null en el texto «null»: solo nodos reales.
      hoja.replaceChildren(...[
        demostracion ? el("p", { class: "demo", texto: "Demostración: nada se cobra de verdad" }) : null,
        cabecera(),
        ...pantallas[estado.pantalla]().flat(Infinity),
      ].filter((nodo) => nodo !== null && nodo !== undefined && nodo !== false));
      const mismo = enfocado && [...hoja.querySelectorAll("button")].find((b) => b.textContent === enfocado);
      if (mismo) mismo.focus();
    }

    async function enviar() {
      if (estado.enviando) return;
      const destino = String(estado.destino || (demostracion ? BILLETERA_DEMO : "")).trim();
      if (!/^0x[0-9a-fA-F]{40}$/.test(destino)) {
        estado.error = "Revisa la dirección: empieza por 0x y tiene 42 caracteres.";
        return pintar();
      }
      estado.enviando = true;
      estado.error = "";
      pintar();
      let resultado;
      if (demostracion) {
        await new Promise((listo) => setTimeout(listo, 700));
        resultado = { ok: true, id: "demo" };
      } else {
        resultado = await enviarCobro(orden, destino, { pasarela });
      }
      estado.enviando = false;
      if (resuelto) return;
      if (!resultado.ok) {
        estado.error = resultado.mensaje;
        if (resultado.codigo === "pagada") void consultarPago(orden, { pasarela, bloques: 900 }).then((r) => r && alPagar(r)).catch(() => undefined);
        return pintar();
      }
      guardarBilletera(destino);
      estado.cobro = resultado.id;
      estado.pantalla = "enviado";
      pintar();
      const evento = emitir("sero:cobro-enviado", {
        orden: orden.id,
        numero: orden.numero,
        negocio: orden.negocio,
        total: orden.total,
        productos: orden.productos,
        direccion: orden.direccion,
        destino,
        demostracion,
        simularPago: demostracion ? () => simularPago(destino) : undefined,
        simularRechazo: demostracion ? (bloqueo) => simularRechazo(Boolean(bloqueo)) : undefined,
      }, true);
      if (demostracion && !evento.defaultPrevented) setTimeout(() => simularPago(destino), 6000);
      if (!demostracion) vigilarCobro();
    }

    function simularPago(destino) {
      if (resuelto || !anfitrion.isConnected) return;
      const azar = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
      alPagar(Object.freeze({ referencia: `0x${azar}`, pagador: destino.toLowerCase(), cliente: destino.toLowerCase(), destino: orden.direccion, monto: orden.total, bloque: 0, orden: orden.id, numero: orden.numero, huella: orden.huella, demostracion: true, ...(orden.suscripcion ? { suscripcion: orden.suscripcion } : {}) }));
    }

    // Lo mismo que ve la tienda cuando el cliente rechaza de verdad (estadoDelCobro → «rechazado»).
    function simularRechazo(bloqueo) {
      if (resuelto) return;
      estado.cobro = null;
      estado.pantalla = "direccion";
      estado.error = bloqueo ? "El cliente bloqueó los cobros de este negocio." : "El cobro fue rechazado desde la billetera.";
      pintar();
    }

    function vigilarCobro() {
      clearInterval(vigiaCobro);
      vigiaCobro = setInterval(async () => {
        if (!estado.cobro || resuelto) return clearInterval(vigiaCobro);
        const actual = await estadoDelCobro(estado.cobro, { pasarela });
        if (!actual || actual === "activo" || actual === "pagado" || resuelto) return;
        clearInterval(vigiaCobro);
        estado.cobro = null;
        estado.pantalla = "direccion";
        estado.error = actual === "rechazado" ? "El cobro fue rechazado desde la billetera." : actual === "vencido" ? "El cobro venció. Puedes enviarlo de nuevo." : "El cobro ya no está activo.";
        pintar();
      }, 15000);
    }

    async function cancelar() {
      const id = estado.cobro;
      estado.cobro = null;
      clearInterval(vigiaCobro);
      estado.pantalla = "inicio";
      pintar();
      if (id && !demostracion) await cancelarCobro(id, { pasarela });
    }

    document.body.append(anfitrion);
    pintar();
    hoja.querySelector(".principal")?.focus();

    // Enlace del QR y espera del pago desde el primer instante (también se puede pagar escaneando).
    const alEnlace = (enlace) => {
      if (!anfitrion.isConnected) return;
      estado.enlace = enlace;
      lienzo = lienzoQr(enlace, 172);
      if (estado.pantalla === "inicio") pintar();
    };
    if (demostracion) {
      alEnlace(`https://gate-latam.sero.foundation/o/demo${orden.huella.slice(0, 6)}`);
    } else {
      void enlaceCorto(orden, { pasarela }).then(alEnlace);
      esperarPago(orden, { senal: control.signal, pasarela }).then(alPagar).catch(() => undefined);
    }
  });
}

/**
 * Abre la ventana de pago de una orden nueva.
 * @returns {Promise<object|null>} El recibo verificado, o null si se cerró sin pagar.
 */
function pagar(opciones = {}) {
  return abrirVentana(crearOrden(opciones), opciones);
}

/** Primer pago (o el de un periodo) de una suscripción mensual. El recibo trae `cliente`: guárdalo para los cobros siguientes. */
function suscribir(opciones = {}) {
  return abrirVentana(ordenDeSuscripcion(opciones), opciones);
}

// ── <sero-pagar> ──
function definirBoton() {
  if (typeof customElements === "undefined" || customElements.get("sero-pagar")) return;
  class BotonSero extends HTMLElement {
    static get observedAttributes() { return ["etiqueta", "direccion", "monto", "productos"]; }

    constructor() {
      super();
      this._raiz = this.attachShadow({ mode: "open" });
      hojaDeEstilo(this._raiz, CSS_BOTON);
      this._boton = el("button", { type: "button", part: "boton" }, svg(MARCA_SVG), el("span"));
      this._boton.addEventListener("click", () => this.abrir());
      this._raiz.append(this._boton);
    }

    connectedCallback() { this._pintar(); }
    attributeChangedCallback() { this._pintar(); }

    set productos(lista) { this._productos = Array.isArray(lista) ? lista : null; this._pintar(); }
    get productos() { return this._productos || this._productosDelAtributo(); }

    _productosDelAtributo() {
      const crudo = this.getAttribute("productos");
      if (!crudo) return null;
      try { return JSON.parse(crudo); } catch { return null; }
    }

    _opciones() {
      const numero = Number(this.getAttribute("numero"));
      const suscripcion = this.getAttribute("plan") ? {
        plan: { id: this.getAttribute("plan"), nombre: this.getAttribute("plan-nombre") || this.getAttribute("concepto") || "Suscripción", precio: this.getAttribute("monto") },
        cliente: this.getAttribute("cliente"),
        periodo: this.getAttribute("periodo") || undefined,
      } : null;
      return {
        direccion: this.getAttribute("direccion"),
        negocio: this.getAttribute("negocio") || undefined,
        orden: this.getAttribute("orden") || undefined,
        numero: Number.isInteger(numero) && numero > 0 ? numero : undefined,
        concepto: this.getAttribute("concepto") || undefined,
        monto: this.getAttribute("monto") ?? undefined,
        productos: this.productos || undefined,
        demostracion: this.hasAttribute("demostracion"),
        pasarela: this.getAttribute("pasarela") || undefined,
        origen: this,
        ...(suscripcion || {}),
        _suscripcion: Boolean(suscripcion),
      };
    }

    _pintar() {
      const suscripcion = Boolean(this.getAttribute("plan"));
      this._boton.lastChild.textContent = this.getAttribute("etiqueta") || (suscripcion ? "Suscribirme con SERO Latam" : "Pagar con SERO Latam");
      let error = "";
      try {
        const opciones = this._opciones();
        if (opciones._suscripcion) ordenDeSuscripcion(opciones); else crearOrden(opciones);
      } catch (e) {
        error = e.message;
      }
      this._boton.disabled = Boolean(error);
      this._boton.title = error;
      this._ultimoError = error;
      // El aviso espera: una web que asigna `productos` justo después de cargar no debe verlo.
      clearTimeout(this._aviso);
      if (error && this.isConnected) {
        this._aviso = setTimeout(() => {
          if (this._ultimoError && this._ultimoError !== this._avisado) console.error(`[SERO] <sero-pagar>: ${this._ultimoError}`);
          this._avisado = this._ultimoError;
        }, 1500);
      }
    }

    abrir() {
      const opciones = this._opciones();
      return opciones._suscripcion ? suscribir(opciones) : pagar(opciones);
    }
  }
  customElements.define("sero-pagar", BotonSero);
}
