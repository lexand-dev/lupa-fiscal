/**
 * domain/fraccionamiento.ts — Lupa Fiscal · BANDERA AGREGADA
 *
 * Detecta FRACCIONAMIENTO de contratos: una entidad parte una compra grande en
 * varios contratos pequeños con el MISMO proveedor, cada uno por debajo del
 * umbral de licitación, para evitar el proceso competitivo (posible elusión de
 * licitación pública / Art. de la Ley de Contrataciones).
 *
 * A diferencia del motor de riesgo (risk-engine.ts), que evalúa UN contrato,
 * esta señal solo es visible al mirar la LISTA completa: se agrupa por
 * (entidadId, proveedorId) y se buscan grupos con ≥2 contratos individualmente
 * bajo el umbral cuya suma SÍ lo supera.
 *
 * Función pura: cero dependencias de framework / DB (ADR-0002). Aquí viven
 * los tests (fraccionamiento.test.ts).
 *
 * Pesos (consistente con risk-engine.ts):
 *   Fraccionamiento ....... 3
 */
import type { Bandera, Contrato } from "./entities";

/** Umbral por defecto (S/) bajo el cual un contrato no exige licitación pública. */
export const UMBRAL_FRACCIONAMIENTO = 8_000_000;
/** Mínimo de contratos en un grupo para considerarlo fraccionamiento. */
export const MIN_CONTRATOS_FRACCIONAMIENTO = 2;

/** Opciones de detección (todas con valores por defecto sensatos). */
export interface OpcionesFraccionamiento {
  /** Umbral monetario por contrato. Por defecto UMBRAL_FRACCIONAMIENTO. */
  umbral?: number;
  /** Nº mínimo de contratos en el grupo. Por defecto MIN_CONTRATOS_FRACCIONAMIENTO. */
  minContratos?: number;
}

/** Grupo sospechoso de fraccionamiento: misma entidad + mismo proveedor. */
export interface GrupoFraccionamiento {
  entidadId: string;
  proveedorId: string;
  /** IDs de los contratos involucrados (orden de aparición en la lista). */
  contratoIds: string[];
  /** Suma de montos considerados de los contratos del grupo. */
  montoTotal: number;
  /** Señal de riesgo lista para mostrar (mismo formato que el motor). */
  bandera: Bandera;
}

/** Monto que se usa para comparar contra el umbral: adjudicado o, si falta, referencial. */
function montoDeContrato(c: Contrato): number | null {
  if (c.montoAdjudicado != null) return c.montoAdjudicado;
  if (c.valorReferencial != null) return c.valorReferencial;
  return null;
}

/**
 * Detecta posibles fraccionamientos en una lista de contratos.
 *
 * Agrupa por (entidadId, proveedorId) y marca el grupo cuando:
 *   1) tiene ≥ minContratos contratos,
 *   2) CADA contrato del grupo está individualmente bajo el umbral, y
 *   3) la SUMA de sus montos supera el umbral.
 *
 * Solo cuenta contratos con proveedor y monto conocidos (los nulos se ignoran,
 * no rompen). Función pura: mismas entradas -> mismas salidas, sin efectos.
 */
export function detectarFraccionamiento(
  contratos: Contrato[],
  opts: OpcionesFraccionamiento = {},
): GrupoFraccionamiento[] {
  const umbral = opts.umbral ?? UMBRAL_FRACCIONAMIENTO;
  const minContratos = opts.minContratos ?? MIN_CONTRATOS_FRACCIONAMIENTO;

  // 1) Agrupar por (entidadId, proveedorId), conservando orden de aparición.
  const grupos = new Map<string, { entidadId: string; proveedorId: string; contratos: Contrato[] }>();
  for (const c of contratos) {
    if (c.proveedorId == null) continue; // sin proveedor no hay grupo
    const monto = montoDeContrato(c);
    if (monto == null) continue; // sin monto no se puede comparar contra el umbral
    if (monto >= umbral) continue; // un contrato sobre el umbral ya iría a licitación: no es indicio
    const clave = `${c.entidadId}::${c.proveedorId}`;
    const grupo =
      grupos.get(clave) ??
      { entidadId: c.entidadId, proveedorId: c.proveedorId, contratos: [] };
    grupo.contratos.push(c);
    grupos.set(clave, grupo);
  }

  // 2) Filtrar grupos sospechosos y armar la bandera.
  const resultado: GrupoFraccionamiento[] = [];
  for (const grupo of grupos.values()) {
    if (grupo.contratos.length < minContratos) continue;
    const montoTotal = grupo.contratos.reduce((s, c) => s + (montoDeContrato(c) ?? 0), 0);
    if (montoTotal <= umbral) continue; // la suma no supera el umbral: no hay indicio

    resultado.push({
      entidadId: grupo.entidadId,
      proveedorId: grupo.proveedorId,
      contratoIds: grupo.contratos.map((c) => c.id),
      montoTotal,
      bandera: {
        codigo: "FRACCIONAMIENTO",
        peso: 3,
        detalle:
          `${grupo.contratos.length} contratos al mismo proveedor por debajo del umbral ` +
          `suman S/ ${montoTotal.toLocaleString("es-PE")} (posible elusión de licitación)`,
      },
    });
  }

  return resultado;
}
