/** Helpers de presentación compartidos (cliente). */

export function money(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000) return `S/ ${(n / 1_000_000).toFixed(1)} M`;
  return `S/ ${n.toLocaleString("es-PE")}`;
}

export const ESTADO_LABEL: Record<string, string> = {
  paralizada: "Paralizada",
  en_ejecucion: "En ejecución",
  concluida: "Concluida",
  desconocido: "Estado desconocido",
};
