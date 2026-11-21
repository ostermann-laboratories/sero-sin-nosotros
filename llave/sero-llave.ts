// SERO: tu llave, sin nosotros.
// La derivación de llaves de las billeteras SERO, en código abierto.
//
// Copyright (c) 2026 Ostermann Laboratories S.à r.l. Licencia MIT (ver LICENSE.txt).
//
// Este archivo no se escribe a mano. Se extrae del mismo código que corre dentro de la
// billetera y, antes de publicarse, se comprueba contra direcciones de prueba fijas
// (vectores.json). Con él, cualquiera puede reconstruir su llave privada sin SERO, sin
// internet y sin pedirle permiso a nadie.
//
// Nada de lo que escribas aquí sale de tu dispositivo.


import { mnemonicToSeedSync, validateMnemonic } from "@scure/bip39";
import { wordlist as spanishWordlist } from "@scure/bip39/wordlists/spanish";
import { secp256k1 } from "@noble/curves/secp256k1";
import QRCode from "qrcode";



type IdentifierType = "cedula" | "matricula";
type CulturalSecretMaterial = { slot: 1 | 2; book: number; m: number; n: number };
type CulturalDerivationMaterial = {
  v: "SERO_FLASH_DERIVATION_V1";
  network: "BSC";
  curve: "secp256k1";
  security: "standard" | "advanced";
  identifier: { type: IdentifierType; value: string };
  avatar: { id: number };
  secrets: CulturalSecretMaterial[];
};
type ReactivationSecretData = { book: number | null; range: string };


// ─── Curva, keccak256 y estiramiento (de src/seroCrypto.ts) ──────────────────


const P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
const N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
const GX = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
const GY = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;
const MASK_64 = (1n << 64n) - 1n;

type Point = { x: bigint; y: bigint } | null;

function mod(value: bigint, modulo = P) {
  const result = value % modulo;
  return result >= 0n ? result : result + modulo;
}

function invert(number: bigint, modulo = P) {
  if (number === 0n) throw new Error("Division by zero");
  let a = mod(number, modulo);
  let b = modulo;
  let x = 0n;
  let y = 1n;
  let u = 1n;
  let v = 0n;

  while (a !== 0n) {
    const quotient = b / a;
    const remainder = b % a;
    const nextX = x - u * quotient;
    const nextY = y - v * quotient;
    b = a;
    a = remainder;
    x = u;
    y = v;
    u = nextX;
    v = nextY;
  }

  if (b !== 1n) throw new Error("Inverse does not exist");
  return mod(x, modulo);
}

function pointDouble(point: Point): Point {
  if (!point) return null;
  if (point.y === 0n) return null;
  const slope = mod(3n * point.x * point.x * invert(2n * point.y));
  const x = mod(slope * slope - 2n * point.x);
  const y = mod(slope * (point.x - x) - point.y);
  return { x, y };
}

function pointAdd(a: Point, b: Point): Point {
  if (!a) return b;
  if (!b) return a;
  if (a.x === b.x) {
    if (mod(a.y + b.y) === 0n) return null;
    return pointDouble(a);
  }
  const slope = mod((b.y - a.y) * invert(b.x - a.x));
  const x = mod(slope * slope - a.x - b.x);
  const y = mod(slope * (a.x - x) - a.y);
  return { x, y };
}

function multiplyBase(scalar: bigint): Point {
  let n = mod(scalar, N);
  if (n === 0n) return null;
  let result: Point = null;
  let addend: Point = { x: GX, y: GY };

  while (n > 0n) {
    if (n & 1n) result = pointAdd(result, addend);
    addend = pointDouble(addend);
    n >>= 1n;
  }

  return result;
}

function bytesToBigInt(bytes: Uint8Array) {
  let result = 0n;
  for (const byte of bytes) result = (result << 8n) + BigInt(byte);
  return result;
}

function bigIntToBytes(value: bigint, length = 32) {
  const output = new Uint8Array(length);
  let current = value;
  for (let index = length - 1; index >= 0; index -= 1) {
    output[index] = Number(current & 0xffn);
    current >>= 8n;
  }
  return output;
}

export function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function isValidPrivateKey(privateKey: Uint8Array) {
  if (privateKey.length !== 32) return false;
  const value = bytesToBigInt(privateKey);
  return value > 0n && value < N;
}

function uncompressedPublicKey(privateKey: Uint8Array) {
  if (!isValidPrivateKey(privateKey)) throw new Error("Invalid private key");
  const point = multiplyBase(bytesToBigInt(privateKey));
  if (!point) throw new Error("Invalid public key");
  const output = new Uint8Array(65);
  output[0] = 4;
  output.set(bigIntToBytes(point.x), 1);
  output.set(bigIntToBytes(point.y), 33);
  return output;
}

function rotl64(value: bigint, shift: number) {
  const amount = BigInt(shift % 64);
  if (amount === 0n) return value & MASK_64;
  return ((value << amount) | (value >> (64n - amount))) & MASK_64;
}

