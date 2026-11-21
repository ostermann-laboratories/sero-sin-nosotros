// ─── Núcleo: órdenes, cobros y verificación de pagos ──────────────────────────
// Funciona igual en el navegador y en el servidor (Node 18+, Deno, Bun, Workers): solo usa
// fetch, TextEncoder, crypto.getRandomValues y AbortController.
//
// Una orden SERO es un token autocontenido (SERO-ORDER-V1.<datos>.<suma>) idéntico al que
// genera la app. De él sale la huella: los primeros 24 bytes de
// keccak256("SERO-ORDEN-HUELLA-V1|" + token). La app de quien paga graba esa huella en el
// clientTxId del pago, y el evento PaymentExecuted del contrato la deja en la cadena. Por eso
// un pago se reconoce sin cuentas, sin claves y sin guardar nada del comercio.

export const VERSION = "1.0.6";

const CONTRATO_SERO = "0xc872fcbc4df48187454798ebc94176a258832f4d";
const TEMA_PAGO_SERO = "0x101bbd0b71609893cf7095fdbebe9b6e9e097866134ccb8d28e9ce3d309b14e4";
const PASARELA = "https://gate-latam.sero.foundation";
const APP_SERO = "https://latam.sero.foundation";
const RPC_PUBLICOS = [
  "https://bsc-rpc.publicnode.com",
  "https://bsc-dataseed.bnbchain.org",
  "https://bsc-dataseed1.binance.org",
  "https://1rpc.io/bnb",
];
const MONTO_MINIMO_CENTAVOS = 100;
const WEI_POR_CENTAVO = 10n ** 16n;
const MAX_PRODUCTOS = 100;
const MAX_TOKEN = 15000; // cabe con holgura en los 16 KB que aceptan la pasarela y el worker

const DIRECCION_RE = /^0x[0-9a-fA-F]{40}$/;
const HUELLA_RE = /^[0-9a-f]{48}$/;
const TX_RE = /^0x[0-9a-f]{64}$/;
const ID_COBRO_RE = /^[0-9a-f]{32}$/;
const PERIODO_RE = /^(\d{4})-(0[1-9]|1[0-2])$/;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

export class ErrorSero extends Error {
  constructor(codigo, mensaje) {
    super(mensaje);
    this.name = "ErrorSero";
    this.codigo = codigo;
  }
}

// ── keccak-256 (el de Ethereum; no SHA3-256) ──
const KECCAK_RC = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an, 0x8000000080008000n,
  0x000000000000808bn, 0x0000000080000001n, 0x8000000080008081n, 0x8000000000008009n,
  0x000000000000008an, 0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n, 0x8000000000008003n,
  0x8000000000008002n, 0x8000000000000080n, 0x000000000000800an, 0x800000008000000an,
  0x8000000080008081n, 0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];
const KECCAK_ROT = [0, 1, 62, 28, 27, 36, 44, 6, 55, 20, 3, 10, 43, 25, 39, 41, 45, 15, 21, 8, 18, 2, 61, 56, 14];
const MASCARA_64 = (1n << 64n) - 1n;

function rotar64(valor, n) {
  const d = BigInt(n);
  return n === 0 ? valor : ((valor << d) | (valor >> (64n - d))) & MASCARA_64;
}

function keccakF(estado) {
  const c = new Array(5);
  const b = new Array(25);
  for (const rc of KECCAK_RC) {
    for (let x = 0; x < 5; x += 1) c[x] = estado[x] ^ estado[x + 5] ^ estado[x + 10] ^ estado[x + 15] ^ estado[x + 20];
    for (let x = 0; x < 5; x += 1) {
      const d = c[(x + 4) % 5] ^ rotar64(c[(x + 1) % 5], 1);
      for (let y = 0; y < 25; y += 5) estado[x + y] ^= d;
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) b[y + 5 * ((2 * x + 3 * y) % 5)] = rotar64(estado[x + 5 * y], KECCAK_ROT[x + 5 * y]);
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) estado[x + 5 * y] = (b[x + 5 * y] ^ ((~b[((x + 1) % 5) + 5 * y]) & b[((x + 2) % 5) + 5 * y])) & MASCARA_64;
    }
    estado[0] ^= rc;
  }
}

