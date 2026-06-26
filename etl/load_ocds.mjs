#!/usr/bin/env node
/**
 * load_ocds.mjs — Lupa Fiscal · ETL REAL
 *
 * Carga el OCDS REAL del OECE/SEACE (publicación 135, OCID ocds-dgv273) a Postgres.
 * Mapeo verificado contra la data real (ver criterios del PROMPT MAESTRO):
 *   - region/departamento  -> parties[buyer].address.DEPARTMENT  (NO .region = provincia)
 *   - proveedor RUC        -> award.suppliers[0].id sin prefijo "PE-RUC-"
 *   - estado/meses/avance  -> NO existen en OCDS -> null / "desconocido" (requiere INFOBRAS)
 *
 * Idempotente: TRUNCATE + carga por lotes. Sin libs nuevas (solo pg + Node).
 *
 * Uso:
 *   DATABASE_URL="postgres://lupa:lupa@localhost:5433/lupa?sslmode=disable" \
 *     node etl/load_ocds.mjs "C:/Users/Lenovo/Downloads/peru_oece_bulk_2025.jsonl.gz"
 */
import fs from "node:fs";
import zlib from "node:zlib";
import readline from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Centroides aproximados por departamento (geo referencial, para el mapa).
const CENTROIDES = {
  AMAZONAS: [-5.20, -78.00], ANCASH: [-9.53, -77.53], APURIMAC: [-13.63, -72.88],
  AREQUIPA: [-16.40, -71.54], AYACUCHO: [-13.16, -74.22], CAJAMARCA: [-7.16, -78.51],
  CALLAO: [-12.06, -77.13], CUSCO: [-13.53, -71.97], HUANCAVELICA: [-12.79, -74.97],
  HUANUCO: [-9.93, -76.24], ICA: [-14.07, -75.73], JUNIN: [-12.07, -75.21],
  "LA LIBERTAD": [-8.11, -79.03], LAMBAYEQUE: [-6.77, -79.84], LIMA: [-12.05, -77.04],
  LORETO: [-3.75, -73.25], "MADRE DE DIOS": [-12.59, -69.18], MOQUEGUA: [-17.19, -70.93],
  PASCO: [-10.68, -76.26], PIURA: [-5.19, -80.63], PUNO: [-15.84, -70.02],
  "SAN MARTIN": [-6.49, -76.37], TACNA: [-18.01, -70.25], TUMBES: [-3.57, -80.46],
  UCAYALI: [-8.38, -74.55],
};

function hash(s) { let h = 5381; for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0; return Math.abs(h); }
function jitter(seed, amp = 0.04) { return ((seed % 1000) / 1000 - 0.5) * amp; }

