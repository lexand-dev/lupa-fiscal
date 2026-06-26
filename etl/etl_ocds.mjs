#!/usr/bin/env node
/**
 * etl_ocds.mjs — Lupa Fiscal
 * Lee un archivo OCDS (.jsonl o .jsonl.gz), extrae los campos clave de cada
 * proceso de contratación y aplica el motor de señales de riesgo aplicables a
 * contrataciones (postor único, sobrecosto, proveedor recurrente).
 *
 * Las banderas que dependen de OTRAS fuentes (proveedor sancionado → RNSSC/OSCE;
 * obra atrapada → INFOBRAS) viven en el dominio TypeScript (src/domain) y se
 * calculan cuando esos datos se cruzan. OCDS por sí solo no trae obras ni
 * sanciones, ni publica amendments/milestones (de ahí que el sobrecosto se
 * calcule adjudicado vs. valor referencial).
 *
 * Uso:
 *   node etl/etl_ocds.mjs etl/sample.jsonl
 *   node etl/etl_ocds.mjs data/2025.jsonl.gz     (descarga real, descomprime al vuelo)
 *
 * Descarga real (en TU máquina, sin API key):
 *   curl -L -o data/2025.jsonl.gz \
 *     "https://data.open-contracting.org/en/publication/135/download?name=2025.jsonl.gz"
 */
import fs from "node:fs";
import zlib from "node:zlib";
import readline from "node:readline";
import { pathToFileURL } from "node:url";

// ---------- Extracción tolerante (los datos OCDS tienen huecos) ----------
function getRegion(cr) {
  const buyerParty = (cr.parties || []).find((p) => (p.roles || []).includes("buyer"));
  return (
    buyerParty?.address?.region ||
    cr.tender?.procuringEntity?.address?.region ||
    "DESCONOCIDA"
  );
}
function getTenderValue(cr) {
  return cr.tender?.value?.amount ?? null;
}
function getAwardValue(cr) {
  const awards = cr.awards || [];
  const active = awards.find((a) => a.status === "active") || awards[0];
  return active?.value?.amount ?? null;
}
function getSupplier(cr) {
  const awards = cr.awards || [];
  const active = awards.find((a) => a.status === "active") || awards[0];
  return active?.suppliers?.[0] ?? null;
}

function normalize(line) {
  const obj = JSON.parse(line);
  const cr = obj.compiledRelease || obj; // soporta record o release suelto
  return {
    ocid: cr.ocid,
    titulo: cr.tender?.title || "(sin título)",
    entidad: cr.buyer?.name || "(sin entidad)",
    region: getRegion(cr),
    numPostores: cr.tender?.numberOfTenderers ?? null,
    valorReferencial: getTenderValue(cr),
    montoAdjudicado: getAwardValue(cr),
    proveedor: getSupplier(cr),
  };
}

// ---------- Motor de señales (espejo en JS del dominio TS, ver src/domain) ----------
export function banderaPostorUnico(c) {
  return c.numPostores === 1
    ? { codigo: "POSTOR_UNICO", peso: 3, detalle: "Adjudicado con un solo postor" }
    : null;
}
export function banderaSobrecosto(c, umbral = 0.15) {
  if (c.valorReferencial == null || c.montoAdjudicado == null) return null;
  if (c.valorReferencial <= 0) return null;
  const exceso = (c.montoAdjudicado - c.valorReferencial) / c.valorReferencial;
  return exceso > umbral
    ? { codigo: "SOBRECOSTO", peso: 2, detalle: `Adjudicado ${(exceso * 100).toFixed(0)}% sobre el valor referencial` }
    : null;
}
export function evaluarRiesgo(c) {
  const banderas = [banderaPostorUnico(c), banderaSobrecosto(c)].filter(Boolean);
  const puntaje = banderas.reduce((s, b) => s + b.peso, 0);
  return { ...c, banderas, puntaje };
}

// ---------- Runner ----------
async function main() {
  const path = process.argv[2];
  if (!path) {
    console.error("Uso: node etl/etl_ocds.mjs <archivo.jsonl|.jsonl.gz>");
    process.exit(1);
  }
  let input = fs.createReadStream(path);
  if (path.endsWith(".gz")) input = input.pipe(zlib.createGunzip());
  const rl = readline.createInterface({ input, crlfDelay: Infinity });

  let total = 0;
  let malformadas = 0;
  let conBandera = 0;
  const proveedorFreq = {};
  const top = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    let c;
    try {
      c = evaluarRiesgo(normalize(line));
    } catch {
      malformadas++; // línea malformada → se salta (caso de error)
      continue;
    }
    total++;
    if (c.banderas.length) conBandera++;
    if (c.proveedor?.id) proveedorFreq[c.proveedor.id] = (proveedorFreq[c.proveedor.id] || 0) + 1;
    if (c.puntaje > 0) top.push(c);
  }

  // bandera de proveedor recurrente (necesita el conteo global)
  for (const c of top) {
    const freq = proveedorFreq[c.proveedor?.id] || 0;
    if (freq >= 3) {
      c.banderas.push({ codigo: "PROVEEDOR_RECURRENTE", peso: 1, detalle: `Mismo proveedor en ${freq} procesos` });
      c.puntaje += 1;
    }
  }
  top.sort((a, b) => b.puntaje - a.puntaje);

  console.log(`\nProcesos leídos: ${total}  (malformados saltados: ${malformadas})`);
  console.log(`Procesos con al menos una bandera: ${conBandera}`);
  console.log(`\nTop por puntaje de riesgo:`);
  for (const c of top.slice(0, 10)) {
    console.log(`  [${c.puntaje}] ${String(c.region).padEnd(12)} | ${String(c.entidad).slice(0, 40)} | ${String(c.titulo).slice(0, 35)}`);
    for (const b of c.banderas) console.log(`        🚩 ${b.codigo}: ${b.detalle}`);
  }
}

// solo corre si se invoca directamente (cross-platform: Windows usa backslashes)
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