export function keccak256(entrada) {
  const bytes = typeof entrada === "string" ? new TextEncoder().encode(entrada) : entrada;
  const tasa = 136;
  const bloques = Math.floor(bytes.length / tasa) + 1;
  const relleno = new Uint8Array(bloques * tasa);
  relleno.set(bytes);
  relleno[bytes.length] ^= 0x01;
  relleno[relleno.length - 1] ^= 0x80;
  const estado = new Array(25).fill(0n);
  for (let bloque = 0; bloque < bloques; bloque += 1) {
    for (let i = 0; i < tasa / 8; i += 1) {
      let carril = 0n;
      for (let k = 7; k >= 0; k -= 1) carril = (carril << 8n) | BigInt(relleno[bloque * tasa + i * 8 + k]);
      estado[i] ^= carril;
    }
    keccakF(estado);
  }
  let hex = "";
  for (let i = 0; i < 4; i += 1) {
    for (let k = 0; k < 8; k += 1) hex += Number((estado[i] >> BigInt(8 * k)) & 0xffn).toString(16).padStart(2, "0");
  }
  return hex;
}

// ── Quién pagó: firmas EIP-191 (secp256k1, sin dependencias) ──
// La app SERO paga desde bolsillos: en la cadena, `pagador` es la dirección de un bolsillo. Su app
// avisa además la dirección SERO de siempre de quien paga (la «puerta»), firmada por esa puerta y
// por el bolsillo que pagó. El SDK comprueba aquí las dos firmas, sin confiar en la pasarela: si
// cuadran, recibo.cliente es esa dirección; si no hay firmas o no cuadran, es el pagador.
const P_CURVA = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N_CURVA = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const G_CURVA = [0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n, 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n, 1n];
const FIRMA_RE = /^0x[0-9a-f]{130}$/;

const modCurva = (a, m = P_CURVA) => ((a % m) + m) % m;
function potencia(base, exp, m = P_CURVA) {
  let r = 1n;
  let b = modCurva(base, m);
  for (let e = exp; e > 0n; e >>= 1n) {
    if (e & 1n) r = (r * b) % m;
    b = (b * b) % m;
  }
  return r;
}
const inverso = (a, m = P_CURVA) => potencia(a, m - 2n, m);

// Coordenadas jacobianas (X, Y, Z): sin inversiones dentro del bucle.
function doblar([x, y, z]) {
  if (y === 0n || z === 0n) return [0n, 1n, 0n];
  const yy = (y * y) % P_CURVA;
  const s = (4n * x * yy) % P_CURVA;
  const m = (3n * x * x) % P_CURVA;
  const x3 = modCurva(m * m - 2n * s);
  return [x3, modCurva(m * (s - x3) - 8n * yy * yy), (2n * y * z) % P_CURVA];
}
function sumar(a, b) {
  if (a[2] === 0n) return b;
  if (b[2] === 0n) return a;
  const z1z1 = (a[2] * a[2]) % P_CURVA;
  const z2z2 = (b[2] * b[2]) % P_CURVA;
  const u1 = (a[0] * z2z2) % P_CURVA;
  const u2 = (b[0] * z1z1) % P_CURVA;
  const s1 = (a[1] * b[2] * z2z2) % P_CURVA;
  const s2 = (b[1] * a[2] * z1z1) % P_CURVA;
  if (u1 === u2) return s1 === s2 ? doblar(a) : [0n, 1n, 0n];
  const h = modCurva(u2 - u1);
  const r = modCurva(s2 - s1);
  const hh = (h * h) % P_CURVA;
  const hhh = (h * hh) % P_CURVA;
  const x3 = modCurva(r * r - hhh - 2n * u1 * hh);
  return [x3, modCurva(r * (u1 * hh - x3) - s1 * hhh), (a[2] * b[2] * h) % P_CURVA];
}
function multiplicar(k, punto) {
  let r = [0n, 1n, 0n];
  for (let i = BigInt(k.toString(2).length) - 1n; i >= 0n; i -= 1n) {
    r = doblar(r);
    if ((k >> i) & 1n) r = sumar(r, punto);
  }
  return r;
}

