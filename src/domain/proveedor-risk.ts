/**
 * domain/proveedor-risk.ts — Lupa Fiscal · NÚCLEO (agregación por RUC)
 *
 * Perfil de riesgo POR PROVEEDOR (RUC). Es una capa de AGREGACIÓN sobre el motor
 * por-contrato (`risk-engine.ts`): NO lo reemplaza, lo reutiliza por cada contrato
 * del proveedor y luego computa señales que solo existen a nivel agregado
 * (patrones, no eventos sueltos): % postor único, concentración con un comprador
 * (HHI / top-1 share), recuento de sobrecostos, obras paralizadas asociadas y sanción.
 *
 * Mismo patrón "núcleo, cero deps" que `risk-engine.ts`. Funciones puras: mismas
 * entradas -> mismas salidas, sin I/O. Todo es null-safe, sin división por cero,
 * sin throws (replica el contrato de robustez probado en `risk-engine.test.ts`).
 *
 * Pesos coherentes con el motor por-contrato (postor único = 3 y sancionado = 3 son
 * las señales fuertes). El semáforo es híbrido: por puntaje O escalada directa a rojo
 * ante señal grave (sanción), lo que sea más severo.
 */
import type {
  Bandera,
  Contrato,
  Entidad,
  NivelRiesgo,
  Obra,
  Proveedor,
} from "./entities";
import { UMBRAL_SOBRECOSTO, banderaSobrecosto } from "./risk-engine";

// ---------- Entradas ----------

/**
 * Un contrato del proveedor con su contexto mínimo agregable.
 * `entidad` permite medir concentración por comprador; `obra` permite contar
 * obras paralizadas. Ambos opcionales: el motor es defensivo.
 */
export interface ContratoAgregable {
  contrato: Contrato;
  entidad?: Entidad | null;
  obra?: Obra | null;
}

/** Todo lo que el motor necesita para perfilar un RUC. */
export interface EntradaPerfilProveedor {
  proveedor: Proveedor; // trae ruc, razonSocial, sancionado
  contratos: ContratoAgregable[]; // TODOS los contratos del RUC
}

// ---------- Salidas ----------

export type ColorSemaforo = "verde" | "ambar" | "rojo";

/** Métricas agregadas, explicables y auditables (se muestran tal cual en la ficha). */
export interface MetricasProveedor {
  totalContratos: number;
  /** Contratos con numPostores === 1. */
  adjudicacionesPostorUnico: number;
  /** % postor único sobre contratos con dato de postores (0..100). null si no hay base. */
  pctPostorUnico: number | null;
  /** Nº de contratos con sobrecosto > UMBRAL_SOBRECOSTO. */
  numSobrecostos: number;
  /** Concentración: share del comprador top-1 por monto adjudicado (0..1). null si no hay montos. */
  shareTopComprador: number | null;
  /** Id del comprador top-1 (para explicar la concentración). */
  topCompradorId: string | null;
  /** Nombre del comprador top-1 (null si no se conoce la entidad). */
  topCompradorNombre: string | null;
  /** Herfindahl-Hirschman sobre compradores por monto (0..1). null si no hay base. */
  hhiCompradores: number | null;
  /** Nº de entidades compradoras distintas. */
  numCompradores: number;
  /** Inhabilitación / sanción vigente (de Proveedor.sancionado). */
  sancionado: boolean;
  /** Nº de obras asociadas en estado "paralizada". */
  obrasParalizadas: number;
  /** Suma de montoInversion de esas obras paralizadas (plata expuesta). */
  inversionParalizada: number;
}

/** Resultado del perfil por RUC. Reusa `Bandera` (motivos explicables, mismo shape). */
export interface PerfilRiesgoProveedor {
  ruc: string;
  razonSocial: string;
  /** Suma de pesos de banderas agregadas (0..N). */
  puntaje: number;
  /** Semáforo verde / ambar / rojo. */
  color: ColorSemaforo;
  /** Alias alto / medio / bajo (compat con UI existente). */
  nivel: NivelRiesgo;
  metricas: MetricasProveedor;
  /** Motivos, mismo shape que el motor por-contrato. */
  banderas: Bandera[];
}

// ---------- Umbrales (exportados y testeables, igual que en risk-engine.ts) ----------

