/**
 * domain/entities.ts — Lupa Fiscal
 *
 * Modelo de dominio normalizado. CERO dependencias de framework o DB.
 * Estas son las entidades del PDF de arquitectura (sección 3):
 * Entidad · Obra · Contrato · Proveedor · Bandera.
 */

export type NivelGobierno = "nacional" | "regional" | "local";

export type EstadoObra =
  | "paralizada"
  | "en_ejecucion"
  | "concluida"
  | "desconocido";

/** Entidad pública que convoca la obra/contrato (municipio, GORE, ministerio). */
export interface Entidad {
  id: string;
  nombre: string;
  nivelGobierno: NivelGobierno;
  region: string;
  ubigeo: string;
}

/** Proveedor adjudicado del contrato. */
export interface Proveedor {
  id: string;
  ruc: string;
  razonSocial: string;
  /** Inhabilitado / sancionado por OSCE-RNSSC (stretch). */
  sancionado: boolean;
  /** Nº de adjudicaciones con la misma entidad (precomputado en ETL). */
  numAdjudicaciones: number;
}

/** Contrato (proceso de contratación OCDS) que financia la obra. */
export interface Contrato {
  id: string;
  /** Open Contracting ID. */
  ocid: string;
  /** Código Único de Inversiones (CUI/SNIP). Llave para cruzar con INFOBRAS. */
  cui: string | null;
  valorReferencial: number | null;
  montoAdjudicado: number | null;
  numPostores: number | null;
  entidadId: string;
  proveedorId: string | null;
}

/** Obra pública física. */
export interface Obra {
  id: string;
  nombre: string;
  montoInversion: number | null;
  estado: EstadoObra;
  /** Meses que lleva paralizada. */
  mesesParada: number | null;
  /** Avance físico 0..100 (%). */
  avanceFisico: number | null;
  /** Categoría OCDS: "works" (obra) | "goods" | "services". */
  categoria: string | null;
  lat: number | null;
  lng: number | null;
  entidadId: string;
  contratoId: string | null;
}

/** Señal de riesgo derivada por el motor (no se persiste cruda, se calcula). */
export interface Bandera {
  codigo: string;
  peso: number;
  detalle: string;
}

export type NivelRiesgo = "alto" | "medio" | "bajo";

/** Resultado del motor de señales de riesgo. */
export interface EvaluacionRiesgo {
  puntaje: number;
  nivel: NivelRiesgo;
  banderas: Bandera[];
}