function bytesDeHex(hex) {
  const limpio = hex.replace(/^0x/, "");
  return Uint8Array.from(limpio.match(/../g) || [], (p) => parseInt(p, 16));
}

// Dirección que firmó `mensaje` (texto) con `firma` (0x + r s v), como personal_sign / ecrecover.
function firmante(mensaje, firma) {
  if (!FIRMA_RE.test(String(firma).toLowerCase())) return null;
  const crudo = String(firma).toLowerCase();
  const r = BigInt(`0x${crudo.slice(2, 66)}`);
  const s = BigInt(`0x${crudo.slice(66, 130)}`);
  const v = parseInt(crudo.slice(130, 132), 16);
  const paridad = v >= 27 ? v - 27 : v;
  if ((paridad !== 0 && paridad !== 1) || r <= 0n || r >= N_CURVA || s <= 0n || s > N_CURVA / 2n) return null;
  const y2 = modCurva(r * r * r + 7n);
  let y = potencia(y2, (P_CURVA + 1n) / 4n);
  if ((y * y) % P_CURVA !== y2) return null;
  if (Number(y & 1n) !== paridad) y = P_CURVA - y;
  const cuerpo = new TextEncoder().encode(mensaje);
  const prefijo = new TextEncoder().encode(`\x19Ethereum Signed Message:\n${cuerpo.length}`);
  const unido = new Uint8Array(prefijo.length + cuerpo.length);
  unido.set(prefijo);
  unido.set(cuerpo, prefijo.length);
  const e = BigInt(`0x${keccak256(unido)}`);
  const rInv = inverso(r, N_CURVA);
  const q = sumar(multiplicar(modCurva(-e * rInv, N_CURVA), G_CURVA), multiplicar(modCurva(s * rInv, N_CURVA), [r, y, 1n]));
  if (q[2] === 0n) return null;
  const zInv = inverso(q[2]);
  const zInv2 = (zInv * zInv) % P_CURVA;
  const qx = (q[0] * zInv2) % P_CURVA;
  const qy = (q[1] * zInv2 * zInv) % P_CURVA;
  const publica = bytesDeHex(qx.toString(16).padStart(64, "0") + qy.toString(16).padStart(64, "0"));
  return `0x${keccak256(publica).slice(24)}`;
}

// La puerta de quien pagó, si la pasarela la trae con las dos firmas y ambas cuadran con ESTE pago.
function clienteDe(pago, anotado) {
  const desde = String(anotado?.desde || "").toLowerCase();
  if (!DIRECCION_RE.test(desde) || String(anotado?.clientTxId || "").toLowerCase() !== pago.clientTxId) return pago.pagador;
  const mensaje = `SERO aviso de pago v1\npuerta: ${desde}\nreferencia: ${pago.clientTxId}`;
  return firmante(mensaje, anotado.firmaPuerta) === desde && firmante(mensaje, anotado.firmaBolsillo) === pago.pagador ? desde : pago.pagador;
}

// ── Utilidades ──
function base64Url(texto) {
  const bytes = new TextEncoder().encode(texto);
  let binario = "";
  for (const b of bytes) binario += String.fromCharCode(b);
  return btoa(binario).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function hexAlAzar(bytes) {
  return Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (b) => b.toString(16).padStart(2, "0")).join("");
}