export const UMBRAL_PCT_POSTOR_UNICO_ROJO = 60; // % adjudicaciones a dedo
export const UMBRAL_PCT_POSTOR_UNICO_AMBAR = 30;
export const UMBRAL_SHARE_COMPRADOR_ROJO = 0.7; // captura de un solo comprador
export const UMBRAL_SHARE_COMPRADOR_AMBAR = 0.5;
export const UMBRAL_HHI_ROJO = 0.5; // mercado "monopsónico" para el proveedor
export const UMBRAL_SOBRECOSTOS_ROJO = 3; // nº de contratos sobrecosteados
export const UMBRAL_SOBRECOSTOS_AMBAR = 1;
export const UMBRAL_OBRAS_PARALIZADAS_ROJO = 2;
export const PUNTAJE_ROJO = 6; // corte de semáforo por puntaje
export const PUNTAJE_AMBAR = 3;

// ---------- Concentración (puras, auxiliares exportadas para test) ----------

/** Monto adjudicado del contrato, con fallback al valor referencial. */
function montoDelContrato(c: Contrato): number {
  const monto = c.montoAdjudicado ?? c.valorReferencial ?? 0;
  // Defensa: montos negativos o no finitos no aportan a la concentración.
  return Number.isFinite(monto) && monto > 0 ? monto : 0;
}

/** Agrupa los montos por entidad compradora. Devuelve montos y nombres por id. */
function montosPorComprador(
  contratos: ContratoAgregable[],
): { montos: Map<string, number>; nombres: Map<string, string> } {
  const montos = new Map<string, number>();
  const nombres = new Map<string, string>();
  for (const item of contratos) {
    const { contrato, entidad } = item;
    // El id del comprador viene del contrato (siempre presente); la entidad es opcional.
    const id = contrato.entidadId;
    if (!id) continue;
    const monto = montoDelContrato(contrato);
    if (monto <= 0) continue;
    montos.set(id, (montos.get(id) ?? 0) + monto);
    if (entidad?.nombre && !nombres.has(id)) nombres.set(id, entidad.nombre);
  }
  return { montos, nombres };
}

/**
 * Share del comprador top-1 por monto. Devuelve {share, id, nombre} o nulls.
 * Si total <= 0 o no hay compradores con monto -> nulls (no se penaliza por falta de dato).
 */
export function shareTopComprador(contratos: ContratoAgregable[]): {
  share: number | null;
  id: string | null;
  nombre: string | null;
} {
  const { montos, nombres } = montosPorComprador(contratos);
  let total = 0;
  let topId: string | null = null;
  let topMonto = 0;
  for (const [id, monto] of montos) {
    total += monto;
    if (monto > topMonto) {
      topMonto = monto;
      topId = id;
    }
  }
  if (total <= 0 || topId === null) {
    return { share: null, id: null, nombre: null };
  }
  return { share: topMonto / total, id: topId, nombre: nombres.get(topId) ?? null };
}

/**
 * Índice Herfindahl-Hirschman normalizado 0..1 sobre montos por comprador.
 * HHI = Σ (monto_i / monto_total)²  (1 = un solo comprador). Complementa al top-1
 * share: capta también el caso "2-3 compradores que se reparten todo".
 * null si no hay base (sin montos).
 */
export function hhiPorComprador(contratos: ContratoAgregable[]): number | null {
  const { montos } = montosPorComprador(contratos);
  let total = 0;
  for (const monto of montos.values()) total += monto;
  if (total <= 0) return null;
  let hhi = 0;
  for (const monto of montos.values()) {
    const cuota = monto / total;
    hhi += cuota * cuota;
  }
  return hhi;
}

// ---------- Cálculo de métricas (pura) ----------

