/**
 * infrastructure/repositories/index.ts — Lupa Fiscal
 *
 * Factory del repositorio. Decide el adaptador según el entorno:
 *   DATABASE_URL definido -> PostgreSQL (producción real)
 *   sin DATABASE_URL      -> seed JSON precargado (demo estable, ADR-0001)
 */
import type { ObrasRepository } from "@/application/ports";
import { JsonObrasRepository } from "./json-obras-repository";
import { PgObrasRepository } from "./pg-obras-repository";

let cached: ObrasRepository | null = null;

export function getObrasRepository(): ObrasRepository {
  if (cached) return cached;
  cached = process.env.DATABASE_URL
    ? new PgObrasRepository()
    : new JsonObrasRepository();
  return cached;
}

export function fuenteDatos(): "postgres" | "seed" {
  return process.env.DATABASE_URL ? "postgres" : "seed";
}