// Montos en centavos enteros: «12.50», «12,5», 12.5 → 1250. Nunca flotantes en la cuenta.
function aCentavos(valor, campo) {
  let texto;
  if (typeof valor === "number") {
    if (!Number.isFinite(valor) || valor < 0) throw new ErrorSero("monto_invalido", `${campo}: el monto no es válido.`);
    const centavos = Math.round(valor * 100);
    if (Math.abs(centavos - valor * 100) > 1e-6) throw new ErrorSero("monto_invalido", `${campo}: admite como máximo dos decimales.`);
    return centavos;
  }
  texto = String(valor ?? "").trim().replace(",", ".");
  const partes = texto.match(/^(\d{1,9})(?:\.(\d{1,2}))?$/);
  if (!partes) throw new ErrorSero("monto_invalido", `${campo}: «${String(valor)}» no es un monto válido (ejemplo: "12.50").`);
  return Number(partes[1]) * 100 + Number((partes[2] || "").padEnd(2, "0"));
}

function deCentavos(centavos) {
  return `${Math.floor(centavos / 100)}.${String(centavos % 100).padStart(2, "0")}`;
}

function limpiarTexto(valor, largo) {
  return String(valor ?? "").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim().slice(0, largo);
}

function direccionValida(valor, campo = "direccion") {
  const direccion = String(valor ?? "").trim();
  if (!DIRECCION_RE.test(direccion)) throw new ErrorSero("direccion_invalida", `${campo}: se espera una dirección 0x de 40 caracteres hexadecimales.`);
  return direccion.toLowerCase();
}

export function direccionCorta(direccion) {
  const d = String(direccion || "");
  return d.length > 12 ? `${d.slice(0, 6)}...${d.slice(-4)}` : d;
}

async function postJson(url, cuerpo, tiempo = 10000) {
  const control = new AbortController();
  const reloj = setTimeout(() => control.abort(), tiempo);
  try {
    const respuesta = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(cuerpo),
      signal: control.signal,
    });
    const datos = await respuesta.json().catch(() => null);
    return { status: respuesta.status, datos };
  } finally {
    clearTimeout(reloj);
  }
}

// ── Órdenes ──

/**
 * Crea una orden SERO idéntica a las de la app.
 * @param {object} opciones
 * @param {string} opciones.direccion   Billetera SERO que recibe el pago (0x…).
 * @param {string} [opciones.negocio]   Nombre visible en la ventana y en la notificación (40 caracteres).
 * @param {Array<{nombre:string, precio:string|number, cantidad?:number, id?:string}>} [opciones.productos]
 * @param {string|number} [opciones.monto]  En lugar de productos: un solo concepto por este monto.
 * @param {string} [opciones.concepto]  Descripción del monto único.
 * @param {string} [opciones.orden]     Tu referencia única (80 caracteres). La misma referencia con los mismos
 *                                      datos produce la misma orden: sirve para reintentar sin cobrar dos veces.
 * @param {number} [opciones.numero]    Número visible («Orden de compra N.º …»).
 */
