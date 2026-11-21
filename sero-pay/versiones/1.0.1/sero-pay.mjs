/*!
 * SERO Pay 1.0.1 (módulo ES)
 * Cobros en USDT con SERO para cualquier web: órdenes, cobro por notificación, QR y
 * verificación del pago en la red. Sin claves, sin cuentas y sin dependencias.
 * Documentación: https://web.sero.foundation/pagar-con-sero/
 * Licencia MIT. Copyright (c) 2026 Ostermann Laboratories.
 */
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

export { VERSION, ErrorSero, crearOrden, ordenDeSuscripcion, huellaDeToken, enlaceLargo, enlaceCorto, enviarCobro, cancelarCobro, estadoDelCobro, consultarPago, esperarPago, verificarReferencia, periodoActual, periodoLegible, direccionCorta, keccak256, qrMatriz, qrSvg };
