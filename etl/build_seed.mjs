#!/usr/bin/env node
/**
 * build_seed.mjs — Lupa Fiscal
 * Valida data/seed.json y reporta cifras agregadas (sanity check de la demo).
 * Sirve para confirmar que el seed que sirve la app es coherente.
 *
 * Uso: node etl/build_seed.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const seedPath = path.join(root, "data", "seed.json");

const seed = JSON.parse(fs.readFileSync(seedPath, "utf8"));
const { entidades, proveedores, contratos, obras } = seed;

const idsEntidad = new Set(entidades.map((e) => e.id));
const idsProveedor = new Set(proveedores.map((p) => p.id));
const idsContrato = new Set(contratos.map((c) => c.id));

let errores = 0;
for (const c of contratos) {
  if (!idsEntidad.has(c.entidadId)) { console.error(`✗ contrato ${c.id}: entidadId inexistente ${c.entidadId}`); errores++; }
  if (c.proveedorId && !idsProveedor.has(c.proveedorId)) { console.error(`✗ contrato ${c.id}: proveedorId inexistente ${c.proveedorId}`); errores++; }
}
for (const o of obras) {
  if (!idsEntidad.has(o.entidadId)) { console.error(`✗ obra ${o.id}: entidadId inexistente ${o.entidadId}`); errores++; }
  if (o.contratoId && !idsContrato.has(o.contratoId)) { console.error(`✗ obra ${o.id}: contratoId inexistente ${o.contratoId}`); errores++; }
}

const porRegion = {};
for (const o of obras) {
  const region = entidades.find((e) => e.id === o.entidadId)?.region ?? "DESCONOCIDA";
  porRegion[region] ??= { paralizadas: 0, congelado: 0 };
  if (o.estado === "paralizada") {
    porRegion[region].paralizadas++;
    porRegion[region].congelado += o.montoInversion ?? 0;
  }
}

console.log(`\nSeed: ${entidades.length} entidades · ${proveedores.length} proveedores · ${contratos.length} contratos · ${obras.length} obras`);
console.log(`Integridad referencial: ${errores === 0 ? "OK ✓" : errores + " errores ✗"}`);
console.log(`\nInversión congelada por región:`);
for (const [r, v] of Object.entries(porRegion).sort((a, b) => b[1].congelado - a[1].congelado)) {
  console.log(`  ${r.padEnd(14)} ${v.paralizadas} paralizadas  S/ ${(v.congelado / 1e6).toFixed(1)} M`);
}

process.exit(errores === 0 ? 0 : 1);