export function crearOrden(opciones = {}) {
  const direccion = direccionValida(opciones.direccion);
  const negocio = limpiarTexto(opciones.negocio, 40);

  let lineas = opciones.productos;
  if (!Array.isArray(lineas) || !lineas.length) {
    if (opciones.monto === undefined) throw new ErrorSero("sin_productos", "Indica productos o un monto.");
    lineas = [{ nombre: limpiarTexto(opciones.concepto, 40) || (negocio ? `Pago a ${negocio}` : "Pago"), precio: opciones.monto, cantidad: 1 }];
  }
  if (lineas.length > MAX_PRODUCTOS) throw new ErrorSero("demasiados_productos", `Una orden admite hasta ${MAX_PRODUCTOS} líneas.`);

  let totalCentavos = 0;
  const productos = lineas.map((linea, i) => {
    const nombre = limpiarTexto(linea?.nombre, 40);
    if (!nombre) throw new ErrorSero("producto_invalido", `productos[${i}]: falta el nombre.`);
    const cantidad = linea?.cantidad === undefined ? 1 : Number(linea.cantidad);
    if (!Number.isInteger(cantidad) || cantidad < 1 || cantidad > 999) throw new ErrorSero("producto_invalido", `productos[${i}]: la cantidad debe ser un entero entre 1 y 999.`);
    const precio = aCentavos(linea?.precio, `productos[${i}].precio`);
    const subtotal = precio * cantidad;
    totalCentavos += subtotal;
    return {
      id: limpiarTexto(linea?.id, 80) || `p${i + 1}`,
      name: nombre,
      price: deCentavos(precio),
      quantity: cantidad,
      subtotal: deCentavos(subtotal),
    };
  });
  if (totalCentavos < MONTO_MINIMO_CENTAVOS) throw new ErrorSero("monto_minimo", "El total mínimo de una orden es 1.00 USDT.");

  const id = limpiarTexto(opciones.orden, 80) || `web-${hexAlAzar(10)}`;
  const digitos = id.replace(/\D/g, "").slice(-9);
  const numero = Number.isInteger(opciones.numero) && opciones.numero > 0 ? opciones.numero : Number(digitos) || (Math.floor(Date.now() / 1000) % 1_000_000);

  // Mismo orden de campos que la app: el token (y su huella) dependen de cada byte.
  const datos = base64Url(JSON.stringify({
    v: 1,
    id,
    number: numero,
    status: "enProceso",
    total: deCentavos(totalCentavos),
    currency: "USDT",
    merchantAddress: direccion,
    products: productos,
  }));
  const canonico = `SERO-ORDER-V1.${datos}`;
  const token = `${canonico}.${keccak256(canonico).slice(0, 10).toUpperCase()}`;
  if (token.length > MAX_TOKEN) throw new ErrorSero("orden_demasiado_grande", "La orden es demasiado grande: acorta los nombres o agrupa productos.");

  return Object.freeze({
    token,
    huella: huellaDeToken(token),
    id,
    numero,
    negocio,
    direccion,
    total: deCentavos(totalCentavos),
    productos: Object.freeze(productos.map((p) => Object.freeze({ id: p.id, nombre: p.name, precio: p.price, cantidad: p.quantity, subtotal: p.subtotal }))),
    cantidadDeProductos: productos.length,
  });
}

export function huellaDeToken(token) {
  return keccak256(`SERO-ORDEN-HUELLA-V1|${String(token).trim()}`).slice(0, 48);
}

// ── Suscripciones: una orden por periodo, siempre la misma para el mismo periodo ──

export function periodoActual(fecha = new Date()) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

export function periodoLegible(periodo) {
  const partes = String(periodo).match(PERIODO_RE);
  return partes ? `${MESES[Number(partes[2]) - 1]} de ${partes[1]}` : "";
}

/**
 * La orden de un periodo de una suscripción. Es determinista: el mismo plan, cliente y periodo
 * producen siempre el mismo token, así que cobrar dos veces el mismo mes es imposible.
 * @param {object} opciones
 * @param {string} opciones.direccion
 * @param {string} [opciones.negocio]
 * @param {{id:string, nombre:string, precio:string|number}} opciones.plan
 * @param {string} opciones.cliente   Tu identificador interno del suscriptor.
 * @param {string} [opciones.periodo] «AAAA-MM». Por omisión, el mes en curso.
 */
