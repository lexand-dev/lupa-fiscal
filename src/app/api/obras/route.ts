import { NextRequest, NextResponse } from "next/server";
import { buscarObras } from "@/application/use-cases";
import { getObrasRepository } from "@/infrastructure/repositories";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  const region = req.nextUrl.searchParams.get("region");
  const categoria = req.nextUrl.searchParams.get("categoria");
  if (!region) {
    return NextResponse.json({ error: "Parámetro 'region' requerido" }, { status: 400 });
  }
  try {
    const obras = await buscarObras(getObrasRepository(), region, categoria);
    return NextResponse.json({ region, total: obras.length, obras });
  } catch (err) {
    console.error("[/api/obras]", err);
    return NextResponse.json({ error: "Error al buscar obras" }, { status: 500 });
  }
}
