/**
 * domain/validators.ts — Lupa Fiscal · NÚCLEO
 *
 * Validadores de identificadores peruanos (RENIEC / SUNAT). Funciones PURAS:
 * mismas entradas -> mismas salidas, sin efectos. Cero dependencias de
 * framework / DB (ADR-0002), igual que risk-engine.ts. Aquí viven los tests.
 *
 *   validarDni → DNI de 8 dígitos, con verificador OPCIONAL de FORMA.
 *   validarRuc → RUC de 11 dígitos + dígito verificador (módulo 11).
 *   tipoRuc    → "natural" | "juridica" según el prefijo del RUC.
 */

// ============================================================
//  DNI (RENIEC)
// ============================================================
//
// El DNI peruano tiene un número base de 8 dígitos. RENIEC imprime además un
// "dígito verificador" OPCIONAL que NO forma parte del número base; aparece
// separado en el documento (p. ej. 12345678-9 o 12345678-K). Como RENIEC no
// publica una fórmula oficial del verificador, NO se valida su checksum: solo
// se valida por FORMA (un único carácter alfanumérico). La validación
// rigurosa es la estructural (8 dígitos).

/** Centinela inválido que aparece como placeholder en datos sucios. */
const DNI_CENTINELA = "00000000";

/**
 * Valida un DNI peruano: 8 dígitos, con verificador opcional ([-| ]?[0-9A-Za-z]).
 * No verifica el checksum del verificador (no hay fórmula oficial pública).
 * @param dni cadena a validar (se recortan espacios de los extremos).
 * @returns true si y solo si tiene forma de DNI válido.
 */
export function validarDni(dni: string): boolean {
  // 0) Guarda de tipo en runtime (entradas externas pueden no ser string).
  if (typeof dni !== "string") return false;

  // 1) Normalizar: recortar espacios de los extremos.
  const limpio = dni.trim();
  if (limpio.length === 0) return false;

  // 2) Patrón: 8 dígitos + verificador opcional (separador - o espacio opcional).
  //    Grupo 1 = número base; grupo 2 = verificador (si existe).
  const patron = /^([0-9]{8})(?:[-\s]?([0-9A-Za-z]))?$/;
  const m = patron.exec(limpio);
  if (m === null) return false;

  // 3) Rechazar el número centinela (placeholder, no es un DNI real).
  if (m[1] === DNI_CENTINELA) return false;

  // 4) El verificador, si vino, ya quedó validado por forma en el patrón
  //    (exactamente 1 carácter en [0-9A-Za-z]). No se valida su checksum.
  return true;
}

// ============================================================
//  RUC (SUNAT)
// ============================================================
//
// RUC = Registro Único de Contribuyentes. 11 dígitos numéricos; el último es
// el dígito verificador (DV) calculado por módulo 11 con pesos fijos sobre los
// 10 dígitos anteriores. Algoritmo verificado contra RUCs reales de SUNAT
// (BCP 20100070970, SUNAT 20131312955, MEF 20131380951, Telefónica 20100128056).

/** Pesos fijos para los 10 primeros dígitos (izquierda → derecha). */
const PESOS_RUC = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

/** Prefijos de tipo de contribuyente aceptados (10/15/16/17 natural, 20 jurídica). */
const PREFIJOS_RUC_VALIDOS = new Set(["10", "15", "16", "17", "20"]);
// Versión estricta del dominio (solo natural + jurídica): new Set(["10", "20"]);

/**
 * Valida un RUC peruano: forma (11 dígitos), tipo (prefijo) y dígito verificador.
 * @param ruc cadena a validar (se recortan espacios; NO admite guiones/puntos).
 * @returns true si y solo si es un RUC estructuralmente válido con DV correcto.
 */
export function validarRuc(ruc: string): boolean {
  // 1) Guarda de tipo / entrada.
  if (typeof ruc !== "string") return false;
  const r = ruc.trim();

  // 2) Forma: exactamente 11 dígitos.
  if (!/^[0-9]{11}$/.test(r)) return false;

  // 3) Tipo: prefijo (2 primeros) en el conjunto válido.
  if (!PREFIJOS_RUC_VALIDOS.has(r.slice(0, 2))) return false;

  // 4) Suma ponderada de los 10 primeros dígitos.
  let suma = 0;
  for (let i = 0; i < 10; i++) {
    suma += Number(r[i]) * PESOS_RUC[i];
  }

  // 5) Dígito verificador esperado. La forma (11 - (suma % 11)) % 10 colapsa
  //    los casos especiales (resto 1 → 10 → 0, resto 0 → 11 → 1) sin if.
  const dvEsperado = (11 - (suma % 11)) % 10;

  // 6) Comparar contra el 11º dígito.
  return dvEsperado === Number(r[10]);
}

/** Devuelve el tipo de contribuyente según el prefijo, o null si el RUC es inválido. */
export function tipoRuc(ruc: string): "natural" | "juridica" | null {
  if (!validarRuc(ruc)) return null;
  return ruc.trim().startsWith("20") ? "juridica" : "natural";
}