export function ordenDeSuscripcion(opciones = {}) {
  const plan = opciones.plan || {};
  const planId = limpiarTexto(plan.id, 40);
  const cliente = limpiarTexto(opciones.cliente, 80);
  const periodo = String(opciones.periodo || periodoActual());
  if (!planId || !limpiarTexto(plan.nombre, 40)) throw new ErrorSero("plan_invalido", "plan: se esperan id y nombre.");
  if (!cliente) throw new ErrorSero("cliente_invalido", "cliente: indica tu identificador del suscriptor.");
  const partes = periodo.match(PERIODO_RE);
  if (!partes) throw new ErrorSero("periodo_invalido", "periodo: se espera el formato AAAA-MM.");
  const sello = keccak256(`${planId}|${cliente}`).slice(0, 16);
  const orden = crearOrden({
    direccion: opciones.direccion,
    negocio: opciones.negocio,
    orden: `sus-${planId}-${sello}-${periodo}`.slice(0, 80),
    numero: Number(`${partes[1]}${partes[2]}`),
    productos: [{ id: planId, nombre: `${limpiarTexto(plan.nombre, 40)}`.slice(0, 40), precio: plan.precio, cantidad: 1 }],
  });
  return Object.freeze({ ...orden, suscripcion: Object.freeze({ plan: planId, cliente, periodo, etiqueta: periodoLegible(periodo) }) });
}

// ── Enlaces ──

export function enlaceLargo(orden) {
  return `${APP_SERO}/#sero-order=${encodeURIComponent(orden.token)}`;
}