export function calcularMetricas(
  entrada: EntradaPerfilProveedor,
): MetricasProveedor {
  const { proveedor, contratos } = entrada;
  const lista = contratos ?? [];

  const totalContratos = lista.length;

  // Postor único: base = contratos con numPostores != null (no se penaliza la falta de dato).
  let conDatoPostores = 0;
  let adjudicacionesPostorUnico = 0;
  for (const { contrato } of lista) {
    if (contrato.numPostores == null) continue;
    conDatoPostores += 1;
    if (contrato.numPostores === 1) adjudicacionesPostorUnico += 1;
  }
  const pctPostorUnico =
    conDatoPostores > 0
      ? (adjudicacionesPostorUnico / conDatoPostores) * 100
      : null;

  // Sobrecostos: reutiliza la lógica del motor por-contrato (misma fórmula/umbral),
  // contando cuántos contratos disparan. No duplica la fórmula: la importa.
  let numSobrecostos = 0;
  for (const { contrato } of lista) {
    if (banderaSobrecosto({ contrato }, UMBRAL_SOBRECOSTO) !== null) {
      numSobrecostos += 1;
    }
  }

  // Concentración por comprador (top-1 share + HHI).
  const top = shareTopComprador(lista);
  const hhiCompradores = hhiPorComprador(lista);
  const compradores = new Set<string>();
  for (const { contrato } of lista) {
    if (contrato.entidadId) compradores.add(contrato.entidadId);
  }

  // Obras paralizadas asociadas y plata expuesta.
  let obrasParalizadas = 0;
  let inversionParalizada = 0;
  for (const { obra } of lista) {
    if (obra?.estado === "paralizada") {
      obrasParalizadas += 1;
      inversionParalizada += obra.montoInversion ?? 0;
    }
  }

  return {
    totalContratos,
    adjudicacionesPostorUnico,
    pctPostorUnico,
    numSobrecostos,
    shareTopComprador: top.share,
    topCompradorId: top.id,
    topCompradorNombre: top.nombre,
    hhiCompradores,
    numCompradores: compradores.size,
    sancionado: proveedor?.sancionado === true,
    obrasParalizadas,
    inversionParalizada,
  };
}

// ---------- Banderas agregadas (mismo contrato: (m) => Bandera | null) ----------

/** 🚩 Concentración de adjudicaciones con postor único (a dedo). */
export function banderaConcentracionPostorUnico(
  m: MetricasProveedor,
): Bandera | null {
  if (m.pctPostorUnico == null) return null;
  const pct = m.pctPostorUnico;
  const fraccion = `(${m.adjudicacionesPostorUnico}/${m.totalContratos})`;
  if (pct >= UMBRAL_PCT_POSTOR_UNICO_ROJO) {
    return {
      codigo: "CONC_POSTOR_UNICO",
      peso: 3,
      detalle: `${pct.toFixed(0)}% de adjudicaciones ${fraccion} con postor único`,
    };
  }
  if (pct >= UMBRAL_PCT_POSTOR_UNICO_AMBAR) {
    return {
      codigo: "CONC_POSTOR_UNICO",
      peso: 1,
      detalle: `${pct.toFixed(0)}% de adjudicaciones ${fraccion} con postor único`,
    };
  }
  return null;
}

/** 🚩 Patrón de sobrecostos repetidos en los contratos del proveedor. */
export function banderaPatronSobrecostos(m: MetricasProveedor): Bandera | null {
  if (m.numSobrecostos >= UMBRAL_SOBRECOSTOS_ROJO) {
    return {
      codigo: "PATRON_SOBRECOSTOS",
      peso: 2,
      detalle: `Sobrecosto en ${m.numSobrecostos} de ${m.totalContratos} contratos`,
    };
  }
  if (m.numSobrecostos >= UMBRAL_SOBRECOSTOS_AMBAR) {
    return {
      codigo: "PATRON_SOBRECOSTOS",
      peso: 1,
      detalle: `Sobrecosto en ${m.numSobrecostos} de ${m.totalContratos} contratos`,
    };
  }
  return null;
}