const KECCAK_ROTATION = [
  0, 1, 62, 28, 27,
  36, 44, 6, 55, 20,
  3, 10, 43, 25, 39,
  41, 45, 15, 21, 8,
  18, 2, 61, 56, 14,
];

const KECCAK_ROUND_CONSTANTS = [
  0x0000000000000001n, 0x0000000000008082n, 0x800000000000808an,
  0x8000000080008000n, 0x000000000000808bn, 0x0000000080000001n,
  0x8000000080008081n, 0x8000000000008009n, 0x000000000000008an,
  0x0000000000000088n, 0x0000000080008009n, 0x000000008000000an,
  0x000000008000808bn, 0x800000000000008bn, 0x8000000000008089n,
  0x8000000000008003n, 0x8000000000008002n, 0x8000000000000080n,
  0x000000000000800an, 0x800000008000000an, 0x8000000080008081n,
  0x8000000000008080n, 0x0000000080000001n, 0x8000000080008008n,
];

function keccakF1600(state: bigint[]) {
  for (const rc of KECCAK_ROUND_CONSTANTS) {
    const c = new Array<bigint>(5);
    const d = new Array<bigint>(5);
    const b = new Array<bigint>(25).fill(0n);

    for (let x = 0; x < 5; x += 1) {
      c[x] = state[x] ^ state[x + 5] ^ state[x + 10] ^ state[x + 15] ^ state[x + 20];
    }
    for (let x = 0; x < 5; x += 1) {
      d[x] = c[(x + 4) % 5] ^ rotl64(c[(x + 1) % 5], 1);
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] = (state[x + 5 * y] ^ d[x]) & MASK_64;
      }
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        b[y + 5 * ((2 * x + 3 * y) % 5)] = rotl64(state[x + 5 * y], KECCAK_ROTATION[x + 5 * y]);
      }
    }
    for (let x = 0; x < 5; x += 1) {
      for (let y = 0; y < 5; y += 1) {
        state[x + 5 * y] = (b[x + 5 * y] ^ ((~b[((x + 1) % 5) + 5 * y]) & b[((x + 2) % 5) + 5 * y])) & MASK_64;
      }
    }
    state[0] = (state[0] ^ rc) & MASK_64;
  }
}

function readLaneLE(bytes: Uint8Array, offset: number) {
  let lane = 0n;
  for (let index = 0; index < 8; index += 1) {
    lane |= BigInt(bytes[offset + index] ?? 0) << BigInt(8 * index);
  }
  return lane;
}

function writeLaneLE(value: bigint, output: Uint8Array, offset: number) {
  for (let index = 0; index < 8; index += 1) {
    output[offset + index] = Number((value >> BigInt(8 * index)) & 0xffn);
  }
}

export function keccak256(input: Uint8Array) {
  const rate = 136;
  const state = new Array<bigint>(25).fill(0n);
  let offset = 0;

  while (offset + rate <= input.length) {
    for (let index = 0; index < rate / 8; index += 1) {
      state[index] ^= readLaneLE(input, offset + index * 8);
    }
    keccakF1600(state);
    offset += rate;
  }

  const block = new Uint8Array(rate);
  block.set(input.slice(offset));
  block[input.length - offset] ^= 0x01;
  block[rate - 1] ^= 0x80;

  for (let index = 0; index < rate / 8; index += 1) {
    state[index] ^= readLaneLE(block, index * 8);
  }
  keccakF1600(state);

  const output = new Uint8Array(32);
  let outOffset = 0;
  for (let index = 0; outOffset < output.length; index += 1) {
    const lane = new Uint8Array(8);
    writeLaneLE(state[index], lane, 0);
    output.set(lane.slice(0, Math.min(8, output.length - outOffset)), outOffset);
    outOffset += 8;
  }
  return output;
}

function toChecksumAddress(rawAddressHex: string) {
  const clean = rawAddressHex.toLowerCase().replace(/^0x/, "");
  const hash = bytesToHex(keccak256(new TextEncoder().encode(clean)));
  let result = "0x";
  for (let index = 0; index < clean.length; index += 1) {
    result += Number.parseInt(hash[index] ?? "0", 16) >= 8 ? clean[index].toUpperCase() : clean[index];
  }
  return result;
}

const CULTURAL_KDF_SALT = new TextEncoder().encode("SERO_FLASH_CULTURAL_BSC_KDF_V2");

const toBuffer = (b: Uint8Array): ArrayBuffer => b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;

// Default salt/iterations reproduce the original V2 derivation byte-for-byte,
// so existing wallets keep resolving to the same address. Callers that pass an
// explicit per-user salt / iteration count opt into the hardened V3 derivation.
export async function stretchCulturalSeed(
  seed: Uint8Array,
  salt: Uint8Array = CULTURAL_KDF_SALT,
  iterations = 200_000,
): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", toBuffer(seed), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", salt: toBuffer(salt), iterations },
    key,
    256,
  );
  return new Uint8Array(bits);
}

