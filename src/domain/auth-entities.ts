/**
 * domain/auth-entities.ts — Lupa Fiscal
 *
 * Modelo de dominio para autenticación y roles. CERO dependencias de
 * framework o DB (mismo principio que entities.ts / risk-engine.ts).
 *
 * Solo TIPOS e INTERFACES: este archivo no produce código en runtime.
 *
 * 2 perfiles (sección 1 del spec de auth): `ciudadano` y `empresa`.
 * La entidad pública (institución) REUTILIZA el perfil `empresa`; se
 * distingue de la empresa privada con `tipoOrganizacion`, no con un rol nuevo.
 */

/** Rol del usuario. La institución pública usa el rol `empresa`. */
export type Rol = "ciudadano" | "empresa";

/** Solo aplica a rol `empresa`. Distingue empresa privada de institución pública. */
export type TipoOrganizacion = "empresa" | "institucion";

/**
 * Datos propios del rol `ciudadano`.
 * Identidad de persona natural (DNI peruano de 8 dígitos).
 */
export interface DatosCiudadano {
  nombres: string;
  apellidoPaterno: string;
  apellidoMaterno: string;
  /** DNI peruano (8 dígitos numéricos). */
  dni: string;
}

/**
 * Datos propios del rol `empresa` (empresa privada o institución pública).
 * Identidad de organización (RUC peruano de 11 dígitos).
 */
export interface DatosEmpresa {
  /** RUC peruano (11 dígitos numéricos). */
  ruc: string;
  razonSocial: string;
}

/**
 * Usuario tal como vive en el dominio.
 * NO incluye la credencial: el `passwordHash` jamás sale de infrastructure.
 */
export interface Usuario {
  id: string;
  email: string;
  rol: Rol;
  /** Solo para rol `empresa`. null en ciudadano. */
  tipoOrganizacion: TipoOrganizacion | null;
  /** Datos de ciudadano. Poblado solo si rol === "ciudadano", si no null. */
  datosCiudadano: DatosCiudadano | null;
  /** Datos de empresa/institución. Poblado solo si rol === "empresa", si no null. */
  datosEmpresa: DatosEmpresa | null;
  emailVerificado: boolean;
  /** Soft-disable: false deshabilita el acceso sin borrar el registro. */
  activo: boolean;
  /** ISO 8601. */
  creadoEn: string;
  /** ISO 8601. */
  actualizadoEn: string;
}

/**
 * Usuario + su credencial. Solo circula DENTRO de infrastructure/application
 * al verificar password; nunca cruza el límite application → app.
 */
export interface UsuarioConCredencial extends Usuario {
  /** Formato scrypt$N$r$p$saltB64$hashB64. */
  passwordHash: string;
}

/** Sesión persistida (tabla sessions). El cookie solo lleva el `id` firmado. */
export interface Sesion {
  id: string;
  userId: string;
  /** ISO 8601. */
  creadaEn: string;
  /** ISO 8601. creadaEn + duración. */
  expiraEn: string;
  /** ISO 8601 de revocación (logout). null = sesión activa. */
  revocadaEn: string | null;
  /** Para que el usuario reconozca el dispositivo. */
  userAgent: string | null;
  /** Last-seen; no se usa para validar. */
  ip: string | null;
}

/** Lo que un caso de uso recibe como "quién está pidiendo esto". */
export interface SesionActual {
  usuario: Usuario;
  sesion: Sesion;
}

/** Eje consultable que se audita. Mapea 1:1 a los endpoints del sistema. */
export type TipoConsulta = "ruc" | "region" | "obra";

/**
 * Entrada de la bitácora de auditoría (tabla consulta_log). Append-only:
 * quién consultó qué (RUC/región/obra) y cuándo.
 */
export interface ConsultaLog {
  id: string;
  /** null = consulta anónima. */
  userId: string | null;
  /** Rol al momento de consultar (denormalizado; sobrevive al borrado del usuario). */
  rol: Rol | null;
  tipo: TipoConsulta;
  /** El RUC, la región o el id de obra consultado. */
  valor: string;
  /** Nº de resultados devueltos (opcional). */
  resultadoN: number | null;
  ip: string | null;
  userAgent: string | null;
  /** ISO 8601. */
  consultadoEn: string;
}
