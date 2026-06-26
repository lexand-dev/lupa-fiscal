// migrate_supabase.mjs — Lupa Fiscal
// Migra la BD local (Docker) a Supabase usando la Management API (query), sin
// requerir el password de la DB. Lee las filas ya cargadas en el Postgres local
// y las inserta por lotes en Supabase. Idempotente (TRUNCATE + ON CONFLICT).
//
// Uso: SB_PAT=<pat> [SB_REF=<ref>] [LOCAL_DB=<url>] node etl/migrate_supabase.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAT = process.env.SB_PAT;
const REF = process.env.SB_REF || "vmkifkbemjicxsjqyhwl";
const LOCAL = process.env.LOCAL_DB || "postgres://lupa:lupa@localhost:5433/lupa?sslmode=disable";
const API = `https://api.supabase.com/v1/projects/${REF}/database/query`;

async function q(sql, tries = 5) {
  for (let i = 0; i < tries; i++) {
    const r = await fetch(API, {
      method: "POST",
      headers: { Authorization: `Bearer ${PAT}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query: sql }),
    });
    if (r.status === 200 || r.status === 201) return r.json().catch(() => null);
    if (r.status === 429 || r.status >= 500) { await new Promise((s) => setTimeout(s, 3000 * (i + 1))); continue; }
    throw new Error(`API ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }
  throw new Error("agotados los reintentos (rate limit)");
}

const lit = (v, t) => {
  if (v === null || v === undefined) return "NULL";
  if (t === "b") return v ? "TRUE" : "FALSE";
  if (t === "n") { const n = Number(v); return Number.isFinite(n) ? String(n) : "NULL"; }
  return "'" + String(v).replace(/'/g, "''") + "'";
};

const TABLES = {
  entidad: [["id", "t"], ["nombre", "t"], ["nivel_gobierno", "t"], ["region", "t"], ["ubigeo", "t"]],
  proveedor: [["id", "t"], ["ruc", "t"], ["razon_social", "t"], ["sancionado", "b"], ["num_adjudicaciones", "n"]],
  contrato: [["id", "t"], ["ocid", "t"], ["cui", "t"], ["valor_referencial", "n"], ["monto_adjudicado", "n"], ["num_postores", "n"], ["entidad_id", "t"], ["proveedor_id", "t"]],
  obra: [["id", "t"], ["nombre", "t"], ["monto_inversion", "n"], ["estado", "t"], ["meses_parada", "n"], ["avance_fisico", "n"], ["categoria", "t"], ["lat", "n"], ["lng", "n"], ["entidad_id", "t"], ["contrato_id", "t"]],
};

async function main() {
  if (!PAT) throw new Error("falta SB_PAT");
  console.error("1) aplicando schema en Supabase...");
  await q(fs.readFileSync(path.join(root, "src/infrastructure/db/schema.sql"), "utf8"));
  console.error("2) truncando...");
  await q("TRUNCATE obra, contrato, proveedor, entidad RESTART IDENTITY CASCADE");

  const local = new pg.Client({ connectionString: LOCAL, ssl: false });
  await local.connect();
  const BATCH = 1000;
  for (const [tabla, cols] of Object.entries(TABLES)) {
    const colNames = cols.map((c) => c[0]).join(",");
    const { rows } = await local.query(`SELECT ${colNames} FROM ${tabla}`);
    console.error(`3) ${tabla}: ${rows.length} filas -> Supabase`);
    for (let i = 0; i < rows.length; i += BATCH) {
      const lote = rows.slice(i, i + BATCH);
      const vals = lote.map((r) => "(" + cols.map(([c, t]) => lit(r[c], t)).join(",") + ")").join(",");
      await q(`INSERT INTO ${tabla} (${colNames}) VALUES ${vals} ON CONFLICT (id) DO NOTHING`);
      if (i % (BATCH * 10) === 0 && i > 0) console.error(`   ${tabla} ${i}/${rows.length}`);
    }
  }
  await local.end();
  // recomputa num_adjudicaciones por si acaso
  await q(`UPDATE proveedor p SET num_adjudicaciones = sub.c FROM (SELECT proveedor_id, COUNT(*) c FROM contrato WHERE proveedor_id IS NOT NULL GROUP BY proveedor_id) sub WHERE p.id = sub.proveedor_id`);
  const r = await q("SELECT (SELECT count(*) FROM entidad) e,(SELECT count(*) FROM proveedor) p,(SELECT count(*) FROM contrato) c,(SELECT count(*) FROM obra) o");
  console.error("✓ SUPABASE CARGADO:", JSON.stringify(r));
}
main().catch((e) => { console.error(e); process.exit(1); });
