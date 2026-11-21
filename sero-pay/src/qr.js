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

export function qrMatriz(texto, nivelDeseado = "M") {
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
export function qrSvg(texto, { nivel = "M", margen = 4, oscuro = "#0b0b0c", claro = "#ffffff" } = {}) {
  const matriz = qrMatriz(texto, nivel);
  const lado = matriz.length + margen * 2;
  let trazo = "";
  matriz.forEach((fila, y) => {
    fila.forEach((m, x) => { if (m) trazo += `M${x + margen},${y + margen}h1v1h-1z`; });
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lado} ${lado}" shape-rendering="crispEdges"><rect width="100%" height="100%" fill="${claro}"/><path d="${trazo}" fill="${oscuro}"/></svg>`;
}