// V4 cultural derivation: Argon2id (RFC 9106). Memory-hard, so guessing human-chosen
// passages on GPUs/ASICs costs orders of magnitude more than with PBKDF2.
// Changing any of these values changes every V4 address — never edit them.
export const CULTURAL_ARGON2ID_V4 = { memoryKiB: 65_536, iterations: 3, parallelism: 1, hashLength: 32 } as const;

// Loaded on demand (activation only), so the app's startup bundle is unchanged.
// hash-wasm (WebAssembly) is ~10x faster; @noble/hashes is the pure-JS fallback for
// devices where WebAssembly is unavailable. Both produce byte-identical output.
export async function argon2idStretch(password: Uint8Array, salt: Uint8Array): Promise<Uint8Array> {
  const { memoryKiB, iterations, parallelism, hashLength } = CULTURAL_ARGON2ID_V4;
  try {
    const { argon2id } = await import("hash-wasm");
    return await argon2id({ password, salt, memorySize: memoryKiB, iterations, parallelism, hashLength, outputType: "binary" });
  } catch {
    const { argon2idAsync } = await import("@noble/hashes/argon2");
    return argon2idAsync(password, salt, { m: memoryKiB, t: iterations, p: parallelism, dkLen: hashLength });
  }
}

export function privateKeyToAddress(privateKey: Uint8Array) {
  const publicKey = uncompressedPublicKey(privateKey).slice(1);
  const hash = keccak256(publicKey);
  return toChecksumAddress(`0x${bytesToHex(hash.slice(-20))}`);
}



// ─── Derivación (de src/App.tsx) ─────────────────────────────────────────────


function utf8Bytes(value: string) {
return new TextEncoder().encode(value);
}

function concatBytes(...chunks: Uint8Array[]) {
const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
const output = new Uint8Array(length);
let offset = 0;
for (const chunk of chunks) {
  output.set(chunk, offset);
  offset += chunk.length;
}
return output;
}

function canonicalStringify(value: unknown): string {
if (Array.isArray(value)) return `[${value.map(canonicalStringify).join(",")}]`;
if (value && typeof value === "object") {
  const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b));
  return `{${entries.map(([key, entry]) => `${JSON.stringify(key)}:${canonicalStringify(entry)}`).join(",")}}`;
}
return JSON.stringify(value);
}

function deriveCandidate(seed: Uint8Array, label: string, round: number) {
return keccak256(concatBytes(seed, utf8Bytes(`:${label}:${round}`)));
}

function derivePrivateKeyFromBytes(seed: Uint8Array, label: string) {
for (let round = 0; round < 1024; round += 1) {
  const candidate = deriveCandidate(seed, label, round);
  if (isValidPrivateKey(candidate)) return candidate;
}
throw new Error("No se pudo derivar una clave BSC válida");
}

const CULTURAL_KDF_V4_NAMESPACE = "SERO_FLASH_CULTURAL_BSC_KDF_V4";

const CULTURAL_KDF_V3_NAMESPACE = "SERO_FLASH_CULTURAL_BSC_KDF_V3";

const CULTURAL_KDF_V3_ITERATIONS = 600_000;

function deriveCulturalSalt(namespace: string, material: CulturalDerivationMaterial): Uint8Array {
const saltSource = [
  namespace,
  material.network,
  material.security,
  `avatar:${material.avatar.id}`,
  `id:${material.identifier.type}:${material.identifier.value}`,
].join("|");
return keccak256(utf8Bytes(saltSource));
}

async function derivePrivateKeyFromMaterialV4(material: CulturalDerivationMaterial) {
const canonical = canonicalStringify(material);
const stretched = await argon2idStretch(utf8Bytes(canonical), deriveCulturalSalt(CULTURAL_KDF_V4_NAMESPACE, material));
try {
  return derivePrivateKeyFromBytes(stretched, "SERO_FLASH_CULTURAL_BSC_EOA_V4");
} finally {
  stretched.fill(0);
}
}

async function derivePrivateKeyFromMaterialV3(material: CulturalDerivationMaterial) {
const canonical = canonicalStringify(material);
const salt = deriveCulturalSalt(CULTURAL_KDF_V3_NAMESPACE, material);
const stretched = await stretchCulturalSeed(utf8Bytes(canonical), salt, CULTURAL_KDF_V3_ITERATIONS);
return derivePrivateKeyFromBytes(stretched, "SERO_FLASH_CULTURAL_BSC_EOA_V3");
}

async function derivePrivateKeyFromMaterialV2(material: CulturalDerivationMaterial) {
const canonical = canonicalStringify(material);
const stretched = await stretchCulturalSeed(utf8Bytes(canonical));
return derivePrivateKeyFromBytes(stretched, "SERO_FLASH_CULTURAL_BSC_EOA_V2");
}

function derivePrivateKeyFromWords(words: string[]) {
const phrase = words.join(" ").trim().toLocaleLowerCase("es");
const seed = mnemonicToSeedSync(phrase);
return derivePrivateKeyFromBytes(seed, "SERO_FLASH_MAXIMUM_BSC_EOA_V1");
}

