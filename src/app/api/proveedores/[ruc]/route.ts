/**
 * app/api/proveedores/[ruc]/route.ts — Lupa Fiscal
 *
 * Endpoint de perfil de riesgo POR PROVEEDOR (RUC). Capa de presentación (App
 * Router): solo orquesta puerto + dominio, no contiene reglas de negocio.
 *
 *   GET /api/proveedores/:ruc
 *     1) Valida el RUC con domain/validators.ts (400 si es inválido).
 *     2) Trae las obras del RUC vía getObrasRepository().buscarContratosPorRuc.
 *     3) Las agrega a EntradaPerfilProveedor y aplica domain/proveedor-risk.ts.
 *     4) Devuelve el PerfilRiesgoProveedor (404 si el RUC no tiene proveedor).
 *
 * Mismo patrón runtime/dynamic + try/catch que /api/obras y /api/regiones.
 */
import { NextResponse } from "next/server";
import { validarRuc } from "@/domain/validators";
import { fuenteDatos, getObrasRepository } from "@/infrastructure/repositories";
import type { ObraConContexto } from "@/application/ports";
import {
  perfilRiesgoProveedor,
  type ContratoAgregable,
  type EntradaPerfilProveedor,
} from "@/domain/proveedor-risk";
import { evaluarRiesgo } from "@/domain/risk-engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Convierte las obras-con-contexto del RUC en la entrada del motor agregado.
 * Solo se quedan las filas que sí traen contrato (sin contrato no hay nada que
 * perfilar). El proveedor sale de la primera fila con proveedor presente.
 */
function aEntradaPerfil(filas: ObraConContexto[]): EntradaPerfilProveedor | null {
  const proveedor = filas.find((f) => f.proveedor != null)?.proveedor ?? null;
  if (!proveedor) return null;

  const contratos: ContratoAgregable[] = filas
    .filter((f) => f.contrato != null)
    .map((f) => ({
      contrato: f.contrato!,
      entidad: f.entidad,
      obra: f.obra,
    }));

  return { proveedor, contratos };
}

export async function GET(
  _req: Request,
  { params }: { params: { ruc: string } },
) {
  const ruc = params.ruc?.trim() ?? "";

  // 1) Validación de identificador (mismo validador que usa el registro).
  if (!validarRuc(ruc)) {
    return NextResponse.json(
      { error: "RUC inválido (11 dígitos, dígito verificador)" },
      { status: 400 },
    );
  }

  try {
    // 2) Datos crudos del proveedor (obras de sus contratos).
    const filas = await getObrasRepository().buscarContratosPorRuc(ruc);

    // 3) Si no hay proveedor con ese RUC en los datos, es un 404 (no un perfil vacío).
    const entrada = aEntradaPerfil(filas);
    if (!entrada) {
      return NextResponse.json(
        { error: "Proveedor no encontrado" },
        { status: 404 },
      );
    }

    // 4) Motor de dominio: perfil agregado + semáforo.
    const perfil = perfilRiesgoProveedor(entrada);

    // 5) Tabla de contratos (top 50 por monto), con riesgo por contrato.
    const contratos = filas
      .filter((f) => f.contrato != null)
      .map((f) => {
        const ev = evaluarRiesgo({
          contrato: f.contrato!,
          proveedor: f.proveedor,
          obra: f.obra,
        });
        return {
          ocid: f.contrato!.ocid,
          nombre: f.obra.nombre,
          entidad: f.entidad.nombre,
          region: f.entidad.region,
          monto: f.contrato!.montoAdjudicado ?? f.contrato!.valorReferencial,
          postores: f.contrato!.numPostores,
          nivel: ev.nivel,
          nBanderas: ev.banderas.length,
        };
      })
      .sort((a, b) => (b.monto ?? 0) - (a.monto ?? 0))
      .slice(0, 50);

    return NextResponse.json({ fuente: fuenteDatos(), perfil, contratos });
  } catch (err) {
    console.error("[/api/proveedores/:ruc]", err);
    return NextResponse.json(
      { error: "Error al perfilar el proveedor" },
      { status: 500 },
    );
  }
}
