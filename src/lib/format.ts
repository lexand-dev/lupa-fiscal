/** Helpers de presentación compartidos (cliente). */

export function money(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(1)} M`;
  return `S/ ${n.toLocaleString("es-PE")}`;
}

/** Versión corta para cifras grandes (headlines). */
export function moneyCorto(n: number | null | undefined): string {
  if (n == null) return "—";
  const a = Math.abs(n);
  if (a >= 1_000_000_000) return `S/ ${(n / 1_000_000_000).toFixed(1)} B`;
  if (a >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(a >= 10_000_000 ? 0 : 1)} M`;
  if (a >= 1_000) return `S/ ${(n / 1_000).toFixed(0)} K`;
  return `S/ ${n.toLocaleString("es-PE")}`;
}

export const ESTADO_LABEL: Record<string, string> = {
  paralizada: "Paralizada",
  en_ejecucion: "En ejecución",
  concluida: "Concluida",
  desconocido: "Sin dato (requiere INFOBRAS)",
};

/** Color del semáforo por nivel de riesgo (usa las variables del tema). */
export function colorNivel(nivel: string): string {
  if (nivel === "alto") return "var(--seal)";
  if (nivel === "medio") return "var(--warn)";
  return "var(--verify)";
}

export function etiquetaNivel(nivel: string): string {
  if (nivel === "alto") return "Alto";
  if (nivel === "medio") return "Medio";
  return "Bajo";
}

/**
 * Etiqueta correcta del identificador del proveedor.
 * En OCDS los CONSORCIOS traen un código interno SEACE (no RUC de 11 dígitos),
 * así que NO se debe mostrar como "RUC". 11 dígitos = RUC real; si no, consorcio.
 */
export function idProveedor(id: string | null | undefined): string {
  if (!id) return "—";
  return /^\d{11}$/.test(id) ? `RUC ${id}` : `Consorcio · cód. SEACE ${id}`;
}

/** Categoría OCDS en lenguaje simple. */
export function tipoObra(categoria: string | null | undefined): string {
  if (categoria === "works") return "Obra pública";
  if (categoria === "goods") return "Compra de bienes";
  if (categoria === "services") return "Servicio";
  return "Contratación";
}

/** Nombre amigable de cada bandera (para usuarios no técnicos). */
const NOMBRE_BANDERA: Record<string, string> = {
  POSTOR_UNICO: "Sin competencia (un solo postor)",
  SOBRECOSTO: "Pagó más de lo estimado (sobrecosto)",
  PROVEEDOR_RECURRENTE: "Proveedor que gana seguido con esta entidad",
  PROVEEDOR_SANCIONADO: "Empresa sancionada / inhabilitada",
  OBRA_ATRAPADA: "Obra parada con plata ya invertida",
  CONC_POSTOR_UNICO: "Gana casi siempre sin competencia",
  PATRON_SOBRECOSTOS: "Patrón de sobrecostos repetidos",
  CAPTURA_COMPRADOR: "Depende de una sola entidad compradora",
  OBRAS_PARALIZADAS_PROVEEDOR: "Tiene obras paralizadas asociadas",
};
export function nombreBandera(codigo: string): string {
  return NOMBRE_BANDERA[codigo] ?? codigo.replace(/_/g, " ").toLowerCase();
}