const RANGE_DIGIT_MAX = 7;

function normalizeRangeNumber(value: string) {
return value.replace(/\D/g, "").slice(0, RANGE_DIGIT_MAX);
}

function splitRangeText(value: string) {
const [left = "", right = ""] = value.split("-");
return {
  left: normalizeRangeNumber(left),
  right: normalizeRangeNumber(right),
};
}

function parseRangeText(value: string) {
const { left, right } = splitRangeText(value);
const m = Number(left);
const n = Number(right);
if (!left || !right || !Number.isInteger(m) || !Number.isInteger(n)) return null;
if (m <= 0 || n < m) return null;
return { m, n, label: `${m}-${n}` };
}

function secretMaterialFromManual(secret: ReactivationSecretData, slot: 1 | 2): CulturalSecretMaterial {
const range = parseRangeText(secret.range);
if (!secret.book || !range) throw new Error("Falta un secreto SERO");
return {
  slot,
  book: secret.book,
  m: range.m,
  n: range.n,
};
}

const CEDULA_MAX_DIGITS = 10;

function stripCedulaDigits(value: string) {
return value.replace(/\D/g, "").slice(0, CEDULA_MAX_DIGITS);
}

const MATRICULA_MAX_LENGTH = 12;

function normalizeMatricula(value: string) {
return value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toUpperCase()
  .replace(/[^A-Z0-9-]/g, "")
  .replace(/-{2,}/g, "-")
  .slice(0, MATRICULA_MAX_LENGTH);
}

function normalizeIdentifierValue(type: IdentifierType, value: string) {
return type === "cedula" ? stripCedulaDigits(value) : normalizeMatricula(value);
}


// ─── Bolsillos (de src/sero/bolsillos.ts) ────────────────────────────────────


// Bolsillos ocultos de SERO (v1). Matemática pura, sin red: la usa la billetera y la verifica
// scripts/verificar-bolsillos.mjs contra una implementación independiente y vectores fijos.
//
// Modelo: el usuario ve y comparte una sola dirección (la «puerta»: su dirección de siempre).
// El dinero vive en bolsillos que nadie asocia con esa puerta:
//   · bolsillos de recarga, derivados en orden (0, 1, 2…) desde la llave de la billetera;
//   · bolsillos de cobro, que calcula quien paga a partir del código de cobro (S, V) de quien cobra.
// Quien cobra reconoce sus bolsillos leyendo los eventos PaymentExecuted del contrato: la clave
// efímera viaja como x(E) en el clientTxId (32 bytes, siempre con y par), igual de aleatoria que hoy.
//
// Todo deriva de la llave privada que la billetera ya tiene (cualquier nivel): nada nuevo que anotar.
// CAMBIAR UNA ETIQUETA O UN PASO CAMBIA TODOS LOS BOLSILLOS: no se edita jamás tras publicarse.

const ORDEN_N = secp256k1.CURVE.n;
const G = secp256k1.ProjectivePoint.BASE;
type Punto = InstanceType<typeof secp256k1.ProjectivePoint>;

const ETIQUETA_GASTO = "SERO_BOLSILLO_GASTO_V1";
const ETIQUETA_VER = "SERO_BOLSILLO_VER_V1";
const ETIQUETA_RECARGA = "SERO_BOLSILLO_RECARGA_V1_";
const ETIQUETA_SECRETO = "SERO_BOLSILLO_SECRETO_V1";

const utf8 = (texto: string) => new TextEncoder().encode(texto);
const hex = (b: Uint8Array) => Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
const deHex = (h: string) => {
  const limpio = h.startsWith("0x") ? h.slice(2) : h;
  if (!/^[0-9a-fA-F]*$/.test(limpio) || limpio.length % 2) throw new Error("hex_invalido");
  return Uint8Array.from(limpio.match(/../g) ?? [], (p) => parseInt(p, 16));
};
const aEscalar = (b: Uint8Array) => BigInt(`0x${hex(b) || "0"}`);
const a32 = (n: bigint) => deHex(n.toString(16).padStart(64, "0"));
const unir = (...partes: Uint8Array[]) => {
  const salida = new Uint8Array(partes.reduce((t, p) => t + p.length, 0));
  let i = 0;
  for (const p of partes) { salida.set(p, i); i += p.length; }
  return salida;
};
const escalarValido = (k: bigint) => k > 0n && k < ORDEN_N;

// La misma regla que la billetera usa para su llave (sección 1 de la especificación pública):
// keccak256(semilla || ":" + etiqueta + ":" + ronda) hasta que 0 < k < n.
function derivarLlave(semilla: Uint8Array, etiqueta: string): Uint8Array {
  for (let ronda = 0; ronda < 1024; ronda += 1) {
    const candidato = keccak256(unir(semilla, utf8(`:${etiqueta}:${ronda}`)));
    if (escalarValido(aEscalar(candidato))) return candidato;
  }
  throw new Error("derivacion_imposible");
}