/** 🚩 Captura: el proveedor depende de un solo comprador (top-1 share o HHI alto). */
export function banderaCapturaComprador(m: MetricasProveedor): Bandera | null {
  const share = m.shareTopComprador;
  const hhi = m.hhiCompradores;
  const nombre = m.topCompradorNombre ? ` (${m.topCompradorNombre})` : "";
  const rojoPorShare = share != null && share >= UMBRAL_SHARE_COMPRADOR_ROJO;
  const rojoPorHhi = hhi != null && hhi >= UMBRAL_HHI_ROJO;
  if (rojoPorShare || rojoPorHhi) {
    // Para el detalle priorizamos el share (más legible para periodista/ciudadano).
    const pct =
      share != null
        ? `${(share * 100).toFixed(0)}% de su facturación viene de 1 entidad${nombre}`
        : `Alta concentración de compradores (HHI ${(hhi as number).toFixed(2)})`;
    return { codigo: "CAPTURA_COMPRADOR", peso: 2, detalle: pct };
  }
  if (share != null && share >= UMBRAL_SHARE_COMPRADOR_AMBAR) {
    return {
      codigo: "CAPTURA_COMPRADOR",
      peso: 1,
      detalle: `${(share * 100).toFixed(0)}% de su facturación con un solo comprador${nombre}`,
    };
  }
  return null;
}

/** 🚩 Proveedor inhabilitado / sancionado (RNSSC). Señal legal directa. */
export function banderaProveedorSancionadoAgg(
  m: MetricasProveedor,
): Bandera | null {
  return m.sancionado
    ? {
        codigo: "PROVEEDOR_SANCIONADO",
        peso: 3,
        detalle: "Proveedor inhabilitado / sancionado (RNSSC)",
      }
    : null;
}

/** 🚩 Obras asociadas paralizadas (plata expuesta a nivel proveedor). */
export function banderaObrasParalizadasProveedor(
  m: MetricasProveedor,
): Bandera | null {
  if (m.obrasParalizadas <= 0) return null;
  const millones = (m.inversionParalizada / 1_000_000).toFixed(0);
  if (m.obrasParalizadas >= UMBRAL_OBRAS_PARALIZADAS_ROJO) {
    return {
      codigo: "OBRAS_PARALIZADAS_PROVEEDOR",
      peso: 2,
      detalle: `${m.obrasParalizadas} obras asociadas paralizadas (S/ ${millones} M)`,
    };
  }
  return {
    codigo: "OBRAS_PARALIZADAS_PROVEEDOR",
    peso: 1,
    detalle: `1 obra asociada paralizada (S/ ${millones} M)`,
  };
}

/** Todas las reglas agregadas en orden de evaluación. */
export const REGLAS_PROVEEDOR: Array<(m: MetricasProveedor) => Bandera | null> = [
  banderaConcentracionPostorUnico,
  banderaPatronSobrecostos,
  banderaCapturaComprador,
  banderaProveedorSancionadoAgg,
  banderaObrasParalizadasProveedor,
];

// ---------- Semáforo ----------

function colorSemaforo(puntaje: number, m: MetricasProveedor): ColorSemaforo {
  // Escalada dura: una sanción vigente es rojo por sí sola (riesgo legal directo).
  if (m.sancionado) return "rojo";
  if (puntaje >= PUNTAJE_ROJO) return "rojo"; // >= 6
  if (puntaje >= PUNTAJE_AMBAR) return "ambar"; // 3..5
  return "verde"; // 0..2
}

/** nivel (alto/medio/bajo) mapea 1:1 con color para compat con la UI existente. */
function nivelDeColor(color: ColorSemaforo): NivelRiesgo {
  if (color === "rojo") return "alto";
  if (color === "ambar") return "medio";
  return "bajo";
}

// ---------- Entry point (pura) ----------

/**
 * Perfila un RUC: agrega sus contratos, computa métricas y banderas, y devuelve
 * puntaje + semáforo. Función pura. Un proveedor sin contratos -> métricas en
 * 0/null, puntaje 0, verde (salvo `sancionado`, que escala a rojo).
 */
export function perfilRiesgoProveedor(
  entrada: EntradaPerfilProveedor,
): PerfilRiesgoProveedor {
  const metricas = calcularMetricas(entrada);
  const banderas = REGLAS_PROVEEDOR.map((regla) => regla(metricas)).filter(
    (b): b is Bandera => b !== null,
  );
  const puntaje = banderas.reduce((s, b) => s + b.peso, 0);
  const color = colorSemaforo(puntaje, metricas);
  return {
    ruc: entrada.proveedor?.ruc ?? "",
    razonSocial: entrada.proveedor?.razonSocial ?? "",
    puntaje,
    color,
    nivel: nivelDeColor(color),
    metricas,
    banderas,
  };
}