/** Enlace corto (/o/…) para el QR. Si la pasarela no responde, devuelve el enlace largo. */
export async function enlaceCorto(orden, { pasarela = PASARELA } = {}) {
  try {
    const { status, datos } = await postJson(`${pasarela}/api/orders`, { order: orden.token });
    if (status === 200 && typeof datos?.url === "string" && /^https:\/\//.test(datos.url)) return datos.url;
  } catch {
    // Sin red o sin pasarela: el enlace largo funciona igual.
  }
  return enlaceLargo(orden);
}

// ── Cobro por notificación ──

const MENSAJES_COBRO = {
  propia: "Esa es la dirección del comercio.",
  bloqueado: "Esa billetera no acepta cobros de este comercio.",
  pagada: "Esta orden ya fue pagada.",
  demasiados_cobros: "Esa billetera recibió demasiados cobros en la última hora. Paga escaneando el QR.",
  sin_notificaciones: "Esa billetera no tiene las notificaciones activas. Paga escaneando el QR desde SERO.",
  datos_invalidos: "La orden o la dirección no son válidas.",
  rate_limited: "Demasiadas solicitudes seguidas. Intenta de nuevo en un momento.",
  sin_conexion: "No hay conexión con SERO. Intenta de nuevo.",
};

/**
 * Envía la orden a la billetera de quien paga: le llega una notificación insistente
 * («Toca para revisar y pagar») que abre la app con la orden lista para aprobar.
 * @returns {Promise<{ok:true, id:string} | {ok:false, codigo:string, mensaje:string}>}
 */
export async function enviarCobro(orden, destino, { pasarela = PASARELA, reintentos = 2 } = {}) {
  let billetera;
  try {
    billetera = direccionValida(destino, "destino");
  } catch (error) {
    return { ok: false, codigo: error.codigo, mensaje: "Revisa la dirección: empieza por 0x y tiene 42 caracteres." };
  }
  for (let intento = 0; ; intento += 1) {
    let respuesta;
    try {
      respuesta = await postJson(`${pasarela}/api/cobros`, { token: orden.token, huella: orden.huella, destino: billetera, negocio: orden.negocio || "" }, 15000);
    } catch {
      respuesta = { status: 0, datos: { error: "sin_conexion" } };
    }
    const { status, datos } = respuesta;
    if (status === 200 && datos?.ok && ID_COBRO_RE.test(String(datos.id))) return { ok: true, id: datos.id };
    const codigo = typeof datos?.error === "string" ? datos.error : "sin_conexion";
    if ((codigo === "rate_limited" || codigo === "sin_conexion") && intento < reintentos) {
      await new Promise((listo) => setTimeout(listo, 1500 * (intento + 1)));
      continue;
    }
    return { ok: false, codigo, mensaje: MENSAJES_COBRO[codigo] || "No se pudo enviar el cobro." };
  }
}

export async function cancelarCobro(id, { pasarela = PASARELA } = {}) {
  if (!ID_COBRO_RE.test(String(id))) return false;
  try {
    const { status } = await postJson(`${pasarela}/api/cobros/cancelar`, { id });
    return status === 200;
  } catch {
    return false;
  }
}

/** activo | pagado | cancelado | rechazado | vencido, o null si no se pudo consultar. */
export async function estadoDelCobro(id, { pasarela = PASARELA } = {}) {
  if (!ID_COBRO_RE.test(String(id))) return null;
  try {
    const { status, datos } = await postJson(`${pasarela}/api/cobros/estado`, { id });
    return status === 200 && typeof datos?.estado === "string" ? datos.estado : null;
  } catch {
    return null;
  }
}

// ── Verificación del pago ──

// Con `exigir`, una respuesta vacía no se da por buena: los nodos públicos podan historia y uno
// puede no tener un recibo de hace días que otro sí tiene. Solo si todos responden vacío, es null.
async function rpc(metodo, parametros, lista = RPC_PUBLICOS, { exigir = false } = {}) {
  let ultimoError;
  let respondioVacio = false;
  for (const url of lista) {
    try {
      const { status, datos } = await postJson(url, { jsonrpc: "2.0", id: 1, method: metodo, params: parametros }, 8000);
      if (status === 200 && datos && !datos.error) {
        if (!exigir || (datos.result !== null && datos.result !== undefined)) return datos.result;
        respondioVacio = true;
        continue;
      }
      ultimoError = new Error(datos?.error?.message || `HTTP ${status}`);
    } catch (error) {
      ultimoError = error;
    }
  }
  if (respondioVacio) return null;
  throw new ErrorSero("rpc_no_disponible", `Ningún nodo público respondió (${ultimoError?.message || "sin detalle"}).`);
}

function leerPago(log, tx, bloque) {
  const temas = Array.isArray(log?.topics) ? log.topics.map((t) => String(t).toLowerCase()) : [];
  if (String(log?.address || "").toLowerCase() !== CONTRATO_SERO) return null;
  if (temas[0] !== TEMA_PAGO_SERO || temas.length < 4) return null;
  const datos = String(log.data || "").toLowerCase();
  if (!/^0x[0-9a-f]{64,}$/.test(datos)) return null;
  return {
    huella: temas[1].slice(2, 50),
    clientTxId: temas[1],
    referencia: String(tx || log.transactionHash || "").toLowerCase(),
    pagador: `0x${temas[2].slice(-40)}`,
    destino: `0x${temas[3].slice(-40)}`,
    wei: BigInt(`0x${datos.slice(2, 66)}`),
    bloque: Number.parseInt(String(bloque || log.blockNumber || "0x0"), 16) || 0,
  };
}

function reciboDe(orden, pago, anotado) {
  return Object.freeze({
    referencia: pago.referencia,
    pagador: pago.pagador,
    cliente: clienteDe(pago, anotado),
    destino: pago.destino,
    monto: orden.total,
    bloque: pago.bloque,
    orden: orden.id,
    numero: orden.numero,
    huella: orden.huella,
    ...(orden.suscripcion ? { suscripcion: orden.suscripcion } : {}),
  });
}

function coincide(orden, pago) {
  return pago.huella === orden.huella
    && pago.destino === orden.direccion
    && pago.wei === BigInt(aCentavos(orden.total, "total")) * WEI_POR_CENTAVO;
}

// Lo que la pasarela anotó de esa transacción (para el «de quién»). Si no responde, no hay firmas.
async function anotadoDe(orden, tx, pasarela) {
  try {
    const { status, datos } = await postJson(`${pasarela}/api/pagos/estado`, { huellas: [orden.huella] }, 5000);
    return status === 200 && datos?.ok ? (datos.pagos?.[orden.huella] || []).find((p) => String(p.tx).toLowerCase() === tx) || null : null;
  } catch {
    return null;
  }
}

/** Lee el recibo de una transacción en la red y confirma que paga exactamente esta orden. */
export async function verificarReferencia(orden, referencia, { rpc: nodos = RPC_PUBLICOS, pasarela = PASARELA, anotado } = {}) {
  const tx = String(referencia || "").toLowerCase();
  if (!TX_RE.test(tx)) return null;
  const recibo = await rpc("eth_getTransactionReceipt", [tx], nodos, { exigir: true });
  if (!recibo || recibo.status !== "0x1") return null;
  for (const log of recibo.logs || []) {
    const pago = leerPago(log, tx, recibo.blockNumber);
    if (pago && coincide(orden, pago)) return reciboDe(orden, pago, anotado === undefined ? await anotadoDe(orden, tx, pasarela) : anotado);
  }
  return null;
}

/**
 * ¿Ya se pagó esta orden? Pregunta por la huella a SERO y, antes de responder, comprueba el pago
 * en la red con nodos públicos. Devuelve el recibo verificado o null.
 * Con `bloques` busca además en los últimos N bloques de la red (por si el aviso no llegó).
 */
export async function consultarPago(orden, { pasarela = PASARELA, rpc: nodos = RPC_PUBLICOS, bloques = 0 } = {}) {
  if (!HUELLA_RE.test(orden?.huella || "")) throw new ErrorSero("orden_invalida", "Se espera una orden creada con crearOrden().");
  try {
    const { status, datos } = await postJson(`${pasarela}/api/pagos/estado`, { huellas: [orden.huella] });
    const anotados = status === 200 && datos?.ok ? datos.pagos?.[orden.huella] || [] : [];
    for (const anotado of anotados) {
      if (String(anotado.destino).toLowerCase() !== orden.direccion) continue;
      const recibo = await verificarReferencia(orden, anotado.tx, { rpc: nodos, anotado });
      if (recibo) return recibo;
    }
  } catch (error) {
    if (error instanceof ErrorSero && error.codigo === "rpc_no_disponible") throw error;
    // La pasarela no respondió: queda la búsqueda en bloques.
  }
  if (!bloques) return null;
  const cabeza = Number.parseInt(String(await rpc("eth_blockNumber", [], nodos)), 16);
  if (!Number.isFinite(cabeza)) return null;
  const logs = await rpc("eth_getLogs", [{
    address: CONTRATO_SERO,
    fromBlock: `0x${Math.max(0, cabeza - Math.min(bloques, 5000)).toString(16)}`,
    toBlock: "latest",
    topics: [TEMA_PAGO_SERO, null, null, `0x${orden.direccion.slice(2).padStart(64, "0")}`],
  }], nodos);
  for (const log of logs || []) {
    const pago = leerPago(log);
    if (pago && coincide(orden, pago)) return verificarReferencia(orden, pago.referencia, { rpc: nodos, pasarela });
  }
  return null;
}

/**
 * Espera el pago: consulta cada `intervalo` ms (y cada 20 s busca en los bloques recientes).
 * Se detiene con `senal` (AbortSignal). Resuelve con el recibo verificado.
 */
export function esperarPago(orden, { intervalo = 4000, senal, pasarela = PASARELA, rpc: nodos = RPC_PUBLICOS } = {}) {
  return new Promise((resolver, rechazar) => {
    let vuelta = 0;
    let reloj;
    const detener = () => { clearTimeout(reloj); rechazar(new ErrorSero("cancelado", "Se dejó de esperar el pago.")); };
    if (senal?.aborted) return detener();
    senal?.addEventListener("abort", detener, { once: true });
    const revisar = async () => {
      vuelta += 1;
      try {
        const bloques = vuelta % Math.max(1, Math.round(20000 / intervalo)) === 0 ? 900 : 0;
        const recibo = await consultarPago(orden, { pasarela, rpc: nodos, bloques });
        if (senal?.aborted) return;
        if (recibo) {
          senal?.removeEventListener("abort", detener);
          return resolver(recibo);
        }
      } catch {
        // Un tropiezo de red no detiene la espera.
      }
      if (!senal?.aborted) reloj = setTimeout(revisar, intervalo);
    };
    revisar();
  });
}