type LlavesDeBolsillos = { gasto: Uint8Array; ver: Uint8Array; codigo: CodigoDeCobro };
type CodigoDeCobro = { S: string; V: string }; // claves públicas comprimidas, hex sin 0x

function llavesDeBolsillos(llaveBilletera: Uint8Array): LlavesDeBolsillos {
  const gasto = derivarLlave(llaveBilletera, ETIQUETA_GASTO);
  const ver = derivarLlave(llaveBilletera, ETIQUETA_VER);
  return {
    gasto,
    ver,
    codigo: {
      S: hex(G.multiply(aEscalar(gasto)).toRawBytes(true)),
      V: hex(G.multiply(aEscalar(ver)).toRawBytes(true)),
    },
  };
}

function bolsilloDeRecarga(llaveBilletera: Uint8Array, indice: number) {
  if (!Number.isInteger(indice) || indice < 0) throw new Error("indice_invalido");
  const llave = derivarLlave(llaveBilletera, `${ETIQUETA_RECARGA}${indice}`);
  return { indice, llave, direccion: privateKeyToAddress(llave) };
}

function secretoCompartido(Z: Punto): bigint {
  return aEscalar(keccak256(unir(utf8(ETIQUETA_SECRETO), Z.toRawBytes(true)))) % ORDEN_N;
}

function direccionDePunto(P: Punto): string {
  // Dirección EVM de una clave pública: keccak256(X || Y)[12:], con mayúsculas EIP-55 vía seroCrypto.
  const crudo = P.toRawBytes(false).slice(1);
  const h = hex(keccak256(crudo)).slice(24);
  return checksum(h);
}

function checksum(direccionHex: string): string {
  const minus = direccionHex.toLowerCase();
  const h = hex(keccak256(utf8(minus)));
  let salida = "0x";
  for (let i = 0; i < 40; i += 1) salida += parseInt(h[i], 16) >= 8 ? minus[i].toUpperCase() : minus[i];
  return salida;
}

function puntoDeCodigo(clave: string): Punto {
  const P = secp256k1.ProjectivePoint.fromHex(clave);
  P.assertValidity();
  return P;
}

// Quien paga: calcula el bolsillo de cobro de quien cobra. `efimera` solo para pruebas;
// en la billetera se omite y se usa azar criptográfico.
function bolsilloParaPagar(codigo: CodigoDeCobro, efimera?: Uint8Array) {
  const S = puntoDeCodigo(codigo.S);
  const V = puntoDeCodigo(codigo.V);
  for (let intento = 0; intento < 64; intento += 1) {
    let e = aEscalar(efimera && intento === 0 ? efimera : secp256k1.utils.randomPrivateKey());
    if (!escalarValido(e)) { if (efimera) throw new Error("efimera_invalida"); continue; }
    let E = G.multiply(e);
    const negada = E.toAffine().y % 2n === 1n;
    if (negada) { e = ORDEN_N - e; E = E.negate(); }
    const h = secretoCompartido(V.multiply(e));
    if (h === 0n) { if (efimera) throw new Error("secreto_nulo"); continue; }
    const P = S.add(G.multiply(h));
    if (P.equals(secp256k1.ProjectivePoint.ZERO)) { if (efimera) throw new Error("punto_nulo"); continue; }
    return { direccion: direccionDePunto(P), clientTxId: `0x${hex(a32(E.toAffine().x))}`, negada };
  }
  throw new Error("sin_efimera_valida");
}

function puntoEfimero(clientTxId: string): Punto | null {
  try {
    const x = deHex(clientTxId);
    if (x.length !== 32) return null;
    const E = secp256k1.ProjectivePoint.fromHex(unir(Uint8Array.of(2), x));
    E.assertValidity();
    return E;
  } catch {
    return null; // la mayoría de los clientTxId aleatorios no son un punto: no es un pago oculto
  }
}

// Quien cobra: ¿este pago (clientTxId, destinatario) cayó en un bolsillo mío? Devuelve su llave o null.
function reconocerBolsillo(llaves: Pick<LlavesDeBolsillos, "gasto" | "ver">, clientTxId: string, destinatario: string): Uint8Array | null {
  const E = puntoEfimero(clientTxId);
  if (!E) return null;
  const h = secretoCompartido(E.multiply(aEscalar(llaves.ver)));
  if (h === 0n) return null;
  const p = (aEscalar(llaves.gasto) + h) % ORDEN_N;
  if (!escalarValido(p)) return null;
  const llave = a32(p);
  return privateKeyToAddress(llave).toLowerCase() === destinatario.toLowerCase() ? llave : null;
}

// Lo mismo sin la llave de gasto: con S y la llave de ver basta para saber que el bolsillo es de
// esa puerta (lo usan el worker, para avisar, y la billetera antes de Face ID). No permite gastar.
function reconocerConCodigo(S: string, ver: Uint8Array, clientTxId: string, destinatario: string): boolean {
  const E = puntoEfimero(clientTxId);
  if (!E) return false;
  const h = secretoCompartido(E.multiply(aEscalar(ver)));
  if (h === 0n) return false;
  let P: Punto;
  try {
    P = puntoDeCodigo(S).add(G.multiply(h));
  } catch {
    return false;
  }
  if (P.equals(secp256k1.ProjectivePoint.ZERO)) return false;
  return direccionDePunto(P).toLowerCase() === destinatario.toLowerCase();
}

