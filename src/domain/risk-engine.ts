/**
 * domain/risk-engine.ts — Lupa Fiscal · NÚCLEO
 *
 * Motor de señales de riesgo. Cada bandera es una FUNCIÓN PURA sobre un contrato
 * (más, opcionalmente, su proveedor y su obra). El puntaje es la suma de pesos.
 * No es una caja negra: cada bandera explica su motivo.
 *
 * Cero dependencias de framework / DB (ADR-0002). Aquí viven los tests.
 *
 * Pesos (PDF, sección 4.1):
 *   Postor único .......... 3
 *   Sobrecosto >15% ....... 2
 *   Proveedor recurrente .. 1
 *   Proveedor sancionado .. 3  (stretch)
 *   Obra atrapada ......... 2
 */
import type {
  Bandera,
  Contrato,
  EvaluacionRiesgo,
  NivelRiesgo,
  Obra,
  Proveedor,
} from "./entities";

/** Contexto que necesita el motor para evaluar un contrato. */
export interface ContextoRiesgo {
  contrato: Contrato;
  proveedor?: Proveedor | null;
  obra?: Obra | null;
}

export const UMBRAL_SOBRECOSTO = 0.15;
export const UMBRAL_RECURRENTE = 3;
export const MESES_PARADA_ATRAPADA = 6;
export const AVANCE_ATRAPADA = 50; // % de avance físico que vuelve "atrapada" la inversión

// ---------- Banderas (funciones puras) ----------

/** 🚩 Adjudicación con un solo postor (sin competencia). */
export function banderaPostorUnico(ctx: ContextoRiesgo): Bandera | null {
  return ctx.contrato.numPostores === 1
    ? {
        codigo: "POSTOR_UNICO",
        peso: 3,
        detalle: "Adjudicado con un solo postor (sin competencia)",
      }
    : null;
}

/** 🚩 Monto adjudicado > umbral por encima del valor referencial. */
export function banderaSobrecosto(
  ctx: ContextoRiesgo,
  umbral: number = UMBRAL_SOBRECOSTO,
): Bandera | null {
  const { valorReferencial, montoAdjudicado } = ctx.contrato;
  if (valorReferencial == null || montoAdjudicado == null) return null;
  if (valorReferencial <= 0) return null;
  const exceso = (montoAdjudicado - valorReferencial) / valorReferencial;
  return exceso > umbral
    ? {
        codigo: "SOBRECOSTO",
        peso: 2,
        detalle: `Adjudicado ${(exceso * 100).toFixed(0)}% sobre el valor referencial`,
      }
    : null;
}

/** 🚩 Mismo proveedor adjudicado ≥ N veces por la entidad. */
export function banderaProveedorRecurrente(
  ctx: ContextoRiesgo,
  umbral: number = UMBRAL_RECURRENTE,
): Bandera | null {
  const freq = ctx.proveedor?.numAdjudicaciones ?? 0;
  return freq >= umbral
    ? {
        codigo: "PROVEEDOR_RECURRENTE",
        peso: 1,
        detalle: `Mismo proveedor adjudicado en ${freq} procesos por la entidad`,
      }
    : null;
}

/** 🚩 Contrato adjudicado a proveedor inhabilitado (stretch). */
export function banderaProveedorSancionado(ctx: ContextoRiesgo): Bandera | null {
  return ctx.proveedor?.sancionado === true
    ? {
        codigo: "PROVEEDOR_SANCIONADO",
        peso: 3,
        detalle: "Adjudicado a proveedor inhabilitado / sancionado",
      }
    : null;
}

/** 🚩 Obra paralizada > N meses con alto avance físico (plata atrapada). */
export function banderaObraAtrapada(
  ctx: ContextoRiesgo,
  mesesMin: number = MESES_PARADA_ATRAPADA,
  avanceMin: number = AVANCE_ATRAPADA,
): Bandera | null {
  const obra = ctx.obra;
  if (!obra) return null;
  if (obra.estado !== "paralizada") return null;
  if (obra.mesesParada == null || obra.avanceFisico == null) return null;
  return obra.mesesParada > mesesMin && obra.avanceFisico >= avanceMin
    ? {
        codigo: "OBRA_ATRAPADA",
        peso: 2,
        detalle: `Paralizada ${obra.mesesParada} meses con ${obra.avanceFisico}% de avance`,
      }
    : null;
}

/** Todas las reglas en orden de evaluación. */
export const REGLAS: Array<(ctx: ContextoRiesgo) => Bandera | null> = [
  banderaPostorUnico,
  banderaSobrecosto,
  banderaProveedorRecurrente,
  banderaProveedorSancionado,
  banderaObraAtrapada,
];

function clasificar(puntaje: number): NivelRiesgo {
  if (puntaje >= 5) return "alto";
  if (puntaje >= 2) return "medio";
  return "bajo";
}

/**
 * Evalúa un contrato y devuelve puntaje + banderas disparadas.
 * Función pura: mismas entradas -> mismas salidas, sin efectos.
 */
export function evaluarRiesgo(ctx: ContextoRiesgo): EvaluacionRiesgo {
  const banderas = REGLAS.map((regla) => regla(ctx)).filter(
    (b): b is Bandera => b !== null,
  );
  const puntaje = banderas.reduce((s, b) => s + b.peso, 0);
  return { puntaje, nivel: clasificar(puntaje), banderas };
}
