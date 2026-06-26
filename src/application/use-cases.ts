/**
 * application/use-cases.ts — Lupa Fiscal
 *
 * Casos de uso: orquestan el repositorio (puerto) + el motor de dominio.
 * No conocen ni framework ni SQL; reciben un ObrasRepository por inyección.
 */
import { evaluarRiesgo } from "@/domain/risk-engine";
import type {
  ObraConContexto,
  ObraEvaluada,
  ObrasRepository,
  RegionResumen,
} from "./ports";

/** Aplica el motor de riesgo a una obra con contexto. */
function enriquecer(c: ObraConContexto): ObraEvaluada {
  const evaluacion = c.contrato
    ? evaluarRiesgo({ contrato: c.contrato, proveedor: c.proveedor, obra: c.obra })
    : { puntaje: 0, nivel: "bajo" as const, banderas: [] };
  return { ...c, evaluacion };
}

/** Lista de regiones con sus cifras agregadas (para el selector y los headlines). */
export async function listarRegiones(repo: ObrasRepository): Promise<RegionResumen[]> {
  const regiones = await repo.listarRegiones();
  return regiones.sort((a, b) => b.inversionCongelada - a.inversionCongelada);
}

/**
 * Busca obras de una región y las devuelve evaluadas, ordenadas por riesgo desc.
 * Es el "camino feliz" de la funcionalidad crítica (PDF sección 2.3).
 */
export async function buscarObras(
  repo: ObrasRepository,
  region: string,
  categoria?: string | null,
): Promise<ObraEvaluada[]> {
  if (!region || !region.trim()) {
    throw new Error("Región requerida");
  }
  const crudas = await repo.buscarPorRegion(region.trim(), categoria);
  return crudas
    .map(enriquecer)
    .sort((a, b) => b.evaluacion.puntaje - a.evaluacion.puntaje);
}

/** Detalle de una obra (ficha) ya evaluada. Null si no existe. */
export async function obtenerDetalleObra(
  repo: ObrasRepository,
  id: string,
): Promise<ObraEvaluada | null> {
  const cruda = await repo.obtenerObra(id);
  return cruda ? enriquecer(cruda) : null;
}