function codigoValido(codigo: CodigoDeCobro): boolean {
  try {
    if (!/^0[23][0-9a-f]{64}$/.test(codigo.S) || !/^0[23][0-9a-f]{64}$/.test(codigo.V)) return false;
    puntoDeCodigo(codigo.S);
    puntoDeCodigo(codigo.V);
    return true;
  } catch {
    return false;
  }
}

// ¿Esta llave de ver es la de ese V? (el worker no acepta una llave de ver ajena al código)
function verCorresponde(ver: Uint8Array, V: string): boolean {
  const k = aEscalar(ver);
  return escalarValido(k) && hex(G.multiply(k).toRawBytes(true)) === V;
}

// Prueba de que quien consulta sus cobros tiene la llave de ver, sin enviarla en cada consulta.
const ETIQUETA_CONSULTA = "SERO_BOLSILLO_CONSULTA_V1";
function llaveDeConsulta(ver: Uint8Array): string {
  return hex(keccak256(unir(utf8(ETIQUETA_CONSULTA), ver)));
}

// ── Firmas de mensajes (EIP-191, idénticas a personal_sign) ──
// El registro del código lo firma la puerta: quien paga comprueba la firma en su teléfono, así
// que ni un servidor comprometido puede cambiar a dónde llega un pago.
function mensajeDeRegistro(puerta: string, codigo: CodigoDeCobro): string {
  return `SERO codigo de cobro v1\npuerta: ${puerta.toLowerCase()}\nS: ${codigo.S}\nV: ${codigo.V}`;
}

// El aviso de quien paga («te pagó esta puerta») lo firman su puerta y el bolsillo que pagó.
function mensajeDeAviso(puerta: string, clientTxId: string): string {
  return `SERO aviso de pago v1\npuerta: ${puerta.toLowerCase()}\nreferencia: ${clientTxId.toLowerCase()}`;
}

function hashDeMensaje(mensaje: string): Uint8Array {
  const m = utf8(mensaje);
  return keccak256(unir(utf8(`\x19Ethereum Signed Message:\n${m.length}`), m));
}

// El vendedor pide sus ventas con orden (BI de SERO Pay) firmando esto con su puerta (el worker lo verifica).
function mensajeDeVentas(puerta: string, ts: number): string {
  return `SERO ventas con orden v1
puerta: ${puerta.toLowerCase()}
ts: ${ts}`;
}

function firmarMensaje(llave: Uint8Array, mensaje: string): string {
  const firma = secp256k1.sign(hashDeMensaje(mensaje), llave);
  return `0x${hex(firma.toCompactRawBytes())}${(27 + firma.recovery).toString(16)}`;
}

function firmanteDe(mensaje: string, firma: string): string | null {
  try {
    const b = deHex(firma);
    if (b.length !== 65) return null;
    const rec = b[64] >= 27 ? b[64] - 27 : b[64];
    if (rec !== 0 && rec !== 1) return null;
    const s = secp256k1.Signature.fromCompact(b.slice(0, 64)).addRecoveryBit(rec);
    if (s.hasHighS()) return null;
    return direccionDePunto(s.recoverPublicKey(hashDeMensaje(mensaje)));
  } catch {
    return null;
  }
}




// ─── Interfaz pública ────────────────────────────────────────────────────────

export const AVATARES = [{"id":1,"nombre":"Tonina del Orinoco"},{"id":2,"nombre":"Caimán del Orinoco"},{"id":3,"nombre":"Turpial"},{"id":4,"nombre":"Jaguar"},{"id":5,"nombre":"Manatí caribeño"},{"id":6,"nombre":"Iguana"},{"id":7,"nombre":"Guacamaya"},{"id":8,"nombre":"Chigüire"},{"id":9,"nombre":"Rana tropical"},{"id":10,"nombre":"Oso frontino"},{"id":11,"nombre":"Tortuga Carey"},{"id":12,"nombre":"Pereza"},{"id":13,"nombre":"Cachicamo"},{"id":14,"nombre":"Oso palmero"},{"id":15,"nombre":"Rabipelado"},{"id":16,"nombre":"Colibrí"},{"id":17,"nombre":"Mono Araguato"}];
export const LIBROS = [{"id":1,"nombre":"La Biblia"},{"id":2,"nombre":"La Ilíada"},{"id":3,"nombre":"La Odisea"},{"id":4,"nombre":"La Divina Comedia"},{"id":5,"nombre":"Don Quijote de la Mancha"},{"id":6,"nombre":"Tristán e Isolda"},{"id":7,"nombre":"Cien años de soledad"},{"id":8,"nombre":"Doña Bárbara"},{"id":9,"nombre":"Meditaciones"},{"id":10,"nombre":"Los miserables"},{"id":11,"nombre":"El conde de Montecristo"},{"id":12,"nombre":"Guerra y paz"},{"id":13,"nombre":"La comunidad del anillo"},{"id":14,"nombre":"Danza de dragones"},{"id":15,"nombre":"Duna"},{"id":16,"nombre":"Fundación"},{"id":17,"nombre":"El catalejo lacado"}];