// ----- Geocodificación por ubigeo (INEI): distrito -> provincia -> departamento -----
const norm = (s) => (s || "").toString().normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const GEO_DIST = new Map(); // dep|prov|dist -> [lat,lng]
const GEO_PROV = new Map(); // dep|prov -> [sumLat,sumLng,n]
const GEO_DEP = new Map();  // dep -> [sumLat,sumLng,n]
(function cargarUbigeo() {
  const p = path.join(root, "data", "ubigeo.csv");
  if (!fs.existsSync(p)) { console.error("! data/ubigeo.csv no encontrado; uso centroides de departamento"); return; }
  const lineas = fs.readFileSync(p, "utf8").split(/\r?\n/);
  for (let i = 1; i < lineas.length; i++) {
    const c = lineas[i].split(",");
    if (c.length < 16) continue;
    const dep = norm(c[2]), prov = norm(c[3]), dist = norm(c[4]);
    const lat = parseFloat(c[14]), lng = parseFloat(c[15]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    GEO_DIST.set(`${dep}|${prov}|${dist}`, [lat, lng]);
    const kp = `${dep}|${prov}`, ap = GEO_PROV.get(kp) || [0, 0, 0];
    ap[0] += lat; ap[1] += lng; ap[2]++; GEO_PROV.set(kp, ap);
    const ad = GEO_DEP.get(dep) || [0, 0, 0];
    ad[0] += lat; ad[1] += lng; ad[2]++; GEO_DEP.set(dep, ad);
  }
  console.error(`ubigeo: ${GEO_DIST.size} distritos cargados`);
})();
function geocode(department, provincia, distrito) {
  const dep = norm(department), prov = norm(provincia), dist = norm(distrito);
  const d = GEO_DIST.get(`${dep}|${prov}|${dist}`);
  if (d) return { c: d, n: "distrito" };
  const pv = GEO_PROV.get(`${dep}|${prov}`);
  if (pv && pv[2] > 0) return { c: [pv[0] / pv[2], pv[1] / pv[2]], n: "provincia" };
  const dp = GEO_DEP.get(dep);
  if (dp && dp[2] > 0) return { c: [dp[0] / dp[2], dp[1] / dp[2]], n: "departamento" };
  return { c: CENTROIDES[dep] || [-9.19, -75.0], n: "fallback" };
}

function nivelGobierno(nombre) {
  const n = (nombre || "").toUpperCase();
  if (/MUNICIPALIDAD|DISTRITAL|PROVINCIAL/.test(n)) return "local";
  if (/GOBIERNO REGIONAL|\bREGION\b|REGIONAL/.test(n)) return "regional";
  return "nacional";
}

const party = (cr, role) => (cr.parties || []).find((p) => (p.roles || []).includes(role));
const activeAward = (cr) => (cr.awards || []).find((a) => a.status === "active") || (cr.awards || [])[0];
const stripRuc = (id) => (id || "").replace(/^PE-?RUC-?/i, "").trim();

function mapProceso(cr) {
  const buyer = party(cr, "buyer");
  const nombreEnt = cr.buyer?.name || buyer?.name || "(sin entidad)";
  const addr = buyer?.address || cr.tender?.procuringEntity?.address || {};
  const department = (addr.department || "DESCONOCIDA").toUpperCase();

  const rucEnt =
    stripRuc(buyer?.id) ||
    stripRuc((buyer?.additionalIdentifiers || []).find((x) => x.scheme === "PE-RUC")?.id) ||
    "";
  const entidadId = rucEnt || "ENT-" + hash(nombreEnt);

  const aw = activeAward(cr);
  const sup = aw?.suppliers?.[0] || null;
  const rucProv = sup ? stripRuc(sup.id) : null;
  // Consorcios traen códigos cortos (no RUC de 11 díg). Igual se guardan como proveedor.
  const proveedorId = rucProv || null;

  const geo = geocode(addr.department, addr.region, addr.locality);
  const [glat, glng] = geo.c;
  const seed = hash(cr.ocid || nombreEnt);

  return {
    entidad: { id: entidadId, nombre: nombreEnt, nivel: nivelGobierno(nombreEnt), region: department, ubigeo: addr.locality || null },
    proveedor: proveedorId ? { id: proveedorId, ruc: rucProv, razon: sup.name || "(sin razón social)" } : null,
    contrato: {
      id: cr.ocid,
      ocid: cr.ocid,
      cui: cr.planning?.budget?.projectID ?? null, // CUI (Código Único de Inversiones) -> llave a INFOBRAS
      valorRef: cr.tender?.value?.amount ?? null,
      montoAdj: aw?.value?.amount ?? null,
      postores: cr.tender?.numberOfTenderers ?? null,
      entidadId,
      proveedorId,
    },
    obra: {
      id: cr.ocid,
      nombre: cr.tender?.title || cr.tender?.description || "(sin título)",
      monto: aw?.value?.amount ?? cr.tender?.value?.amount ?? null,
      categoria: cr.tender?.mainProcurementCategory ?? null, // works | goods | services
      lat: glat + jitter(seed), lng: glng + jitter(seed >> 3),
      entidadId,
      contratoId: cr.ocid,
    },
  };
}

async function flush(client, sql, rows, nCols, batch = 800) {
  for (let i = 0; i < rows.length; i += batch) {
    const lote = rows.slice(i, i + batch);
    const ph = lote
      .map((_, r) => "(" + Array.from({ length: nCols }, (__, c) => `$${r * nCols + c + 1}`).join(",") + ")")
      .join(",");
    await client.query(sql.replace("__VALUES__", ph), lote.flat());
  }
}

async function main() {
  const file = process.argv[2];
  const cs = process.env.DATABASE_URL;
  if (!file || !cs) { console.error("Uso: DATABASE_URL=... node etl/load_ocds.mjs <archivo.jsonl.gz>"); process.exit(1); }

  const client = new pg.Client({ connectionString: cs, ssl: /sslmode=disable|localhost|127\.0\.0\.1/.test(cs) ? false : { rejectUnauthorized: false } });
  await client.connect();
  await client.query(fs.readFileSync(path.join(root, "src", "infrastructure", "db", "schema.sql"), "utf8"));
  await client.query("TRUNCATE obra, contrato, proveedor, entidad RESTART IDENTITY CASCADE");

  const entidades = new Map(), proveedores = new Map(), contratos = [], obras = [];
  let total = 0, malas = 0;

  let input = fs.createReadStream(file);
  if (file.endsWith(".gz")) input = input.pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  for await (const line of rl) {
    if (!line.trim()) continue;
    let cr;
    try { const o = JSON.parse(line); cr = o.compiledRelease || o.records?.[0]?.compiledRelease || o; }
    catch { malas++; continue; }
    if (!cr.ocid) { malas++; continue; }
    const m = mapProceso(cr);
    entidades.set(m.entidad.id, m.entidad);
    if (m.proveedor) proveedores.set(m.proveedor.id, m.proveedor);
    contratos.push(m.contrato);
    obras.push(m.obra);
    total++;
    if (total % 20000 === 0) console.error("...leidos", total);
  }
  console.error(`Leidos ${total} (malformados ${malas}). Insertando: ${entidades.size} entidades, ${proveedores.size} proveedores, ${contratos.length} contratos/obras...`);

  await flush(client, "INSERT INTO entidad (id,nombre,nivel_gobierno,region,ubigeo) VALUES __VALUES__ ON CONFLICT (id) DO NOTHING",
    [...entidades.values()].map((e) => [e.id, e.nombre, e.nivel, e.region, e.ubigeo]), 5);
  await flush(client, "INSERT INTO proveedor (id,ruc,razon_social,sancionado,num_adjudicaciones) VALUES __VALUES__ ON CONFLICT (id) DO NOTHING",
    [...proveedores.values()].map((p) => [p.id, p.ruc, p.razon, false, 0]), 5);
  await flush(client, "INSERT INTO contrato (id,ocid,cui,valor_referencial,monto_adjudicado,num_postores,entidad_id,proveedor_id) VALUES __VALUES__ ON CONFLICT (id) DO NOTHING",
    contratos.map((c) => [c.id, c.ocid, c.cui, c.valorRef, c.montoAdj, c.postores, c.entidadId, c.proveedorId]), 8);
  await flush(client, "INSERT INTO obra (id,nombre,monto_inversion,estado,meses_parada,avance_fisico,categoria,lat,lng,entidad_id,contrato_id) VALUES __VALUES__ ON CONFLICT (id) DO NOTHING",
    obras.map((o) => [o.id, o.nombre, o.monto, "desconocido", null, null, o.categoria, o.lat, o.lng, o.entidadId, o.contratoId]), 11);

  // num_adjudicaciones (proveedor recurrente) — conteo global real.
  await client.query(`UPDATE proveedor p SET num_adjudicaciones = sub.c FROM (SELECT proveedor_id, COUNT(*) c FROM contrato WHERE proveedor_id IS NOT NULL GROUP BY proveedor_id) sub WHERE p.id = sub.proveedor_id`);

  const r = await client.query("SELECT (SELECT count(*) FROM entidad) e,(SELECT count(*) FROM proveedor) p,(SELECT count(*) FROM contrato) c,(SELECT count(*) FROM obra) o");
  console.error("✓ CARGA REAL OK:", r.rows[0]);
  await client.end();
}
main().catch((e) => { console.error(e); process.exit(1); });
