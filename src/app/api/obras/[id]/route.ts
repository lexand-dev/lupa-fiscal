import { NextResponse } from "next/server";
import { obtenerDetalleObra } from "@/application/use-cases";
import { getObrasRepository } from "@/infrastructure/repositories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: { id: string } },
) {
  try {
    const obra = await obtenerDetalleObra(getObrasRepository(), params.id);
    if (!obra) {
      return NextResponse.json({ error: "Obra no encontrada" }, { status: 404 });
    }
    return NextResponse.json(obra);
  } catch (err) {
    console.error("[/api/obras/:id]", err);
    return NextResponse.json({ error: "Error al obtener la obra" }, { status: 500 });
  }
}
