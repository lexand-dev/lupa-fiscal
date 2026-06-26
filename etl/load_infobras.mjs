#!/usr/bin/env node
/**
 * load_infobras.mjs — Lupa Fiscal · ETL INFOBRAS (FASE 2)
 *
 * Carga el DataSet de Obras Públicas de INFOBRAS (Contraloría) y lo cruza con
 * OCDS por CUI. INFOBRAS aporta lo que OCDS NO tiene: estado real (paralizada),
 * avance físico y costo. El cruce conecta "obra parada" ↔ "contrato que la pagó".
 *
 * DESCARGA (hazla por NAVEGADOR — el endpoint corta conexiones largas por curl):
 *   1) Abre https://infobras.contraloria.gob.pe/InfobrasWeb/DataSets
 *   2) Descarga "Obras Públicas" (.xlsx, ~56 MB)
 *   3) Guárdalo como: D:/lupa-fiscal/data/infobras-obras.xlsx
 *
 * USO:
 *   DATABASE_URL="postgres://lupa:lupa@localhost:5433/lupa?sslmode=disable" \
 *     node etl/load_infobras.mjs data/infobras-obras.xlsx
 *
 * Es TOLERANTE a los nombres de columna: imprime las columnas detectadas para
 * que ajustes si tu archivo difiere.
 */
import path from "node:path";
import { fileURLToPath } from "node:url";
import xlsx from "xlsx";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const norm = (s) =>
  (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();

/** Getter por nombre de columna (case/acento-insensitive, por subcadena). */
function getter(row) {
  const map = {};
  for (const k of Object.keys(row)) map[norm(k)] = row[k];
  return (...patrones) => {
    for (const p of patrones) {
      const hit = Object.keys(map).find((k) => k.includes(p));
      if (hit && map[hit] != null && map[hit] !== "") return map[hit];
    }
    return null;
  };
}

/** Normaliza el estado de INFOBRAS al enum del modelo. */
function estadoNorm(v) {
  const s = norm(v);
  if (/paraliz/.test(s)) return "paralizada";
  if (/ejecu/.test(s)) return "en_ejecucion";
  if (/conclu|finaliz|culmin|liquid|termin/.test(s)) return "concluida";
  return "desconocido";
}
const numero = (v) => {
  const n = Number(String(v ?? "").replace(/[^0-9.\-]/g, ""));
  return Number.isFinite(n) && n !== 0 ? n : null;
};

async function main() {
  const file = process.argv[2];
  const cs = process.env.DATABASE_URL;
  if (!file || !cs) {
    console.error("Uso: DATABASE_URL=... node etl/load_infobras.mjs data/infobras-obras.xlsx");
    process.exit(1);
  }
  const abs = path.isAbsolute(file) ? file : path.join(root, file);
  console.error("Leyendo", abs, "...");
  const wb = xlsx.readFile(abs, { cellDates: false });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const rows = xlsx.utils.sheet_to_json(ws, { defval: null });
  if (!rows.length) { console.error("Hoja vacía."); process.exit(1); }
  console.error(`Filas: ${rows.length}`);
  console.error("Columnas detectadas:", JSON.stringify(Object.keys(rows[0])));

  const norm0 = getter(rows[0]);
  // Diagnóstico de detección (no falla si algo no está).
  console.error("Detección → codigo:", norm0("codigo infobras", "codigo de infobra", "cod infobras") != null,
    "| cui:", norm0("cui", "codigo unico", "snip") != null,
    "| estado:", norm0("estado", "situacion") != null);

  const registros = rows.map((r) => {
    const g = getter(r);
    return {
      codigo: String(g("codigo infobras", "cod infobras", "codigo de la obra", "id obra", "codigo") ?? ""),
      cui: g("cui", "codigo unico de inversion", "codigo unico", "snip"),
      nombre: g("nombre de la obra", "nombre obra", "nombre", "denominacion"),
      estadoRaw: g("estado de la obra", "estado", "situacion"),
      costo: numero(g("costo de la obra", "costo total", "costo", "monto de inversion", "monto")),
      avance: numero(g("avance fisico", "avance %", "avance", "porcentaje de avance")),
      dep: g("departamento", "dpto"),
      prov: g("provincia"),
      dist: g("distrito"),
      entidad: g("entidad", "entidad publica", "unidad ejecutora"),
    };
  }).filter((x) => x.codigo);

  const client = new pg.Client({ connectionString: cs, ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(cs) ? false : { rejectUnauthorized: false } });
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS obra_infobras (
      codigo_infobras TEXT PRIMARY KEY, cui TEXT, nombre TEXT,
      estado_raw TEXT, estado TEXT, costo NUMERIC, avance_fisico NUMERIC,
      departamento TEXT, provincia TEXT, distrito TEXT, entidad TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_infobras_cui ON obra_infobras(cui);
    TRUNCATE obra_infobras;
  `);

  // Inserta por lotes.
  const cols = 11, batch = 500;
  for (let i = 0; i < registros.length; i += batch) {
    const lote = registros.slice(i, i + batch);
    const ph = lote.map((_, r) => "(" + Array.from({ length: cols }, (__, c) => `$${r * cols + c + 1}`).join(",") + ")").join(",");
    const vals = lote.flatMap((x) => [x.codigo, x.cui, x.nombre, x.estadoRaw, estadoNorm(x.estadoRaw), x.costo, x.avance, x.dep, x.prov, x.dist, x.entidad]);
    await client.query(`INSERT INTO obra_infobras (codigo_infobras,cui,nombre,estado_raw,estado,costo,avance_fisico,departamento,provincia,distrito,entidad) VALUES ${ph} ON CONFLICT (codigo_infobras) DO NOTHING`, vals);
  }

  // CRUCE: lleva estado/avance reales a las obras OCDS por CUI.
  const upd = await client.query(`
    UPDATE obra o
    SET estado = i.estado, avance_fisico = i.avance_fisico
    FROM contrato c, obra_infobras i
    WHERE o.contrato_id = c.id AND c.cui IS NOT NULL AND c.cui = i.cui
  `);

  const r = await client.query(`
    SELECT
      (SELECT count(*) FROM obra_infobras) infobras,
      (SELECT count(*) FROM obra_infobras WHERE estado='paralizada') paralizadas,
      (SELECT count(*) FROM obra WHERE estado <> 'desconocido') obras_ocds_enriquecidas
  `);
  console.error("✓ INFOBRAS cargado:", JSON.stringify(r.rows[0]), "| filas OCDS actualizadas por CUI:", upd.rowCount);
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
