/**
 * application/auth-use-cases.ts — Lupa Fiscal
 *
 * Casos de uso de autenticación: registrarCiudadano, registrarEmpresa y login.
 * Orquestan los PUERTOS (repositorios + cripto + captcha) y las reglas de
 * dominio (validators.ts). No conocen ni framework ni SQL ni node:crypto: todo
 * entra por inyección (mismo principio que use-cases.ts con ObrasRepository).
 *
 * Reglas de seguridad aplicadas:
 *   - DNI/RUC validados con domain/validators.ts antes de tocar la DB.
 *   - Captcha verificado SIEMPRE antes de crear cuenta o intentar login.
 *   - Password hasheado con scrypt (nunca se guarda en claro).
 *   - Login con mensaje genérico (no se distingue email-inexistente de
 *     password-mala) para no permitir enumeración de cuentas.
 *   - El passwordHash jamás cruza el límite application → app: las funciones
 *     devuelven `Usuario` (sin credencial), nunca `UsuarioConCredencial`.
 */
import { validarDni, validarRuc } from "@/domain/validators";
import type {
  DatosCiudadano,
  DatosEmpresa,
  Sesion,
  TipoOrganizacion,
  Usuario,
  UsuarioConCredencial,
} from "@/domain/auth-entities";
import { DURACION_SESION_MS } from "@/infrastructure/auth/session";

// ============================================================
//  Puertos que consume la aplicación
// ============================================================
//
// Se declaran aquí los CONTRATOS mínimos que estos casos de uso necesitan, para
// no acoplarse a Postgres ni a node:crypto. Los adaptadores reales viven en
// infrastructure/. (Ver WIRING: extraer estos puertos a application/auth-ports.ts
// si se quiere centralizar junto a SessionsRepository/ConsultaLogRepository.)

/** Persistencia de usuarios. */
export interface UsersRepository {
  crear(usuario: UsuarioConCredencial): Promise<Usuario>;
  obtenerPorEmail(email: string): Promise<UsuarioConCredencial | null>;
  obtenerPorId(id: string): Promise<Usuario | null>;
}

/** Persistencia de sesiones (abre una sesión nueva al registrar / iniciar). */
export interface SessionsRepository {
  crear(s: Sesion): Promise<Sesion>;
}

/**
 * Contrato de cripto que necesitan los casos de uso. Subconjunto del
 * CryptoService de infrastructure/auth/session.ts (firma compatible).
 */
export interface CryptoPort {
  hashPassword(plano: string): Promise<string>;
  verificarPassword(plano: string, hash: string): Promise<boolean>;
  firmarSession(sessionId: string): string;
  nuevoId(prefijo?: string): string;
}

/**
 * Verificador de captcha. Recibe el token del cliente y la IP, devuelve true si
 * el captcha es válido. Lo implementa infrastructure (proveedor externo o, en
 * desarrollo/demo, un stub que acepta un token fijo). Sin libs nuevas: el
 * adaptador real usaría fetch (API web) contra el endpoint del proveedor.
 */
export interface CaptchaVerifier {
  verificar(token: string, ip?: string): Promise<boolean>;
}

/** Bundle de dependencias de auth (un objeto en vez de N parámetros sueltos). */
export interface AuthDeps {
  users: UsersRepository;
  sessions: SessionsRepository;
  crypto: CryptoPort;
  captcha: CaptchaVerifier;
}

/** Metadatos del request, para registrar el dispositivo de la sesión. */
export interface MetaSesion {
  userAgent?: string;
  ip?: string;
}

/** Resultado de un registro/login: el usuario + el token firmado del cookie. */
export interface ResultadoAuth {
  usuario: Usuario;
  /** Valor listo para Set-Cookie (firmado con HMAC). */
  cookieToken: string;
  /** ISO 8601 de expiración de la sesión. */
  expiraEn: string;
}

// ============================================================
//  Errores de auth (legibles, en español)
// ============================================================

/** Error de validación/credenciales de auth. El handler lo mapea a 400/401. */
export class AuthError extends Error {
  constructor(
    message: string,
    /** Campo culpable (para resaltar en el formulario), o null si es genérico. */
    public readonly campo: string | null = null,
  ) {
    super(message);
    this.name = "AuthError";
  }
}

// ============================================================
//  Datos de entrada de cada caso de uso
// ============================================================

/** Política mínima de contraseña: ≥10 caracteres. Pura. */
function esPasswordValido(password: unknown): password is string {
  return typeof password === "string" && password.length >= 10;
}

