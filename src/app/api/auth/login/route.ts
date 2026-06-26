/**
 * app/api/auth/login/route.ts — Lupa Fiscal
 *
 * Endpoint de inicio de sesión. Capa de presentación: arma las dependencias de
 * auth (AuthDeps), llama al caso de uso `login` y, si las credenciales son
 * válidas, setea la cookie de sesión httpOnly.
 *
 *   POST /api/auth/login
 *     body: { email, password, captchaToken }
 *
 *   200 → { usuario }        (cookie de sesión seteada)
 *   400 → { error }          (body inválido / captcha ausente)
 *   401 → { error }          (credenciales inválidas — mensaje genérico)
 *   500 → { error }          (fallo inesperado)
 *
 * El caso de uso `login` devuelve siempre el MISMO mensaje genérico ante email
 * inexistente o password incorrecta (anti-enumeración) y hace verificación dummy
 * para no filtrar por tiempo. Aquí ese AuthError se mapea a 401.
 *
 * WIRING: igual que en /api/auth/register, las dependencias se arman inline con
 * un store EN MEMORIA sobre globalThis (compartido con register) y un captcha
 * por token fijo, a falta de un adaptador en infrastructure/. El bloque de
 * wiring que sigue es IDÉNTICO al de register; extraer ambos a un módulo
 * compartido (p. ej. infrastructure/auth/deps.ts con getAuthDeps()) y reemplazar
 * el store en memoria por persistencia en Postgres + tablas usuario/sesion.
 */
import { NextResponse } from "next/server";
import {
  AuthError,
  login,
  type AuthDeps,
  type CaptchaVerifier,
  type DatosLogin,
  type MetaSesion,
  type ResultadoAuth,
  type SessionsRepository,
  type UsersRepository,
} from "@/application/auth-use-cases";
import type { Sesion, Usuario, UsuarioConCredencial } from "@/domain/auth-entities";
import {
  NOMBRE_COOKIE,
  DURACION_SESION_MS,
  cryptoService,
} from "@/infrastructure/auth/session";
import { verificarReto } from "@/infrastructure/auth/captcha-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ============================================================
//  WIRING inline de AuthDeps (ver cabecera). DUPLICADO en register/route.ts.
// ============================================================
//
// MISMO store en memoria (misma STORE_KEY) anclado a globalThis: aquí se LEE el
// usuario que register escribió. Si esta clave o estos adaptadores divergen del
// register, el login dejaría de encontrar a los usuarios recién registrados.

interface AuthStore {
  usuariosPorEmail: Map<string, UsuarioConCredencial>;
  usuariosPorId: Map<string, Usuario>;
  sesiones: Map<string, Sesion>;
}

const STORE_KEY = "__lupaFiscalAuthStore__";

function obtenerStore(): AuthStore {
  const g = globalThis as Record<string, unknown>;
  if (!g[STORE_KEY]) {
    const store: AuthStore = {
      usuariosPorEmail: new Map(),
      usuariosPorId: new Map(),
      sesiones: new Map(),
    };
    g[STORE_KEY] = store;
  }
  return g[STORE_KEY] as AuthStore;
}

/** Adaptador de persistencia de usuarios sobre el store en memoria. */
function usersRepository(store: AuthStore): UsersRepository {
  return {
    async crear(conCredencial: UsuarioConCredencial): Promise<Usuario> {
      store.usuariosPorEmail.set(conCredencial.email, conCredencial);
      const { passwordHash: _omitido, ...usuario } = conCredencial;
      void _omitido;
      store.usuariosPorId.set(usuario.id, usuario);
      return usuario;
    },
    async obtenerPorEmail(email: string): Promise<UsuarioConCredencial | null> {
      return store.usuariosPorEmail.get(email) ?? null;
    },
    async obtenerPorId(id: string): Promise<Usuario | null> {
      return store.usuariosPorId.get(id) ?? null;
    },
  };
}

/** Adaptador de persistencia de sesiones sobre el store en memoria. */
function sessionsRepository(store: AuthStore): SessionsRepository {
  return {
    async crear(s: Sesion): Promise<Sesion> {
      store.sesiones.set(s.id, s);
      return s;
    },
  };
}

/**
 * Verificador de captcha sin libs nuevas. En desarrollo (o si está definido
 * CAPTCHA_BYPASS_TOKEN) acepta un token fijo conocido; en producción, sin un
 * proveedor real configurado, rechaza. El adaptador real haría fetch (API web).
 */
function captchaVerifier(): CaptchaVerifier {
  return {
    async verificar(token: string): Promise<boolean> {
      return verificarReto(token);
    },
  };
}

/** Arma el bundle de dependencias que consumen los casos de uso de auth. */
function construirAuthDeps(): AuthDeps {
  const store = obtenerStore();
  return {
    users: usersRepository(store),
    sessions: sessionsRepository(store),
    crypto: cryptoService,
    captcha: captchaVerifier(),
  };
}

/** Extrae user-agent / IP del request para registrar el dispositivo de la sesión. */
function metaDeRequest(req: Request): MetaSesion {
  const h = req.headers;
  const ipDirecta = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    userAgent: h.get("user-agent") ?? undefined,
    ip: ipDirecta || h.get("x-real-ip") || undefined,
  };
}

/** Setea la cookie httpOnly de sesión en la respuesta. */
function setearCookieSesion(res: NextResponse, resultado: ResultadoAuth): void {
  res.cookies.set({
    name: NOMBRE_COOKIE,
    value: resultado.cookieToken,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(DURACION_SESION_MS / 1000),
  });
}

// ============================================================
//  Handler
// ============================================================

export async function POST(req: Request) {
  // 1) Body JSON robusto: un body no-JSON es un 400, no un 500.
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Cuerpo de la solicitud inválido (se esperaba JSON)" },
      { status: 400 },
    );
  }

  // 2) Captcha ausente es un 400 (falta un dato del formulario), no un 401.
  if (typeof body.captchaToken !== "string" || body.captchaToken.length === 0) {
    return NextResponse.json({ error: "Captcha requerido" }, { status: 400 });
  }

  try {
    const deps = construirAuthDeps();
    const meta = metaDeRequest(req);

    const resultado = await login(deps, body as unknown as DatosLogin, meta);

    // 3) Éxito: 200 con el usuario (sin credencial) + cookie de sesión.
    const res = NextResponse.json({ usuario: resultado.usuario });
    setearCookieSesion(res, resultado);
    return res;
  } catch (err) {
    if (err instanceof AuthError) {
      // Captcha inválido o credenciales inválidas → 401 (acceso denegado).
      // El mensaje del caso de uso ya es genérico (anti-enumeración).
      return NextResponse.json({ error: err.message }, { status: 401 });
    }
    console.error("[/api/auth/login]", err);
    return NextResponse.json(
      { error: "Error al iniciar sesión" },
      { status: 500 },
    );
  }
}
