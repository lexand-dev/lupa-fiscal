/**
 * infrastructure/auth/session.ts — Lupa Fiscal
 *
 * Criptografía de autenticación SIN dependencias npm nuevas: solo `node:crypto`.
 * Vive en infrastructure porque toca cripto/entorno; el dominio y la aplicación
 * dependen de los CONTRATOS (interfaces), no de esta implementación (ADR-0002).
 *
 * Dos responsabilidades:
 *   1) Password   → hash con scrypt (memory-hard) + verificación en tiempo
 *      constante. Formato autodescriptivo "scrypt$N$r$p$saltB64$hashB64", para
 *      poder subir los parámetros en el futuro sin romper hashes antiguos.
 *   2) Sesión     → token firmado con HMAC-SHA256 para la cookie httpOnly.
 *      El token es `${sessionId}.${firmaB64url}`: el payload es OPACO (solo el
 *      sessionId), nunca lleva datos del usuario. La firma evita que el cliente
 *      fabrique un sessionId válido; igual se valida luego contra la tabla.
 *
 * El secreto del HMAC sale de process.env.AUTH_SECRET. En desarrollo hay un
 * fallback fijo (con aviso) para que la demo arranque sin configurar nada; en
 * producción NUNCA debe usarse ese fallback.
 */
import {
  createHmac,
  randomBytes,
  scrypt as scryptCb,
  timingSafeEqual,
} from "node:crypto";
import { promisify } from "node:util";

// scrypt nativo es callback-based; lo promisificamos para usar async/await.
const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  opciones: { N: number; r: number; p: number; maxmem?: number },
) => Promise<Buffer>;

// ============================================================
//  Parámetros de scrypt
// ============================================================
//
// N=2^15 (16384), r=8, p=1 → coste recomendado para hashing interactivo.
// salt de 16 bytes aleatorios por usuario; keylen de 64 bytes de salida.
// maxmem se sube porque N*r*128 supera el default de 32 MiB de Node.

const SCRYPT_N = 16384; // factor de coste CPU/memoria (potencia de 2).
const SCRYPT_R = 8; // tamaño de bloque.
const SCRYPT_P = 1; // paralelización.
const SCRYPT_SALT_BYTES = 16; // sal aleatoria por usuario.
const SCRYPT_KEYLEN = 64; // longitud del hash derivado.
const SCRYPT_MAXMEM = 64 * 1024 * 1024; // 64 MiB (holgura sobre N*r*128).

/** Prefijo del algoritmo en el formato serializado del hash. */
const ALGORITMO = "scrypt";

// ============================================================
//  Sesión / HMAC
// ============================================================

/** Nombre de la cookie httpOnly de sesión. */
export const NOMBRE_COOKIE = "lf_session";

/** Duración de una sesión: 7 días en milisegundos. */
export const DURACION_SESION_MS = 1000 * 60 * 60 * 24 * 7;

/** Bytes aleatorios del sessionId (256 bits → base64url). */
const SESSION_ID_BYTES = 32;

/**
 * Fallback de desarrollo para el secreto del HMAC. SOLO para que la demo local
 * arranque sin configurar nada. En producción se exige AUTH_SECRET real.
 */
const SECRETO_DEV =
  "lupa-fiscal-dev-secret-no-usar-en-produccion-0123456789abcdef";

/**
 * Resuelve el secreto del HMAC desde el entorno.
 * Patrón idéntico a getPool() con DATABASE_URL: si falta en producción, lanza.
 * En desarrollo usa el fallback y avisa una sola vez.
 */
let avisoFallbackEmitido = false;
function obtenerSecreto(): string {
  const secreto = process.env.AUTH_SECRET;
  if (secreto && secreto.length >= 32) return secreto;

  // En producción nunca se permite el fallback ni un secreto débil.
  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "AUTH_SECRET no definido o demasiado corto (se requieren ≥32 bytes en producción)",
    );
  }
  if (secreto && secreto.length < 32) {
    throw new Error("AUTH_SECRET demasiado corto (se requieren ≥32 bytes)");
  }
  if (!avisoFallbackEmitido) {
    console.warn(
      "[auth] AUTH_SECRET no definido: usando secreto de DESARROLLO. No usar en producción.",
    );
    avisoFallbackEmitido = true;
  }
  return SECRETO_DEV;
}

// ============================================================
//  Helpers base64url (las cookies/URLs no toleran +, / ni =)
// ============================================================

/** Codifica un Buffer a base64url (sin padding). */
function aBase64Url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** Decodifica base64url a Buffer (tolera entrada inválida → Buffer vacío). */
function deBase64Url(s: string): Buffer {
  return Buffer.from(s, "base64url");
}

/**
 * Compara dos cadenas en tiempo constante (anti-timing).
 * Las pasa por SHA-fija longitud vía Buffer; si difieren en longitud, primero
 * iguala el tamaño para que timingSafeEqual no lance, pero el resultado sigue
 * siendo false. Nunca corta antes por una diferencia temprana.
 */
