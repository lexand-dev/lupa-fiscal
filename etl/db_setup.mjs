#!/usr/bin/env node
/**
 * db_setup.mjs — Lupa Fiscal
 * Crea el esquema en PostgreSQL y carga data/seed.json (ETL única → base lista).
 * Requiere DATABASE_URL en el entorno (Supabase/Neon).
 *
 * Uso:
 *   DATABASE_URL="postgres://..." node etl/db_setup.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

async function main() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("Falta DATABASE_URL. Ej: DATABASE_URL=postgres://... node etl/db_setup.mjs");
    process.exit(1);
  }
  const isLocal = /localhost|127\.0\.0\.1/.test(connectionString);
  const client = new pg.Client({
    connectionString,
    ssl: isLocal ? false : { rejectUnauthorized: false },
  });
  await client.connect();

  const schema = fs.readFileSync(path.join(root, "src", "infrastructure", "db", "schema.sql"), "utf8");
  await client.query(schema);
  console.log("✓ esquema aplicado");

  const seed = JSON.parse(fs.readFileSync(path.join(root, "data", "seed.json"), "utf8"));

  await client.query("TRUNCATE obra, contrato, proveedor, entidad RESTART IDENTITY CASCADE");

  for (const e of seed.entidades) {
    await client.query(
      `INSERT INTO entidad (id,nombre,nivel_gobierno,region,ubigeo) VALUES ($1,$2,$3,$4,$5)`,
      [e.id, e.nombre, e.nivelGobierno, e.region, e.ubigeo],
    );
  }
  for (const p of seed.proveedores) {
    await client.query(
      `INSERT INTO proveedor (id,ruc,razon_social,sancionado,num_adjudicaciones) VALUES ($1,$2,$3,$4,$5)`,
      [p.id, p.ruc, p.razonSocial, p.sancionado, p.numAdjudicaciones],
    );
  }
  for (const c of seed.contratos) {
    await client.query(
      `INSERT INTO contrato (id,ocid,valor_referencial,monto_adjudicado,num_postores,entidad_id,proveedor_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [c.id, c.ocid, c.valorReferencial, c.montoAdjudicado, c.numPostores, c.entidadId, c.proveedorId],
    );
  }
  for (const o of seed.obras) {
    await client.query(
      `INSERT INTO obra (id,nombre,monto_inversion,estado,meses_parada,avance_fisico,lat,lng,entidad_id,contrato_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [o.id, o.nombre, o.montoInversion, o.estado, o.mesesParada, o.avanceFisico, o.lat, o.lng, o.entidadId, o.contratoId],
    );
  }

  console.log(
    `✓ cargados ${seed.entidades.length} entidades, ${seed.proveedores.length} proveedores, ${seed.contratos.length} contratos, ${seed.obras.length} obras`,
  );
  await client.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
