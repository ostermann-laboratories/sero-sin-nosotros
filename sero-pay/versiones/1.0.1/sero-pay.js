/*!
 * SERO Pay 1.0.1 (navegador)
 * Cobros en USDT con SERO para cualquier web: órdenes, cobro por notificación, QR y
 * verificación del pago en la red. Sin claves, sin cuentas y sin dependencias.
 * Documentación: https://web.sero.foundation/pagar-con-sero/
 * Licencia MIT. Copyright (c) 2026 Ostermann Laboratories.
 */
(function () {
"use strict";
if (typeof window === "undefined") return;
if (window.SeroPay && window.SeroPay.VERSION) return;
// ─── Código QR (ISO/IEC 18004) ─────────────────────────────────────────────────
// Codificador propio, sin dependencias: modo byte (UTF-8), versiones 1 a 40, niveles de
// corrección L, M, Q y H, y la máscara de menor penalización. Devuelve la matriz de módulos
// (true = oscuro) sin zona de silencio; quien dibuja decide el margen.

const QR_NIVELES = {
  L: { indice: 0, formato: 1 },
  M: { indice: 1, formato: 0 },
  Q: { indice: 2, formato: 3 },
  H: { indice: 3, formato: 2 },
};

// Codewords de corrección por bloque y número de bloques, por nivel (L, M, Q, H) y versión.
const QR_ECC_POR_BLOQUE = [
  [-1, 7, 10, 15, 20, 26, 18, 20, 24, 30, 18, 20, 24, 26, 30, 22, 24, 28, 30, 28, 28, 28, 28, 30, 30, 26, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26, 30, 22, 22, 24, 24, 28, 28, 26, 26, 26, 26, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28, 28],
  [-1, 13, 22, 18, 26, 18, 24, 18, 22, 20, 24, 28, 26, 24, 20, 30, 24, 28, 28, 26, 30, 28, 30, 30, 30, 30, 28, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
  [-1, 17, 28, 22, 16, 22, 28, 26, 26, 24, 28, 24, 28, 22, 24, 24, 30, 28, 28, 26, 28, 30, 24, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30, 30],
];
const QR_BLOQUES = [
  [-1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 4, 4, 4, 4, 4, 6, 6, 6, 6, 7, 8, 8, 9, 9, 10, 12, 12, 12, 13, 14, 15, 16, 17, 18, 19, 19, 20, 21, 22, 24, 25],
  [-1, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5, 5, 8, 9, 9, 10, 10, 11, 13, 14, 16, 17, 17, 18, 20, 21, 23, 25, 26, 28, 29, 31, 33, 35, 37, 38, 40, 43, 45, 47, 49],
  [-1, 1, 1, 2, 2, 4, 4, 6, 6, 8, 8, 8, 10, 12, 16, 12, 17, 16, 18, 21, 20, 23, 23, 25, 27, 29, 34, 34, 35, 38, 40, 43, 45, 48, 51, 53, 56, 59, 62, 65, 68],
  [-1, 1, 1, 2, 4, 4, 4, 5, 6, 8, 8, 11, 11, 16, 16, 18, 16, 19, 21, 25, 25, 25, 34, 30, 32, 35, 37, 40, 42, 45, 48, 51, 54, 57, 60, 63, 66, 70, 74, 77, 81],
];

function qrModulosDeDatos(version) {
  let total = (16 * version + 128) * version + 64;
  if (version >= 2) {
    const alineaciones = Math.floor(version / 7) + 2;
    total -= (25 * alineaciones - 10) * alineaciones - 55;
    if (version >= 7) total -= 36;
  }
  return total;
}

function qrCodewordsDeDatos(version, nivel) {
  return Math.floor(qrModulosDeDatos(version) / 8) - QR_ECC_POR_BLOQUE[nivel.indice][version] * QR_BLOQUES[nivel.indice][version];
}

// Aritmética en GF(2^8) con el polinomio 0x11D.
function qrMultiplicar(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i -= 1) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function qrDivisor(grado) {
  const divisor = new Array(grado).fill(0);
  divisor[grado - 1] = 1;
  let raiz = 1;
  for (let i = 0; i < grado; i += 1) {
    for (let j = 0; j < grado; j += 1) {
      divisor[j] = qrMultiplicar(divisor[j], raiz);
      if (j + 1 < grado) divisor[j] ^= divisor[j + 1];
    }
    raiz = qrMultiplicar(raiz, 0x02);
  }
  return divisor;
}

function qrResto(datos, divisor) {
  const resto = divisor.map(() => 0);
  for (const byte of datos) {
    const factor = byte ^ resto.shift();
    resto.push(0);
    divisor.forEach((coeficiente, i) => { resto[i] ^= qrMultiplicar(coeficiente, factor); });
  }
  return resto;
}

function qrBit(valor, i) {
  return ((valor >>> i) & 1) !== 0;
}

function qrPosicionesDeAlineacion(version, tamano) {
  if (version === 1) return [];
  const cantidad = Math.floor(version / 7) + 2;
  const paso = version === 32 ? 26 : Math.ceil((version * 4 + 4) / (cantidad * 2 - 2)) * 2;
  const posiciones = [6];
  for (let pos = tamano - 7; posiciones.length < cantidad; pos -= paso) posiciones.splice(1, 0, pos);
  return posiciones;
}

function qrMatriz(texto, nivelDeseado = "M") {
  const nivel = QR_NIVELES[nivelDeseado] || QR_NIVELES.M;
  const bytes = Array.from(new TextEncoder().encode(String(texto)));

  let version = 1;
  for (; version <= 40; version += 1) {
    const bitsDeLargo = version <= 9 ? 8 : 16;
    if (4 + bitsDeLargo + bytes.length * 8 <= qrCodewordsDeDatos(version, nivel) * 8) break;
  }
  if (version > 40) throw new Error("qr_demasiado_largo");

  // Segmento en modo byte, terminador y relleno.
  const bits = [];
  const agregar = (valor, largo) => { for (let i = largo - 1; i >= 0; i -= 1) bits.push((valor >>> i) & 1); };
  agregar(0b0100, 4);
  agregar(bytes.length, version <= 9 ? 8 : 16);
  for (const b of bytes) agregar(b, 8);
  const capacidad = qrCodewordsDeDatos(version, nivel) * 8;
  agregar(0, Math.min(4, capacidad - bits.length));
  agregar(0, (8 - (bits.length % 8)) % 8);
  for (let relleno = 0xec; bits.length < capacidad; relleno ^= 0xec ^ 0x11) agregar(relleno, 8);
  const datos = [];
  for (let i = 0; i < bits.length; i += 8) datos.push(bits.slice(i, i + 8).reduce((acc, b) => (acc << 1) | b, 0));

  // Bloques con su corrección de errores, intercalados.
  const cantidadDeBloques = QR_BLOQUES[nivel.indice][version];
  const eccPorBloque = QR_ECC_POR_BLOQUE[nivel.indice][version];
  const codewordsTotales = Math.floor(qrModulosDeDatos(version) / 8);
  const bloquesCortos = cantidadDeBloques - (codewordsTotales % cantidadDeBloques);
  const largoCorto = Math.floor(codewordsTotales / cantidadDeBloques);
  const divisor = qrDivisor(eccPorBloque);
  const bloques = [];
  for (let i = 0, k = 0; i < cantidadDeBloques; i += 1) {
    const parte = datos.slice(k, k + largoCorto - eccPorBloque + (i < bloquesCortos ? 0 : 1));
    k += parte.length;
    const ecc = qrResto(parte, divisor);
    if (i < bloquesCortos) parte.push(0);
    bloques.push(parte.concat(ecc));
  }
  const codewords = [];
  for (let i = 0; i < bloques[0].length; i += 1) {
    bloques.forEach((bloque, j) => {
      if (i !== largoCorto - eccPorBloque || j >= bloquesCortos) codewords.push(bloque[i]);
    });
  }

  // Patrones fijos.
  const tamano = version * 4 + 17;
  const modulos = Array.from({ length: tamano }, () => new Array(tamano).fill(false));
  const fijos = Array.from({ length: tamano }, () => new Array(tamano).fill(false));
  const fijar = (x, y, oscuro) => { modulos[y][x] = oscuro; fijos[y][x] = true; };

  for (let i = 0; i < tamano; i += 1) {
    fijar(6, i, i % 2 === 0);
    fijar(i, 6, i % 2 === 0);
  }
  for (const [cx, cy] of [[3, 3], [tamano - 4, 3], [3, tamano - 4]]) {
    for (let dy = -4; dy <= 4; dy += 1) {
      for (let dx = -4; dx <= 4; dx += 1) {
        const x = cx + dx;
        const y = cy + dy;
        const distancia = Math.max(Math.abs(dx), Math.abs(dy));
        if (x >= 0 && x < tamano && y >= 0 && y < tamano) fijar(x, y, distancia !== 2 && distancia !== 4);
      }
    }
  }
  const alineaciones = qrPosicionesDeAlineacion(version, tamano);
  const ultima = alineaciones.length - 1;
  alineaciones.forEach((ax, i) => {
    alineaciones.forEach((ay, j) => {
      if ((i === 0 && j === 0) || (i === 0 && j === ultima) || (i === ultima && j === 0)) return;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) fijar(ax + dx, ay + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
      }
    });
  });

  const dibujarFormato = (mascara) => {
    const valor = (nivel.formato << 3) | mascara;
    let resto = valor;
    for (let i = 0; i < 10; i += 1) resto = (resto << 1) ^ ((resto >>> 9) * 0x537);
    const formato = ((valor << 10) | resto) ^ 0x5412;
    for (let i = 0; i <= 5; i += 1) fijar(8, i, qrBit(formato, i));
    fijar(8, 7, qrBit(formato, 6));
    fijar(8, 8, qrBit(formato, 7));
    fijar(7, 8, qrBit(formato, 8));
    for (let i = 9; i < 15; i += 1) fijar(14 - i, 8, qrBit(formato, i));
    for (let i = 0; i < 8; i += 1) fijar(tamano - 1 - i, 8, qrBit(formato, i));
    for (let i = 8; i < 15; i += 1) fijar(8, tamano - 15 + i, qrBit(formato, i));
    fijar(8, tamano - 8, true);
  };
  dibujarFormato(0);

  if (version >= 7) {
    let resto = version;
    for (let i = 0; i < 12; i += 1) resto = (resto << 1) ^ ((resto >>> 11) * 0x1f25);
    const bitsDeVersion = (version << 12) | resto;
    for (let i = 0; i < 18; i += 1) {
      const a = tamano - 11 + (i % 3);
      const b = Math.floor(i / 3);
      fijar(a, b, qrBit(bitsDeVersion, i));
      fijar(b, a, qrBit(bitsDeVersion, i));
    }
  }

  // Datos en zigzag.
  let indice = 0;
  for (let derecha = tamano - 1; derecha >= 1; derecha -= 2) {
    if (derecha === 6) derecha = 5;
    for (let vertical = 0; vertical < tamano; vertical += 1) {
      for (let j = 0; j < 2; j += 1) {
        const x = derecha - j;
        const haciaArriba = ((derecha + 1) & 2) === 0;
        const y = haciaArriba ? tamano - 1 - vertical : vertical;
        if (!fijos[y][x] && indice < codewords.length * 8) {
          modulos[y][x] = qrBit(codewords[indice >>> 3], 7 - (indice & 7));
          indice += 1;
        }
      }
    }
  }

  const invierte = [
    (x, y) => (x + y) % 2 === 0,
    (x, y) => y % 2 === 0,
    (x) => x % 3 === 0,
    (x, y) => (x + y) % 3 === 0,
    (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0,
    (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
    (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0,
    (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
  ];
  const aplicarMascara = (mascara) => {
    for (let y = 0; y < tamano; y += 1) {
      for (let x = 0; x < tamano; x += 1) {
        if (!fijos[y][x] && invierte[mascara](x, y)) modulos[y][x] = !modulos[y][x];
      }
    }
  };

  // Penalización (reglas N1 a N4 de la norma).
  const penalizacion = () => {
    let puntos = 0;
    const lineas = [];
    for (let i = 0; i < tamano; i += 1) {
      lineas.push(modulos[i]);
      lineas.push(modulos.map((fila) => fila[i]));
    }
    for (const linea of lineas) {
      let corrida = 1;
      for (let i = 1; i <= tamano; i += 1) {
        if (i < tamano && linea[i] === linea[i - 1]) {
          corrida += 1;
        } else {
          if (corrida >= 5) puntos += 3 + (corrida - 5);
          corrida = 1;
        }
      }
      const cadena = linea.map((m) => (m ? "1" : "0")).join("");
      for (const patron of ["10111010000", "00001011101"]) {
        for (let desde = cadena.indexOf(patron); desde !== -1; desde = cadena.indexOf(patron, desde + 1)) puntos += 40;
      }
    }
    let oscuros = 0;
    for (let y = 0; y < tamano; y += 1) {
      for (let x = 0; x < tamano; x += 1) {
        if (modulos[y][x]) oscuros += 1;
        if (x < tamano - 1 && y < tamano - 1) {
          const c = modulos[y][x];
          if (c === modulos[y][x + 1] && c === modulos[y + 1][x] && c === modulos[y + 1][x + 1]) puntos += 3;
        }
      }
    }
    const total = tamano * tamano;
    puntos += (Math.ceil(Math.abs(oscuros * 20 - total * 10) / total) - 1) * 10;
    return puntos;
  };

  let mejor = 0;
  let menor = Infinity;
  for (let mascara = 0; mascara < 8; mascara += 1) {
    aplicarMascara(mascara);
    dibujarFormato(mascara);
    const puntos = penalizacion();
    if (puntos < menor) { menor = puntos; mejor = mascara; }
    aplicarMascara(mascara);
  }
  aplicarMascara(mejor);
  dibujarFormato(mejor);
  return modulos;
}

// SVG listo para incrustar (correos, facturas, páginas generadas en el servidor).
function qrSvg(texto, { nivel = "M", margen = 4, oscuro = "#0b0b0c", claro = "#ffffff" } = {}) {
  const matriz = qrMatriz(texto, nivel);
  const lado = matriz.length + margen * 2;
  let trazo = "";
  matriz.forEach((fila, y) => {
    fila.forEach((m, x) => { if (m) trazo += `M${x + margen},${y + margen}h1v1h-1z`; });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${claro}"/><path d="${trazo}" fill="${oscuro}"/></svg>`;
}

// ─── Núcleo: órdenes, cobros y verificación de pagos ──────────────────────────
// Funciona igual en el navegador y en el servidor (Node 18+, Deno, Bun, Workers): solo usa
// fetch, TextEncoder, crypto.getRandomValues y AbortController.
//
// Una orden SERO es un token autocontenido (SERO-ORDER-V1.<datos>.<suma>) idéntico al que
// genera la app. De él sale la huella: los primeros 24 bytes de
// keccak256("SERO-ORDEN-HUELLA-V1|" + token). La app de quien paga graba esa huella en el
// clientTxId del pago, y el evento PaymentExecuted del contrato la deja en la cadena. Por eso
// un pago se reconoce sin cuentas, sin claves y sin guardar nada del comercio.

const VERSION = "1.0.1";

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

class ErrorSero extends Error {
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

function keccak256(entrada) {
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

function direccionCorta(direccion) {
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
function crearOrden(opciones = {}) {
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

function huellaDeToken(token) {
  return keccak256(`SERO-ORDEN-HUELLA-V1|${String(token).trim()}`).slice(0, 48);
}

// ── Suscripciones: una orden por periodo, siempre la misma para el mismo periodo ──

function periodoActual(fecha = new Date()) {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, "0")}`;
}

function periodoLegible(periodo) {
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
function ordenDeSuscripcion(opciones = {}) {
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

function enlaceLargo(orden) {
  return `${APP_SERO}/#sero-order=${encodeURIComponent(orden.token)}`;
}

/** Enlace corto (/o/…) para el QR. Si la pasarela no responde, devuelve el enlace largo. */
async function enlaceCorto(orden, { pasarela = PASARELA } = {}) {
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
async function enviarCobro(orden, destino, { pasarela = PASARELA, reintentos = 2 } = {}) {
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

async function cancelarCobro(id, { pasarela = PASARELA } = {}) {
  if (!ID_COBRO_RE.test(String(id))) return false;
  try {
    const { status } = await postJson(`${pasarela}/api/cobros/cancelar`, { id });
    return status === 200;
  } catch {
    return false;
  }
}

/** activo | pagado | cancelado | rechazado | vencido, o null si no se pudo consultar. */
async function estadoDelCobro(id, { pasarela = PASARELA } = {}) {
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
    referencia: String(tx || log.transactionHash || "").toLowerCase(),
    pagador: `0x${temas[2].slice(-40)}`,
    destino: `0x${temas[3].slice(-40)}`,
    wei: BigInt(`0x${datos.slice(2, 66)}`),
    bloque: Number.parseInt(String(bloque || log.blockNumber || "0x0"), 16) || 0,
  };
}

function reciboDe(orden, pago) {
  return Object.freeze({
    referencia: pago.referencia,
    pagador: pago.pagador,
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

/** Lee el recibo de una transacción en la red y confirma que paga exactamente esta orden. */
async function verificarReferencia(orden, referencia, { rpc: nodos = RPC_PUBLICOS } = {}) {
  const tx = String(referencia || "").toLowerCase();
  if (!TX_RE.test(tx)) return null;
  const recibo = await rpc("eth_getTransactionReceipt", [tx], nodos, { exigir: true });
  if (!recibo || recibo.status !== "0x1") return null;
  for (const log of recibo.logs || []) {
    const pago = leerPago(log, tx, recibo.blockNumber);
    if (pago && coincide(orden, pago)) return reciboDe(orden, pago);
  }
  return null;
}

/**
 * ¿Ya se pagó esta orden? Pregunta por la huella a SERO y, antes de responder, comprueba el pago
 * en la red con nodos públicos. Devuelve el recibo verificado o null.
 * Con `bloques` busca además en los últimos N bloques de la red (por si el aviso no llegó).
 */
async function consultarPago(orden, { pasarela = PASARELA, rpc: nodos = RPC_PUBLICOS, bloques = 0 } = {}) {
  if (!HUELLA_RE.test(orden?.huella || "")) throw new ErrorSero("orden_invalida", "Se espera una orden creada con crearOrden().");
  try {
    const { status, datos } = await postJson(`${pasarela}/api/pagos/estado`, { huellas: [orden.huella] });
    const anotados = status === 200 && datos?.ok ? datos.pagos?.[orden.huella] || [] : [];
    for (const anotado of anotados) {
      if (String(anotado.destino).toLowerCase() !== orden.direccion) continue;
      const recibo = await verificarReferencia(orden, anotado.tx, { rpc: nodos });
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
    if (pago && coincide(orden, pago)) return verificarReferencia(orden, pago.referencia, { rpc: nodos });
  }
  return null;
}

/**
 * Espera el pago: consulta cada `intervalo` ms (y cada 20 s busca en los bloques recientes).
 * Se detiene con `senal` (AbortSignal). Resuelve con el recibo verificado.
 */
function esperarPago(orden, { intervalo = 4000, senal, pasarela = PASARELA, rpc: nodos = RPC_PUBLICOS } = {}) {
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

// ─── Interfaz (solo navegador) ─────────────────────────────────────────────────
// Ventana de pago y botón «Pagar con SERO». Todo vive en Shadow DOM con hojas de estilo
// construidas (adoptedStyleSheets): los estilos del comercio no la alteran y una CSP estricta
// en style-src no la bloquea. Ningún dato del comercio se inserta como HTML.

const TINTA = "#0b0b0c";
const VERDE = "#0a9f55";
const FUENTE = `-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`;
const MONO = `ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace`;
const CLAVE_BILLETERA = "sero-pay:billetera";
const BILLETERA_DEMO = "0x2b9f4d0e6a1c3f5e7d9b0a2c4e6f8a1b3c5d7e9f";

const MARCA_SVG = ["0 0 24 24", [
  ["circle", { cx: 12, cy: 12.6, r: 8.6, fill: "none", stroke: "currentColor", "stroke-width": 2 }],
  ["circle", { cx: 12, cy: 12.6, r: 3.5, fill: "currentColor" }],
  ["circle", { cx: 12, cy: 4, r: 2.1, fill: "currentColor" }],
]];

const CSS_VENTANA = `
:host { all: initial; }
.fondo { position: fixed; inset: 0; z-index: 2147483000; display: flex; align-items: center; justify-content: center; padding: 16px; background: rgba(11, 11, 12, .44); -webkit-backdrop-filter: blur(6px); backdrop-filter: blur(6px); font-family: ${FUENTE}; color: ${TINTA}; -webkit-font-smoothing: antialiased; animation: aparecer .18s ease-out; }
.hoja { position: relative; box-sizing: border-box; width: 100%; max-width: 400px; max-height: calc(100dvh - 32px); overflow-y: auto; overscroll-behavior: contain; padding: 22px 24px 20px; border-radius: 28px; background: #fff; box-shadow: 0 30px 80px rgba(11, 11, 12, .28); animation: subir .24s cubic-bezier(.2, .8, .2, 1); }
@media (max-width: 520px) {
  .fondo { align-items: flex-end; padding: 0; }
  .hoja { max-width: none; max-height: 94dvh; border-radius: 28px 28px 0 0; padding-bottom: calc(20px + env(safe-area-inset-bottom)); }
}
@keyframes aparecer { from { opacity: 0; } }
@keyframes subir { from { transform: translateY(18px); opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .fondo, .hoja { animation: none; } }
* { box-sizing: border-box; }
button { font: inherit; color: inherit; }
.cabeza { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }
.sello { display: inline-flex; align-items: center; gap: 8px; font-size: 13px; font-weight: 700; letter-spacing: .02em; }
.sello svg { width: 18px; height: 18px; }
.cerrar { display: grid; place-items: center; width: 36px; height: 36px; margin: -6px -8px -6px 0; border: 0; border-radius: 50%; background: #f3f3f4; cursor: pointer; }
.cerrar:hover { background: #e9e9eb; }
.cerrar svg { width: 14px; height: 14px; }
.negocio { margin: 0; font-size: 12px; font-weight: 800; letter-spacing: .16em; text-transform: uppercase; color: rgba(11, 11, 12, .55); text-align: center; overflow-wrap: break-word; }
.orden { margin: 6px 0 0; font-size: 14px; font-weight: 600; color: rgba(11, 11, 12, .62); text-align: center; }
.total { margin: 10px 0 0; text-align: center; font-size: 40px; font-weight: 800; letter-spacing: -.02em; line-height: 1.05; font-variant-numeric: tabular-nums; }
.total small { font-size: 17px; font-weight: 800; letter-spacing: 0; margin-left: 6px; }
.productos { display: block; margin: 6px auto 0; padding: 4px 8px; border: 0; background: none; font-size: 14px; font-weight: 600; color: rgba(11, 11, 12, .58); cursor: pointer; text-decoration: underline; text-decoration-color: rgba(11, 11, 12, .22); text-underline-offset: 3px; }
.detalle { margin: 12px 0 0; padding: 6px 14px; max-height: 190px; overflow-y: auto; overscroll-behavior: contain; border-radius: 16px; background: #f6f6f7; }
.linea { display: flex; justify-content: space-between; gap: 12px; padding: 8px 0; font-size: 14px; }
.linea + .linea { border-top: 1px solid rgba(11, 11, 12, .07); }
.linea span:first-child { min-width: 0; overflow-wrap: break-word; }
.linea span:last-child { flex: none; font-variant-numeric: tabular-nums; font-weight: 600; }
.qr { position: relative; display: grid; place-items: center; width: 212px; height: 212px; margin: 18px auto 0; padding: 12px; border: 1px solid rgba(11, 11, 12, .08); border-radius: 24px; background: #fff; box-shadow: 0 10px 30px rgba(11, 11, 12, .06); }
.qr canvas { width: 186px; height: 186px; image-rendering: pixelated; }
.qr p { margin: 0; font-size: 13px; color: rgba(11, 11, 12, .5); text-align: center; }
.indicacion { margin: 12px 0 0; font-size: 14px; line-height: 1.45; color: rgba(11, 11, 12, .62); text-align: center; }
.principal { display: flex; align-items: center; justify-content: center; width: 100%; min-height: 54px; margin-top: 18px; padding: 0 20px; border: 0; border-radius: 999px; background: ${TINTA}; color: #fff; font-size: 16px; font-weight: 700; cursor: pointer; transition: transform .12s ease, opacity .12s ease; }
.principal:active { transform: scale(.985); }
.principal[disabled] { opacity: .45; cursor: default; }
.enlace { display: block; margin: 12px auto 0; padding: 6px 10px; border: 0; background: none; font-size: 14px; font-weight: 700; color: rgba(11, 11, 12, .66); cursor: pointer; }
.enlace:hover { color: ${TINTA}; }
.pie { margin: 16px 0 0; padding-top: 14px; border-top: 1px solid rgba(11, 11, 12, .07); font-size: 12.5px; color: rgba(11, 11, 12, .5); text-align: center; }
.pie a { color: inherit; font-weight: 700; }
.titulo { margin: 4px 0 0; font-size: 21px; font-weight: 800; letter-spacing: -.01em; text-align: center; }
.campo { display: block; width: 100%; margin-top: 18px; padding: 15px 16px; border: 1.5px solid rgba(11, 11, 12, .14); border-radius: 16px; background: #fbfbfb; font: 500 14.5px ${MONO}; color: ${TINTA}; outline: none; }
.campo:focus { border-color: ${TINTA}; background: #fff; }
.error { margin: 10px 0 0; font-size: 13.5px; line-height: 1.4; font-weight: 600; color: #c4231b; text-align: center; }
.estado { margin: 18px 0 0; text-align: center; }
.estado b { display: block; font-size: 17px; font-weight: 800; }
.estado > span { display: block; margin-top: 6px; font-size: 14px; line-height: 1.45; color: rgba(11, 11, 12, .62); }
.mono { font-family: ${MONO}; font-weight: 600; }
.espera { display: block; width: 28px; height: 28px; margin: 22px auto 0; border: 2.5px solid rgba(11, 11, 12, .1); border-top-color: ${TINTA}; border-radius: 50%; animation: girar .9s linear infinite; }
@keyframes girar { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .espera { animation-duration: 2.4s; } }
.listo { display: grid; place-items: center; width: 64px; height: 64px; margin: 8px auto 0; border-radius: 50%; background: ${VERDE}; color: #fff; }
.listo svg { width: 30px; height: 30px; }
.referencia { display: block; width: 100%; margin-top: 16px; padding: 12px 14px; border: 0; border-radius: 14px; background: #f6f6f7; text-align: center; cursor: pointer; }
.referencia small { display: block; font-size: 11.5px; font-weight: 800; letter-spacing: .12em; text-transform: uppercase; color: rgba(11, 11, 12, .5); }
.referencia span { display: block; margin-top: 4px; font: 600 14px ${MONO}; }
.demo { margin: 0 0 14px; padding: 8px 12px; border-radius: 12px; background: #fff6dc; color: #8a5a00; font-size: 12.5px; font-weight: 700; text-align: center; }
`;

const CSS_BOTON = `
:host { display: inline-block; vertical-align: middle; }
:host([ancho="completo"]) { display: block; }
button { display: inline-flex; align-items: center; justify-content: center; gap: 10px; width: 100%; min-height: 52px; padding: 0 24px; border: 0; border-radius: 999px; background: ${TINTA}; color: #fff; font: 700 16px ${FUENTE}; letter-spacing: .005em; cursor: pointer; -webkit-font-smoothing: antialiased; transition: transform .12s ease, box-shadow .12s ease; box-shadow: 0 6px 18px rgba(11, 11, 12, .18); }
button:hover { box-shadow: 0 8px 24px rgba(11, 11, 12, .24); }
button:active { transform: scale(.985); }
button:focus-visible { outline: 3px solid rgba(11, 11, 12, .35); outline-offset: 3px; }
button[disabled] { opacity: .45; cursor: not-allowed; box-shadow: none; }
:host([tema="claro"]) button { background: #fff; color: ${TINTA}; box-shadow: inset 0 0 0 1.5px ${TINTA}; }
svg { width: 20px; height: 20px; flex: none; }
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
  ctx.arc(cx, cy + 0.6 * escala, 8.6 * escala, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy + 0.6 * escala, 3.5 * escala, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx, cy - 8 * escala, 2.1 * escala, 0, Math.PI * 2);
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
      el("span", { class: "sello" }, svg(MARCA_SVG), "Pagar con SERO"),
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
        el("div", { class: "qr" }, lienzo || el("p", { texto: "Preparando el QR" })),
        el("p", { class: "indicacion", texto: "Escanéalo con SERO desde «Pagos y envíos»." }),
        el("button", { class: "principal", type: "button", texto: "Enviar el cobro a mi billetera", onclick: () => { estado.pantalla = "direccion"; estado.error = ""; pintar(); } }),
        el("button", { class: "enlace", type: "button", texto: "Descargar el QR", disabled: !estado.enlace, onclick: () => void descargarImagen(orden, estado.enlace) }),
        el("p", { class: "pie" }, "¿Aún no tienes SERO? ", el("a", { href: "https://sero.foundation", target: "_blank", rel: "noopener", texto: "Actívalo en sero.foundation" })),
      ],
      direccion: () => {
        const campo = el("input", {
          class: "campo", type: "text", inputmode: "text", autocomplete: "off", autocapitalize: "off", spellcheck: "false",
          placeholder: "0x…", value: estado.destino, "aria-label": "Tu dirección SERO",
          oninput: (e) => { estado.destino = e.target.value.trim(); },
          onkeydown: (e) => { if (e.key === "Enter") enviar(); },
        });
        queueMicrotask(() => campo.focus());
        return [
          el("p", { class: "titulo", id: titulo, texto: "Enviar el cobro a tu billetera" }),
          el("p", { class: "indicacion", texto: "Te llegará una notificación para revisar y pagar desde SERO. Tu dirección está en «Recibir fondos»." }),
          campo,
          estado.error ? el("p", { class: "error", role: "alert", texto: estado.error }) : null,
          el("button", { class: "principal", type: "button", disabled: estado.enviando, texto: estado.enviando ? "Enviando" : "Enviar cobro", onclick: enviar }),
          el("button", { class: "enlace", type: "button", texto: "Volver", onclick: () => { estado.pantalla = "inicio"; pintar(); } }),
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
      const destino = String(estado.destino || "").trim();
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
      }, true);
      if (demostracion && !evento.defaultPrevented) setTimeout(() => simularPago(destino), 6000);
      if (!demostracion) vigilarCobro();
    }

    function simularPago(destino) {
      if (resuelto || !anfitrion.isConnected) return;
      const azar = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, "0")).join("");
      alPagar(Object.freeze({ referencia: `0x${azar}`, pagador: destino.toLowerCase(), destino: orden.direccion, monto: orden.total, bloque: 0, orden: orden.id, numero: orden.numero, huella: orden.huella, demostracion: true, ...(orden.suscripcion ? { suscripcion: orden.suscripcion } : {}) }));
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
      lienzo = lienzoQr(enlace, 186);
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

/** Primer pago (o el de un periodo) de una suscripción mensual. El recibo trae `pagador`: guárdalo para los cobros siguientes. */
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
      this._boton.lastChild.textContent = this.getAttribute("etiqueta") || (suscripcion ? "Suscribirme con SERO" : "Pagar con SERO");
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

definirBoton();
window.SeroPay = Object.freeze({ VERSION, ErrorSero, crearOrden, ordenDeSuscripcion, huellaDeToken, enlaceLargo, enlaceCorto, enviarCobro, cancelarCobro, estadoDelCobro, consultarPago, esperarPago, verificarReferencia, periodoActual, periodoLegible, direccionCorta, keccak256, qrMatriz, qrSvg, pagar, suscribir });
window.dispatchEvent(new CustomEvent("sero:listo", { detail: { version: VERSION } }));
})();
