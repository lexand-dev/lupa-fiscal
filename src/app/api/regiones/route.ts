import { NextResponse } from "next/server";
import { listarRegiones } from "@/application/use-cases";
import { fuenteDatos, getObrasRepository } from "@/infrastructure/repositories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const regiones = await listarRegiones(getObrasRepository());
    return NextResponse.json({ fuente: fuenteDatos(), regiones });
  } catch (err) {
    console.error("[/api/regiones]", err);
    return NextResponse.json({ error: "Error al listar regiones" }, { status: 500 });
  }
}