export type Secreto = { libro: number; rango: string };
export type Resultado = { llavePrivada: string; direccion: string };

// La lista oficial de palabras en español (BIP-39) del nivel Máxima.
export const PALABRAS: readonly string[] = spanishWordlist;

function materialDe(nivel: "standard" | "advanced", tipo: IdentifierType, valor: string, avatar: number, secretos: Secreto[]): CulturalDerivationMaterial {
  const valorNormalizado = normalizeIdentifierValue(tipo, valor);
  if (!valorNormalizado) throw new Error("Falta tu identificador");
  const cantidad = nivel === "standard" ? 1 : 2;
  if (secretos.length !== cantidad) throw new Error(nivel === "standard" ? "Estándar usa un secreto" : "Avanzada usa dos secretos");
  return {
    v: "SERO_FLASH_DERIVATION_V1",
    network: "BSC",
    curve: "secp256k1",
    security: nivel,
    identifier: { type: tipo, value: valorNormalizado },
    avatar: { id: avatar },
    secrets: secretos.map((s, i) => secretMaterialFromManual({ book: s.libro, range: s.rango }, (i + 1) as 1 | 2)),
  };
}

// Estándar y Avanzada: libro y rango, identificador y avatar.
export async function llaveDeNivel(nivel: "standard" | "advanced", tipo: IdentifierType, valor: string, avatar: number, secretos: Secreto[]): Promise<Resultado> {
  const llave = await derivePrivateKeyFromMaterialV4(materialDe(nivel, tipo, valor, avatar, secretos));
  const resultado: Resultado = { llavePrivada: `0x${bytesToHex(llave)}`, direccion: privateKeyToAddress(llave) };
  llave.fill(0);
  return resultado;
}

// ─── Bolsillos ───────────────────────────────────────────────────────────────
// Desde noviembre de 2026 la billetera usa bolsillos: otras direcciones de la misma llave, que solo
// controla quien la tiene. La dirección que compartes (la «puerta») recibe recargas; luego el dinero pasa
// a bolsillos de recarga numerados, y cada pago que te hace otro usuario de SERO llega a un bolsillo
// de cobro nuevo. Ver la sección 4 de la especificación.

export const CONTRATO_SERO = "0xc872fcbc4Df48187454798Ebc94176A258832F4D";
export const TEMA_PAGO_SERO = "0x101bbd0b71609893cf7095fdbebe9b6e9e097866134ccb8d28e9ce3d309b14e4";
export const BOLSILLOS_DESDE_BLOQUE = 132306000; // ningún bolsillo de cobro es anterior a este bloque

export type Bolsillo = { direccion: string; llavePrivada: string };

function bytesDeLlave(llavePrivada: string): Uint8Array {
  const limpia = String(llavePrivada).trim();
  if (!/^0x[0-9a-fA-F]{64}$/.test(limpia)) throw new Error("Se espera una llave privada 0x + 64 caracteres hexadecimales");
  return deHex(limpia);
}

// Bolsillos de recarga número desde … desde + cantidad − 1.
export function bolsillosDeRecarga(llavePrivada: string, desde = 0, cantidad = 20): (Bolsillo & { numero: number })[] {
  const llave = bytesDeLlave(llavePrivada);
  return Array.from({ length: cantidad }, (_, i) => {
    const b = bolsilloDeRecarga(llave, desde + i);
    return { numero: b.indice, direccion: b.direccion, llavePrivada: `0x${hex(b.llave)}` };
  });
}

// Reconocedor de bolsillos de cobro: devuelve una función que, para cada evento PaymentExecuted
// (clientTxId = topics[1], destinatario = topics[3]), da el bolsillo y su llave si es tuyo, o null.
export function reconocedorDeCobros(llavePrivada: string): (clientTxId: string, destinatario: string) => Bolsillo | null {
  const llaves = llavesDeBolsillos(bytesDeLlave(llavePrivada));
  return (clientTxId, destinatario) => {
    const k = reconocerBolsillo(llaves, clientTxId, destinatario);
    return k ? { direccion: privateKeyToAddress(k), llavePrivada: `0x${hex(k)}` } : null;
  };
}

// Código de cobro (S, V): lo que otros usan para pagarte en un bolsillo nuevo cada vez.
export function codigoDeCobro(llavePrivada: string): CodigoDeCobro {
  return llavesDeBolsillos(bytesDeLlave(llavePrivada)).codigo;
}

