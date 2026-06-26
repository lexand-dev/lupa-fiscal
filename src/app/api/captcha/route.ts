import { NextResponse } from "next/server";
import { generarReto } from "@/infrastructure/auth/captcha-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/captcha → { token, a, b }. La solución queda en el servidor. */
export async function GET() {
  return NextResponse.json(generarReto());
}
