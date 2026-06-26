/**
 * app/api/auth/register/route.ts — Lupa Fiscal
 *
 * Endpoint de registro (ciudadano o empresa/institución). Capa de presentación:
 * arma las dependencias de auth (AuthDeps), llama al caso de uso correspondiente
 * y, si todo va bien, setea la cookie de sesión httpOnly.
 *
 *   POST /api/auth/register
 *     body: { tipo: "ciudadano" | "empresa", email, password, captchaToken, ... }
 *       - tipo "ciudadano": { datos: { nombres, apellidoPaterno, apellidoMaterno, dni } }
 *       - tipo "empresa":   { tipoOrganizacion: "empresa"|"institucion",
 *                             datos: { ruc, razonSocial } }
 *
 *   201 → { usuario }                (cookie de sesión seteada)
 *   400 → { error, campo }           (validación / captcha / cuenta duplicada)
 *   500 → { error }                  (fallo inesperado)
 *
 * El DNI/RUC y el captcha se validan DENTRO de los casos de uso (auth-use-cases),
 * que reusan domain/validators.ts; aquí solo se mapea AuthError → status HTTP.
 *
 * WIRING: las dependencias de auth (UsersRepository, SessionsRepository,
 * CaptchaVerifier) se construyen aquí de forma inline porque todavía NO existe
 * un adaptador en infrastructure/. Hoy se usa un store EN MEMORIA (sobre
 * globalThis, compartido con /api/auth/login) y un captcha por token fijo. Para
 * producción hay que: (1) crear las tablas `usuario`, `sesion` y `consulta_log`
 * en infrastructure/db/schema.sql; (2) implementar PgUsersRepository /
 * PgSessionsRepository y un CaptchaVerifier real (fetch al proveedor, sin libs
 * nuevas); (3) extraer un getAuthDeps() a infrastructure/auth/ y consumirlo
 * desde estas dos rutas en vez del wiring inline. El bloque de wiring que sigue
 * está DUPLICADO (idéntico) en /api/auth/login/route.ts: extraerlo es parte del
 * mismo WIRING. Mover ambos a un único módulo compartido.
 */
import { NextResponse } from "next/server";
import {
  AuthError,
  registrarCiudadano,
  registrarEmpresa,
  type AuthDeps,
  type CaptchaVerifier,
  type MetaSesion,
  type RegistroCiudadano,
  type RegistroEmpresa,
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
//  WIRING inline de AuthDeps (ver cabecera). DUPLICADO en login/route.ts.
// ============================================================
//
// Store EN MEMORIA, anclado a globalThis para que (a) sobreviva al hot-reload de
// dev y (b) lo COMPARTAN ambas rutas (register escribe, login lee). Sin esto,
// cada módulo de ruta tendría su propio Map y un usuario registrado no podría
// iniciar sesión. Es un sustituto temporal de la persistencia en Postgres.

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
      // El passwordHash NO debe quedar accesible vía el índice por id.
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
 * proveedor real configurado, rechaza para no dar una falsa sensación de
 * protección. El adaptador real haría fetch (API web) contra el proveedor.
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

/** Mapea un AuthError a 400 (validación/credenciales de registro). */
function respuestaAuthError(err: AuthError) {
  return NextResponse.json(
    { error: err.message, campo: err.campo },
    { status: 400 },
  );
}

export async function POST(req: Request) {
  // 1) Body JSON robusto: un body no-JSON es un 400, no un 500.
  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { error: "Cuerpo de la solicitud inválido (se esperaba JSON)", campo: null },
      { status: 400 },
    );
  }

  const tipo = body.tipo;
  if (tipo !== "ciudadano" && tipo !== "empresa") {
    return NextResponse.json(
      { error: "Tipo de registro inválido ('ciudadano' | 'empresa')", campo: "tipo" },
      { status: 400 },
    );
  }

  try {
    const deps = construirAuthDeps();
    const meta = metaDeRequest(req);

    // 2) Despacho por tipo. La validación fina (email, password, DNI/RUC,
    //    captcha, email duplicado) vive en el caso de uso y lanza AuthError.
    let resultado: ResultadoAuth;
    if (tipo === "ciudadano") {
      resultado = await registrarCiudadano(
        deps,
        body as unknown as RegistroCiudadano,
        meta,
      );
    } else {
      resultado = await registrarEmpresa(
        deps,
        body as unknown as RegistroEmpresa,
        meta,
      );
    }

    // 3) Éxito: 201 con el usuario (sin credencial) + cookie de sesión.
    const res = NextResponse.json({ usuario: resultado.usuario }, { status: 201 });
    setearCookieSesion(res, resultado);
    return res;
  } catch (err) {
    if (err instanceof AuthError) return respuestaAuthError(err);
    console.error("[/api/auth/register]", err);
    return NextResponse.json(
      { error: "Error al registrar la cuenta", campo: null },
      { status: 500 },
    );
  }
}
