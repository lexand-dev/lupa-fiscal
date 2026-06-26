/**
 * infrastructure/repositories/json-obras-repository.ts — Lupa Fiscal
 *
 * Adaptador que sirve los datos desde el seed precargado (data/seed.json).
 * Hace que la demo funcione SIN una DB externa (ADR-0001: demo estable).
 * Hace el mismo "join" en memoria que haría el SQL.
 */
import type { Contrato, Entidad, Obra, Proveedor } from "@/domain/entities";
import type {
  ObraConContexto,
  ObrasRepository,
  RegionResumen,
} from "@/application/ports";
import seed from "../../../data/seed.json";

interface SeedData {
  entidades: Entidad[];
  proveedores: Proveedor[];
  contratos: Contrato[];
  obras: Obra[];
}

const data = seed as unknown as SeedData;

const entidadById = new Map(data.entidades.map((e) => [e.id, e]));
const proveedorById = new Map(data.proveedores.map((p) => [p.id, p]));
const contratoById = new Map(data.contratos.map((c) => [c.id, c]));
const proveedorByRuc = new Map(data.proveedores.map((p) => [p.ruc, p]));

function contextoDe(obra: Obra): ObraConContexto {
  const entidad = entidadById.get(obra.entidadId)!;
  const contrato = obra.contratoId ? contratoById.get(obra.contratoId) ?? null : null;
  const proveedor =
    contrato?.proveedorId ? proveedorById.get(contrato.proveedorId) ?? null : null;
  return { obra, entidad, contrato, proveedor };
}

export class JsonObrasRepository implements ObrasRepository {
  async listarRegiones(): Promise<RegionResumen[]> {
    const acc = new Map<string, RegionResumen>();
    for (const obra of data.obras) {
      const region = entidadById.get(obra.entidadId)?.region ?? "DESCONOCIDA";
      const r =
        acc.get(region) ??
        { region, totalObras: 0, totalParalizadas: 0, inversionCongelada: 0 };
      r.totalObras += 1;
      if (obra.estado === "paralizada") {
        r.totalParalizadas += 1;
        r.inversionCongelada += obra.montoInversion ?? 0;
      }
      acc.set(region, r);
    }
    return [...acc.values()];
  }

  async buscarPorRegion(region: string, categoria?: string | null): Promise<ObraConContexto[]> {
    return data.obras
      .filter(
        (o) =>
          entidadById.get(o.entidadId)?.region === region &&
          (!categoria || o.categoria === categoria),
      )
      .map(contextoDe);
  }

  async obtenerObra(id: string): Promise<ObraConContexto | null> {
    const obra = data.obras.find((o) => o.id === id);
    return obra ? contextoDe(obra) : null;
  }

  async buscarContratosPorRuc(ruc: string): Promise<ObraConContexto[]> {
    const proveedor = proveedorByRuc.get(ruc);
    if (!proveedor) return [];
    // Contratos del proveedor -> obras de esos contratos (mismo join en memoria).
    const contratosDelProveedor = new Set(
      data.contratos
        .filter((c) => c.proveedorId === proveedor.id)
        .map((c) => c.id),
    );
    return data.obras
      .filter((o) => o.contratoId != null && contratosDelProveedor.has(o.contratoId))
      .map(contextoDe);
  }
}