function igualEnTiempoConstante(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  // timingSafeEqual exige misma longitud; si no coinciden ya es false, pero
  // hacemos la comparación contra una copia del mismo tamaño para no filtrar
  // la longitud por una excepción temprana.
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

// ============================================================
//  Password: hash + verificación
// ============================================================

/**
 * Hashea una contraseña en claro con scrypt + sal aleatoria.
 * @returns cadena "scrypt$N$r$p$saltB64$hashB64" lista para persistir.
 */
export async function hashPassword(plano: string): Promise<string> {
  if (typeof plano !== "string" || plano.length === 0) {
    throw new Error("La contraseña no puede estar vacía");
  }
  const salt = randomBytes(SCRYPT_SALT_BYTES);
  const hash = await scrypt(plano, salt, SCRYPT_KEYLEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: SCRYPT_MAXMEM,
  });
  return [
    ALGORITMO,
    SCRYPT_N,
    SCRYPT_R,
    SCRYPT_P,
    aBase64Url(salt),
    aBase64Url(hash),
  ].join("$");
}

/**
 * Verifica una contraseña en claro contra un hash serializado.
 * Re-deriva con los parámetros guardados en el propio hash y compara en tiempo
 * constante. Cualquier hash mal formado devuelve false (nunca lanza).
 */
export async function verificarPassword(
  plano: string,
  hashGuardado: string,
): Promise<boolean> {
  if (typeof plano !== "string" || typeof hashGuardado !== "string") {
    return false;
  }
  const partes = hashGuardado.split("$");
  // Forma esperada: [algoritmo, N, r, p, saltB64, hashB64] → 6 partes.
  if (partes.length !== 6 || partes[0] !== ALGORITMO) return false;

  const N = Number(partes[1]);
  const r = Number(partes[2]);
  const p = Number(partes[3]);
  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) {
    return false;
  }
  const salt = deBase64Url(partes[4]);
  const esperado = deBase64Url(partes[5]);
  if (salt.length === 0 || esperado.length === 0) return false;

  let derivado: Buffer;
  try {
    derivado = await scrypt(plano, salt, esperado.length, {
      N,
      r,
      p,
      maxmem: SCRYPT_MAXMEM,
    });
  } catch {
    // Parámetros fuera de rango / maxmem insuficiente: trátalo como no-match.
    return false;
  }
  if (derivado.length !== esperado.length) return false;
  return timingSafeEqual(derivado, esperado);
}

// ============================================================
//  Sesión: id aleatorio + firma HMAC del token de cookie
// ============================================================

/** Genera un sessionId opaco (32 bytes aleatorios en base64url). */
export function nuevoSessionId(): string {
  return aBase64Url(randomBytes(SESSION_ID_BYTES));
}

/** Calcula la firma HMAC-SHA256 (base64url) de un sessionId. */
function firmar(sessionId: string): string {
  return aBase64Url(
    createHmac("sha256", obtenerSecreto()).update(sessionId).digest(),
  );
}

/**
 * Construye el valor del cookie: `${sessionId}.${firmaB64url}`.
 * El sessionId queda en claro (es opaco); la firma garantiza integridad.
 */
export function firmarSession(sessionId: string): string {
  return `${sessionId}.${firmar(sessionId)}`;
}

/**
 * Verifica el token del cookie y devuelve el sessionId si la firma es válida,
 * o null en cualquier otro caso. No toca la DB: es la primera línea de defensa
 * (un token sin firma válida ni siquiera llega a consultar la tabla sessions).
 */
export function verificarSession(token: string | null | undefined): string | null {
  if (typeof token !== "string" || token.length === 0) return null;
  const corte = token.lastIndexOf(".");
  if (corte <= 0 || corte === token.length - 1) return null;

  const sessionId = token.slice(0, corte);
  const firmaRecibida = token.slice(corte + 1);
  const firmaEsperada = firmar(sessionId);

  return igualEnTiempoConstante(firmaRecibida, firmaEsperada) ? sessionId : null;
}

// ============================================================
//  Servicio agrupado (implementa el contrato CryptoService del spec)
// ============================================================

/**
 * Servicio de criptografía de auth. Es el adaptador que la aplicación recibe
 * por inyección como puerto `CryptoService` (firmas idénticas a §5.3 del spec).
 * Agrupa las funciones de arriba en un objeto para inyectarlo como dependencia.
 */
export const cryptoService = {
  hashPassword,
  verificarPassword,
  firmarSession,
  verificarSession,
  /** ID aleatorio reutilizable (sessionId / userId con prefijo opcional). */
  nuevoId(prefijo?: string): string {
    const id = aBase64Url(randomBytes(SESSION_ID_BYTES));
    return prefijo ? `${prefijo}${id}` : id;
  },
} as const;

/** Tipo del servicio de cripto (contrato que consume la capa de aplicación). */
export type CryptoService = typeof cryptoService;
