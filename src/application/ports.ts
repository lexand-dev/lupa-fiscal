/**
 * application/ports.ts — Lupa Fiscal
 *
 * Puertos (interfaces) que el dominio/aplicación necesitan de la infraestructura.
 * La capa de aplicación depende de ESTO, no de Postgres. Así se puede cambiar de
 * repositorio (Postgres real ↔ seed JSON) sin tocar casos de uso (ADR-0001/0002).
 */
import type { Contrato, Entidad, EvaluacionRiesgo, Obra, Proveedor } from "@/domain/entities";

/** Obra con todo su contexto crudo (join), tal como lo entrega un repositorio. */
export interface ObraConContexto {
  obra: Obra;
  entidad: Entidad;
  contrato: Contrato | null;
  proveedor: Proveedor | null;
}

/** Resumen agregado por región (capa headline del buscador/mapa). */
export interface RegionResumen {
  region: string;
  totalObras: number;
  totalParalizadas: number;
  /** Inversión congelada (suma de monto_inversion de obras paralizadas). */
  inversionCongelada: number;
}

/** Obra ya enriquecida con la evaluación de riesgo (salida de los casos de uso). */
export interface ObraEvaluada extends ObraConContexto {
  evaluacion: EvaluacionRiesgo;
}

/** Puerto de persistencia. Lo implementan los adaptadores en infrastructure/. */
export interface ObrasRepository {
  listarRegiones(): Promise<RegionResumen[]>;
  buscarPorRegion(region: string): Promise<ObraConContexto[]>;
  obtenerObra(id: string): Promise<ObraConContexto | null>;
}