// Las tres llaves que salen de los mismos datos, en el orden en que la billetera las prueba: la vigente
// y las dos anteriores. La billetera abre la primera que tenga movimiento en la red (y, si ninguna tiene,
// la vigente); la herramienta hace lo mismo.
export async function llavesDeNivel(nivel: "standard" | "advanced", tipo: IdentifierType, valor: string, avatar: number, secretos: Secreto[]): Promise<Resultado[]> {
  const material = materialDe(nivel, tipo, valor, avatar, secretos);
  const salida: Resultado[] = [];
  for (const derivar of [derivePrivateKeyFromMaterialV4, derivePrivateKeyFromMaterialV3, derivePrivateKeyFromMaterialV2]) {
    const llave = await derivar(material);
    salida.push({ llavePrivada: `0x${bytesToHex(llave)}`, direccion: privateKeyToAddress(llave) });
    llave.fill(0);
  }
  return salida;
}

// ─── Juntar todo: mover el dinero sin SERO ───────────────────────────────────
// Para la salida de emergencia: firmar aquí, en tu dispositivo, envíos normales de BNB Smart Chain
// (transacciones «legacy» con EIP-155, chainId 56) y la transferencia de USDT. Nada de esto pasa por SERO.

function rlpCodificar(x: Uint8Array | Uint8Array[]): Uint8Array {
  const largo = (n: number, base: number) => {
    if (n < 56) return Uint8Array.of(base + n);
    const bytes: number[] = [];
    for (let v = n; v > 0; v = Math.floor(v / 256)) bytes.unshift(v % 256);
    return Uint8Array.of(base + 55 + bytes.length, ...bytes);
  };
  if (x instanceof Uint8Array) {
    if (x.length === 1 && x[0] < 0x80) return x;
    return unir(largo(x.length, 0x80), x);
  }
  const cuerpo = unir(...x.map(rlpCodificar));
  return unir(largo(cuerpo.length, 0xc0), cuerpo);
}

// Entero sin ceros a la izquierda (el 0 es vacío), como exige RLP.
function rlpEntero(n: bigint): Uint8Array {
  if (n === 0n) return new Uint8Array(0);
  let h = n.toString(16);
  if (h.length % 2) h = "0" + h;
  return deHex(h);
}

export type Envio = { nonce: bigint; gasPrice: bigint; gasLimit: bigint; to: string; value: bigint; data: string };
export const CADENA_BSC = 56n;

// Firma un envío con la llave privada y devuelve la transacción lista para la red (0x…).
export function firmarEnvio(llavePrivada: string, tx: Envio): string {
  const campos = [rlpEntero(tx.nonce), rlpEntero(tx.gasPrice), rlpEntero(tx.gasLimit), deHex(tx.to), rlpEntero(tx.value), deHex(tx.data || "0x")];
  const resumen = keccak256(rlpCodificar([...campos, rlpEntero(CADENA_BSC), new Uint8Array(0), new Uint8Array(0)]));
  const firma = secp256k1.sign(resumen, bytesDeLlave(llavePrivada));
  const v = CADENA_BSC * 2n + 35n + BigInt(firma.recovery);
  return "0x" + hex(rlpCodificar([...campos, rlpEntero(v), rlpEntero(firma.r), rlpEntero(firma.s)]));
}

export const USDT_BSC = "0x55d398326f99059fF775485246999027B3197955";

// Los datos de «transfer(destino, monto)» del USDT.
export function datosDeTransferenciaUsdt(destino: string, monto: bigint): string {
  return "0xa9059cbb" + destino.slice(2).toLowerCase().padStart(64, "0") + monto.toString(16).padStart(64, "0");
}

// Una dirección válida: 0x y 40 caracteres; si trae mayúsculas, su suma de verificación (EIP-55)
// tiene que cuadrar. Así un carácter cambiado no pasa.
export function direccionValida(texto: string): boolean {
  const t = String(texto).trim();
  if (!/^0x[0-9a-fA-F]{40}$/.test(t)) return false;
  const cuerpo = t.slice(2);
  if (cuerpo === cuerpo.toLowerCase() || cuerpo === cuerpo.toUpperCase()) return true;
  const resumen = hex(keccak256(new TextEncoder().encode(cuerpo.toLowerCase())));
  for (let i = 0; i < 40; i += 1) {
    const c = cuerpo[i];
    if (/[a-f]/.test(c) && parseInt(resumen[i], 16) >= 8) return false;
    if (/[A-F]/.test(c) && parseInt(resumen[i], 16) < 8) return false;
  }
  return true;
}

// El QR de una dirección, en SVG.
export function qrSvg(texto: string): Promise<string> {
  return QRCode.toString(texto, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
}

// Máxima: las 12 palabras en español.
export function llaveDePalabras(texto: string): Resultado {
  const palabras = texto.trim().toLocaleLowerCase("es").split(/\s+/).filter(Boolean);
  if (!validateMnemonic(palabras.join(" "), spanishWordlist)) throw new Error("Esas 12 palabras no forman una frase válida. Revisa el orden y cada palabra.");
  const llave = derivePrivateKeyFromWords(palabras);
  const resultado: Resultado = { llavePrivada: `0x${bytesToHex(llave)}`, direccion: privateKeyToAddress(llave) };
  llave.fill(0);
  return resultado;
}