/** Normaliza email: recorta y pasa a minúsculas. Pura. */
function normalizarEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Formato razonable de email (no exhaustivo; la verificación real es por correo). */
function esEmailValido(email: unknown): email is string {
  return typeof email === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Entrada de registro de ciudadano (persona natural, DNI). */
export interface RegistroCiudadano {
  email: string;
  password: string;
  datos: DatosCiudadano;
  /** Token del captcha resuelto en el cliente. */
  captchaToken: string;
}

/** Entrada de registro de empresa/institución (organización, RUC). */
export interface RegistroEmpresa {
  email: string;
  password: string;
  /** "empresa" (privada) o "institucion" (entidad pública). */
  tipoOrganizacion: TipoOrganizacion;
  datos: DatosEmpresa;
  /** Token del captcha resuelto en el cliente. */
  captchaToken: string;
}

/** Entrada de login. */
export interface DatosLogin {
  email: string;
  password: string;
  /** Token del captcha resuelto en el cliente. */
  captchaToken: string;
}

// ============================================================
//  Helpers internos compartidos por los casos de uso
// ============================================================

/** Verifica el captcha o lanza AuthError. */
async function exigirCaptcha(
  deps: AuthDeps,
  token: string,
  meta: MetaSesion,
): Promise<void> {
  if (typeof token !== "string" || token.length === 0) {
    throw new AuthError("Captcha requerido", "captcha");
  }
  const ok = await deps.captcha.verificar(token, meta.ip);
  if (!ok) throw new AuthError("Captcha inválido", "captcha");
}

/** Valida email + password y devuelve el email normalizado, o lanza AuthError. */
function validarCredencialesComunes(email: string, password: string): string {
  if (!esEmailValido(email)) {
    throw new AuthError("Correo electrónico inválido", "email");
  }
  if (!esPasswordValido(password)) {
    throw new AuthError(
      "La contraseña debe tener al menos 10 caracteres",
      "password",
    );
  }
  return normalizarEmail(email);
}

/**
 * Crea el usuario (ya validado) + abre su primera sesión y devuelve el resultado
 * con el token firmado del cookie. Compartido por ambos registros.
 */
async function persistirYAbrirSesion(
  deps: AuthDeps,
  conCredencial: UsuarioConCredencial,
  meta: MetaSesion,
): Promise<ResultadoAuth> {
  const usuario = await deps.users.crear(conCredencial);
  return abrirSesion(deps, usuario, meta);
}

/** Abre una sesión para un usuario ya existente y arma el ResultadoAuth. */
async function abrirSesion(
  deps: AuthDeps,
  usuario: Usuario,
  meta: MetaSesion,
): Promise<ResultadoAuth> {
  const ahora = Date.now();
  const sesion: Sesion = {
    id: deps.crypto.nuevoId(),
    userId: usuario.id,
    creadaEn: new Date(ahora).toISOString(),
    expiraEn: new Date(ahora + DURACION_SESION_MS).toISOString(),
    revocadaEn: null,
    userAgent: meta.userAgent ?? null,
    ip: meta.ip ?? null,
  };
  const creada = await deps.sessions.crear(sesion);
  return {
    usuario,
    cookieToken: deps.crypto.firmarSession(creada.id),
    expiraEn: creada.expiraEn,
  };
}

/** Lanza si el email ya está registrado (cuenta duplicada). */
async function exigirEmailLibre(deps: AuthDeps, email: string): Promise<void> {
  const existente = await deps.users.obtenerPorEmail(email);
  if (existente) {
    throw new AuthError("El correo ya está registrado", "email");
  }
}

// ============================================================
//  Caso de uso: registrar ciudadano
// ============================================================

/**
 * Registra un ciudadano (persona natural). Valida DNI con validators.ts,
 * verifica captcha, hashea la contraseña y abre la primera sesión.
 */
export async function registrarCiudadano(
  deps: AuthDeps,
  entrada: RegistroCiudadano,
  meta: MetaSesion = {},
): Promise<ResultadoAuth> {
  await exigirCaptcha(deps, entrada.captchaToken, meta);

  const email = validarCredencialesComunes(entrada.email, entrada.password);

  const d = entrada.datos;
  if (!d || typeof d !== "object") {
    throw new AuthError("Datos del ciudadano requeridos", "datos");
  }
  if (!d.nombres?.trim()) throw new AuthError("Nombres requeridos", "nombres");
  if (!d.apellidoPaterno?.trim()) {
    throw new AuthError("Apellido paterno requerido", "apellidoPaterno");
  }
  if (!d.apellidoMaterno?.trim()) {
    throw new AuthError("Apellido materno requerido", "apellidoMaterno");
  }
  if (!validarDni(d.dni)) {
    throw new AuthError("DNI inválido (8 dígitos)", "dni");
  }

  await exigirEmailLibre(deps, email);

  const ahora = new Date().toISOString();
  const conCredencial: UsuarioConCredencial = {
    id: deps.crypto.nuevoId("U-"),
    email,
    rol: "ciudadano",
    tipoOrganizacion: null,
    datosCiudadano: {
      nombres: d.nombres.trim(),
      apellidoPaterno: d.apellidoPaterno.trim(),
      apellidoMaterno: d.apellidoMaterno.trim(),
      dni: d.dni.trim(),
    },
    datosEmpresa: null,
    emailVerificado: false,
    activo: true,
    creadoEn: ahora,
    actualizadoEn: ahora,
    passwordHash: await deps.crypto.hashPassword(entrada.password),
  };

  return persistirYAbrirSesion(deps, conCredencial, meta);
}

// ============================================================
//  Caso de uso: registrar empresa / institución
// ============================================================

/**
 * Registra una empresa privada o una institución pública (ambas usan el rol
 * `empresa`, distinguidas por tipoOrganizacion). Valida RUC con validators.ts.
 */
export async function registrarEmpresa(
  deps: AuthDeps,
  entrada: RegistroEmpresa,
  meta: MetaSesion = {},
): Promise<ResultadoAuth> {
  await exigirCaptcha(deps, entrada.captchaToken, meta);

  const email = validarCredencialesComunes(entrada.email, entrada.password);

  if (
    entrada.tipoOrganizacion !== "empresa" &&
    entrada.tipoOrganizacion !== "institucion"
  ) {
    throw new AuthError(
      "Tipo de organización inválido",
      "tipoOrganizacion",
    );
  }

  const d = entrada.datos;
  if (!d || typeof d !== "object") {
    throw new AuthError("Datos de la organización requeridos", "datos");
  }
  if (!d.razonSocial?.trim()) {
    throw new AuthError("Razón social requerida", "razonSocial");
  }
  if (!validarRuc(d.ruc)) {
    throw new AuthError("RUC inválido (11 dígitos, dígito verificador)", "ruc");
  }

  await exigirEmailLibre(deps, email);

  const ahora = new Date().toISOString();
  const conCredencial: UsuarioConCredencial = {
    id: deps.crypto.nuevoId("U-"),
    email,
    rol: "empresa",
    tipoOrganizacion: entrada.tipoOrganizacion,
    datosCiudadano: null,
    datosEmpresa: {
      ruc: d.ruc.trim(),
      razonSocial: d.razonSocial.trim(),
    },
    emailVerificado: false,
    activo: true,
    creadoEn: ahora,
    actualizadoEn: ahora,
    passwordHash: await deps.crypto.hashPassword(entrada.password),
  };

  return persistirYAbrirSesion(deps, conCredencial, meta);
}

// ============================================================
//  Caso de uso: login
// ============================================================

/**
 * Inicia sesión con email + password. Mensaje genérico ante cualquier fallo de
 * credenciales (anti-enumeración de cuentas). Lanza AuthError si no procede.
 */
export async function login(
  deps: AuthDeps,
  entrada: DatosLogin,
  meta: MetaSesion = {},
): Promise<ResultadoAuth> {
  await exigirCaptcha(deps, entrada.captchaToken, meta);

  if (!esEmailValido(entrada.email) || typeof entrada.password !== "string") {
    // Mismo mensaje que credenciales incorrectas: no se filtra qué falló.
    throw new AuthError("Credenciales inválidas");
  }
  const email = normalizarEmail(entrada.email);

  const conCredencial = await deps.users.obtenerPorEmail(email);

  // Si el usuario no existe, igual se ejecuta una verificación dummy para que el
  // tiempo de respuesta no delate la existencia de la cuenta (anti-timing).
  if (!conCredencial) {
    await deps.crypto.verificarPassword(
      entrada.password,
      "scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    );
    throw new AuthError("Credenciales inválidas");
  }

  const ok = await deps.crypto.verificarPassword(
    entrada.password,
    conCredencial.passwordHash,
  );
  if (!ok) throw new AuthError("Credenciales inválidas");

  // Cuenta deshabilitada (soft-disable): no se permite iniciar sesión.
  if (!conCredencial.activo) {
    throw new AuthError("La cuenta está deshabilitada");
  }

  // El passwordHash NO debe cruzar a la capa app: se descarta aquí.
  const { passwordHash: _descartado, ...usuario } = conCredencial;
  void _descartado;

  return abrirSesion(deps, usuario, meta);
}
