/**
 * infrastructure/repositories/pg-obras-repository.ts — Lupa Fiscal
 * Adaptador PostgreSQL del puerto ObrasRepository.
 */
import type { EstadoObra, NivelGobierno } from "@/domain/entities";
import type {
  ObraConContexto,
  ObrasRepository,
  RegionResumen,
} from "@/application/ports";
import { getPool } from "@/infrastructure/db/client";

// El driver `pg` devuelve filas sin tipos; usamos `any` acotado a este adaptador.
type Row = Record<string, any>;

function num(v: unknown): number | null {
  return v === null || v === undefined ? null : Number(v);
}

function mapRow(row: Row): ObraConContexto {
  const contrato = row.c_id
    ? {
        id: row.c_id,
        ocid: row.c_ocid,
        cui: row.c_cui ?? null,
        valorReferencial: num(row.c_valor_referencial),
        montoAdjudicado: num(row.c_monto_adjudicado),
        numPostores: num(row.c_num_postores),
        entidadId: row.c_entidad_id,
        proveedorId: row.c_proveedor_id ?? null,
      }
    : null;
  const proveedor = row.p_id
    ? {
        id: row.p_id,
        ruc: row.p_ruc,
        razonSocial: row.p_razon_social,
        sancionado: Boolean(row.p_sancionado),
        numAdjudicaciones: Number(row.p_num_adjudicaciones ?? 0),
      }
    : null;
  return {
    obra: {
      id: row.o_id,
      nombre: row.o_nombre,
      montoInversion: num(row.o_monto_inversion),
      estado: row.o_estado as EstadoObra,
      mesesParada: num(row.o_meses_parada),
      avanceFisico: num(row.o_avance_fisico),
      categoria: row.o_categoria ?? null,
      lat: num(row.o_lat),
      lng: num(row.o_lng),
      entidadId: row.o_entidad_id,
      contratoId: row.o_contrato_id ?? null,
    },
    entidad: {
      id: row.e_id,
      nombre: row.e_nombre,
      nivelGobierno: row.e_nivel_gobierno as NivelGobierno,
      region: row.e_region,
      ubigeo: row.e_ubigeo,
    },
    contrato,
    proveedor,
  };
}

const SELECT_OBRA = `
  SELECT
    o.id o_id, o.nombre o_nombre, o.monto_inversion o_monto_inversion,
    o.estado o_estado, o.meses_parada o_meses_parada, o.avance_fisico o_avance_fisico,
    o.categoria o_categoria, o.lat o_lat, o.lng o_lng, o.entidad_id o_entidad_id, o.contrato_id o_contrato_id,
    e.id e_id, e.nombre e_nombre, e.nivel_gobierno e_nivel_gobierno,
    e.region e_region, e.ubigeo e_ubigeo,
    c.id c_id, c.ocid c_ocid, c.cui c_cui, c.valor_referencial c_valor_referencial,
    c.monto_adjudicado c_monto_adjudicado, c.num_postores c_num_postores,
    c.entidad_id c_entidad_id, c.proveedor_id c_proveedor_id,
    p.id p_id, p.ruc p_ruc, p.razon_social p_razon_social,
    p.sancionado p_sancionado, p.num_adjudicaciones p_num_adjudicaciones
  FROM obra o
  JOIN entidad e ON e.id = o.entidad_id
  LEFT JOIN contrato c ON c.id = o.contrato_id
  LEFT JOIN proveedor p ON p.id = c.proveedor_id
`;

export class PgObrasRepository implements ObrasRepository {
  async listarRegiones(): Promise<RegionResumen[]> {
    const { rows } = await getPool().query(`
      SELECT e.region AS region,
             COUNT(o.id) AS total_obras,
             COUNT(o.id) FILTER (WHERE o.estado = 'paralizada') AS total_paralizadas,
             COALESCE(SUM(o.monto_inversion) FILTER (WHERE o.estado = 'paralizada'), 0) AS inversion_congelada
      FROM obra o
      JOIN entidad e ON e.id = o.entidad_id
      GROUP BY e.region
    `);
    return rows.map((r: Row) => ({
      region: r.region,
      totalObras: Number(r.total_obras),
      totalParalizadas: Number(r.total_paralizadas),
      inversionCongelada: Number(r.inversion_congelada),
    }));
  }

  async buscarPorRegion(region: string, categoria?: string | null): Promise<ObraConContexto[]> {
    const params: unknown[] = [region];
    let sql = `${SELECT_OBRA} WHERE e.region = $1`;
    if (categoria) {
      params.push(categoria);
      sql += ` AND o.categoria = $2`;
    }
    sql += ` ORDER BY o.monto_inversion DESC NULLS LAST LIMIT 300`;
    const { rows } = await getPool().query(sql, params);
    return rows.map(mapRow);
  }

  async obtenerObra(id: string): Promise<ObraConContexto | null> {
    const { rows } = await getPool().query(`${SELECT_OBRA} WHERE o.id = $1`, [id]);
    return rows.length ? mapRow(rows[0]) : null;
  }

  async buscarContratosPorRuc(ruc: string): Promise<ObraConContexto[]> {
    // Las obras cuyo contrato fue adjudicado al proveedor con ese RUC.
    // El LEFT JOIN a proveedor deja p.ruc NULL en obras sin proveedor, así que
    // el filtro por p.ruc descarta correctamente esas filas.
    const { rows } = await getPool().query(
      `${SELECT_OBRA} WHERE p.ruc = $1`,
      [ruc],
    );
    return rows.map(mapRow);
  }
}
