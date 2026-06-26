"use client";

/**
 * app/registro/page.tsx — Lupa Fiscal
 *
 * UI de registro multi-rol (cliente). Selector de rol:
 *   - ciudadano → nombres + apellidoPaterno + apellidoMaterno + DNI (8 dígitos,
 *     con validación de FORMA del verificador opcional en el cliente).
 *   - empresa   → tipoOrganizacion (empresa privada / institución pública) +
 *     RUC (11 dígitos + dígito verificador, validado en el cliente) + razonSocial.
 *
 * La validación de DNI/RUC se hace con domain/validators.ts (mismas funciones
 * puras que usa el servidor); el servidor las vuelve a validar (defensa en
 * profundidad: el cliente solo da feedback temprano, no es la frontera).
 *
 * Captcha: usa el componente compartido @/components/Captcha (ver WIRING).
 *
 * Minimización de datos (GDPR/Ley 29733): se pide SOLO lo necesario para el rol
 * elegido y, para el ciudadano, se exige consentimiento informado explícito
 * antes de enviar datos personales (DNI + nombres).
 *
 * Postea a /api/auth/register (ver WIRING). El body cambia según el rol y
 * coincide con RegistroCiudadano / RegistroEmpresa de application/auth-use-cases.
 */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { validarDni, validarRuc } from "@/domain/validators";
import type { Rol, TipoOrganizacion } from "@/domain/auth-entities";
import Captcha from "@/components/Captcha";

// Estilos scoped a estas páginas de auth (no se tocan archivos CSS compartidos).
// Reaprovechan los tokens de color de globals.css (var(--…)).
const estilos: Record<string, React.CSSProperties> = {
  panel: {
    maxWidth: 520,
    margin: "32px auto",
    background: "var(--card)",
    border: "1px solid var(--border)",
    borderRadius: 12,
    padding: "28px 28px 32px",
  },
  campo: { marginBottom: 16 },
  label: {
    display: "block",
    fontSize: "0.78rem",
    textTransform: "uppercase",
    letterSpacing: "0.6px",
    color: "var(--ink-soft)",
    marginBottom: 4,
  },
  input: {
    width: "100%",
    padding: "10px 14px",
    fontSize: "1rem",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "#fff",
  },
  inputMal: { borderColor: "var(--alto)" },
  ayuda: { fontSize: "0.75rem", color: "var(--ink-soft)", marginTop: 4 },
  error: { fontSize: "0.78rem", color: "var(--alto)", marginTop: 4 },
  rolFila: { display: "flex", gap: 12, marginBottom: 20 },
  rolBtn: {
    flex: "1 1 0",
    padding: "12px 10px",
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "#fff",
    color: "var(--ink-soft)",
    cursor: "pointer",
    fontSize: "0.92rem",
    fontWeight: 600,
  },
  rolBtnActivo: {
    borderColor: "var(--accent)",
    color: "var(--navy)",
    background: "#fff7ed",
  },
  consent: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    background: "#fff7ed",
    border: "1px solid #fed7aa",
    borderRadius: 8,
    padding: "12px 14px",
    margin: "8px 0 16px",
    fontSize: "0.84rem",
    lineHeight: 1.4,
  },
  enviar: {
    width: "100%",
    padding: "12px 14px",
    fontSize: "1rem",
    fontWeight: 700,
    color: "#fff",
    background: "var(--accent)",
    border: "none",
    borderRadius: 8,
    cursor: "pointer",
  },
  enviarOff: { opacity: 0.55, cursor: "not-allowed" },
  avisoBox: {
    border: "1px solid",
    borderRadius: 8,
    padding: "10px 14px",
    margin: "0 0 16px",
    fontSize: "0.86rem",
  },
  pie: { marginTop: 18, fontSize: "0.86rem", color: "var(--ink-soft)" },
};

/** Une el estilo base de un input con el de error si el campo está marcado. */
function inputEstilo(conError: boolean): React.CSSProperties {
  return conError ? { ...estilos.input, ...estilos.inputMal } : estilos.input;
}

export default function RegistroPage() {
  const router = useRouter();

  // --- Estado común ---
  const [rol, setRol] = useState<Rol>("ciudadano");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");

  // --- Estado ciudadano ---
  const [nombres, setNombres] = useState("");
  const [apellidoPaterno, setApellidoPaterno] = useState("");
  const [apellidoMaterno, setApellidoMaterno] = useState("");
  const [dni, setDni] = useState("");
  const [consiente, setConsiente] = useState(false);

  // --- Estado empresa ---
  const [tipoOrganizacion, setTipoOrganizacion] =
    useState<TipoOrganizacion>("empresa");
  const [ruc, setRuc] = useState("");
  const [razonSocial, setRazonSocial] = useState("");

  // --- UI ---
  const [enviando, setEnviando] = useState(false);
  const [errorServidor, setErrorServidor] = useState<string | null>(null);
  // Marca el campo culpable que devuelve el servidor (AuthError.campo).
  const [campoMal, setCampoMal] = useState<string | null>(null);

  // --- Validaciones de cliente (feedback temprano; el servidor revalida) ---
  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const passwordOk = password.length >= 10;
  const dniOk = dni.trim().length === 0 ? null : validarDni(dni);
  const rucOk = ruc.trim().length === 0 ? null : validarRuc(ruc);

  // El botón se habilita solo si TODO lo del rol está completo + captcha resuelto.
  const formularioOk = useMemo(() => {
    if (!emailOk || !passwordOk || captchaToken.length === 0) return false;
    if (rol === "ciudadano") {
      return (
        nombres.trim().length > 0 &&
        apellidoPaterno.trim().length > 0 &&
        apellidoMaterno.trim().length > 0 &&
        validarDni(dni) &&
        consiente
      );
    }
    return razonSocial.trim().length > 0 && validarRuc(ruc);
  }, [
    emailOk,
    passwordOk,
    captchaToken,
    rol,
    nombres,
    apellidoPaterno,
    apellidoMaterno,
    dni,
    consiente,
    razonSocial,
    ruc,
  ]);

  /**
   * Construye el body que espera /api/auth/register según el rol.
   * El endpoint discrimina por `tipo` ("ciudadano" | "empresa"), no por `rol`.
   */
  function armarBody() {
    const comun = { email: email.trim(), password, captchaToken };
    if (rol === "ciudadano") {
      return {
        ...comun,
        tipo: "ciudadano" as const,
        datos: {
          nombres: nombres.trim(),
          apellidoPaterno: apellidoPaterno.trim(),
          apellidoMaterno: apellidoMaterno.trim(),
          dni: dni.trim(),
        },
      };
    }
    return {
      ...comun,
      tipo: "empresa" as const,
      tipoOrganizacion,
      datos: { ruc: ruc.trim(), razonSocial: razonSocial.trim() },
    };
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formularioOk || enviando) return;
    setEnviando(true);
    setErrorServidor(null);
    setCampoMal(null);
    try {
      const res = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(armarBody()),
      });
      if (res.ok) {
        // El cookie de sesión lo setea el servidor (httpOnly); volvemos al inicio.
        router.push("/");
        router.refresh();
        return;
      }
      // El handler devuelve { error, campo } (mapeo de AuthError).
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      setErrorServidor(
        typeof data.error === "string" ? data.error : "No se pudo crear la cuenta",
      );
      setCampoMal(typeof data.campo === "string" ? data.campo : null);
    } catch {
      setErrorServidor("Error de red. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <header className="site">
        <h1>🔎 Lupa Fiscal</h1>
        <p>Crea tu cuenta para hacer seguimiento a las obras públicas.</p>
      </header>

      <div className="wrap">
        <form style={estilos.panel} onSubmit={onSubmit} noValidate>
          <h2 style={{ marginTop: 0, color: "var(--navy)" }}>Crear cuenta</h2>

          {/* --- Selector de rol --- */}
          <div style={estilos.rolFila} role="tablist" aria-label="Tipo de cuenta">
            <button
              type="button"
              role="tab"
              aria-selected={rol === "ciudadano"}
              style={
                rol === "ciudadano"
                  ? { ...estilos.rolBtn, ...estilos.rolBtnActivo }
                  : estilos.rolBtn
              }
              onClick={() => {
                setRol("ciudadano");
                setCampoMal(null);
              }}
            >
              👤 Ciudadano
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={rol === "empresa"}
              style={
                rol === "empresa"
                  ? { ...estilos.rolBtn, ...estilos.rolBtnActivo }
                  : estilos.rolBtn
              }
              onClick={() => {
                setRol("empresa");
                setCampoMal(null);
              }}
            >
              🏢 Empresa / Institución
            </button>
          </div>

          {errorServidor && (
            <div
              style={{
                ...estilos.avisoBox,
                borderColor: "var(--alto)",
                background: "#fef2f2",
                color: "var(--alto)",
              }}
              role="alert"
            >
              {errorServidor}
            </div>
          )}

          {/* --- Email + contraseña (común) --- */}
          <div style={estilos.campo}>
            <label style={estilos.label} htmlFor="email">
              Correo electrónico
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputEstilo(campoMal === "email")}
              required
            />
            {email.length > 0 && !emailOk && (
              <div style={estilos.error}>Correo electrónico inválido.</div>
            )}
          </div>

          <div style={estilos.campo}>
            <label style={estilos.label} htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputEstilo(campoMal === "password")}
              required
            />
            <div style={password.length > 0 && !passwordOk ? estilos.error : estilos.ayuda}>
              Mínimo 10 caracteres.
            </div>
          </div>

          {/* --- Campos del CIUDADANO --- */}
          {rol === "ciudadano" && (
            <>
              <div style={estilos.campo}>
                <label style={estilos.label} htmlFor="nombres">
                  Nombres
                </label>
                <input
                  id="nombres"
                  type="text"
                  autoComplete="given-name"
                  value={nombres}
                  onChange={(e) => setNombres(e.target.value)}
                  style={inputEstilo(campoMal === "nombres")}
                  required
                />
              </div>

              <div style={estilos.campo}>
                <label style={estilos.label} htmlFor="apellidoPaterno">
                  Apellido paterno
                </label>
                <input
                  id="apellidoPaterno"
                  type="text"
                  value={apellidoPaterno}
                  onChange={(e) => setApellidoPaterno(e.target.value)}
                  style={inputEstilo(campoMal === "apellidoPaterno")}
                  required
                />
              </div>

              <div style={estilos.campo}>
                <label style={estilos.label} htmlFor="apellidoMaterno">
                  Apellido materno
                </label>
                <input
                  id="apellidoMaterno"
                  type="text"
                  value={apellidoMaterno}
                  onChange={(e) => setApellidoMaterno(e.target.value)}
                  style={inputEstilo(campoMal === "apellidoMaterno")}
                  required
                />
              </div>

              <div style={estilos.campo}>
                <label style={estilos.label} htmlFor="dni">
                  DNI
                </label>
                <input
                  id="dni"
                  type="text"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="8 dígitos"
                  value={dni}
                  onChange={(e) => setDni(e.target.value)}
                  style={inputEstilo(campoMal === "dni" || dniOk === false)}
                  required
                />
                {dniOk === false && (
                  <div style={estilos.error}>
                    DNI inválido: deben ser 8 dígitos (verificador opcional).
                  </div>
                )}
              </div>

              {/* --- Consentimiento informado (minimización de datos) --- */}
              <label style={estilos.consent}>
                <input
                  type="checkbox"
                  checked={consiente}
                  onChange={(e) => setConsiente(e.target.checked)}
                  style={{ marginTop: 2 }}
                />
                <span>
                  Doy mi consentimiento libre e informado para que Lupa Fiscal trate
                  mis datos personales (nombres, apellidos y DNI) con la única
                  finalidad de crear y gestionar mi cuenta. Solo se solicita lo
                  mínimo necesario; no se compartirán con terceros y puedo
                  solicitar su eliminación en cualquier momento (Ley N° 29733 de
                  Protección de Datos Personales).
                </span>
              </label>
            </>
          )}

          {/* --- Campos de la EMPRESA / INSTITUCIÓN --- */}
          {rol === "empresa" && (
            <>
              <div style={estilos.campo}>
                <label style={estilos.label} htmlFor="tipoOrganizacion">
                  Tipo de organización
                </label>
                <select
                  id="tipoOrganizacion"
                  value={tipoOrganizacion}
                  onChange={(e) =>
                    setTipoOrganizacion(e.target.value as TipoOrganizacion)
                  }
                  style={estilos.input}
                >
                  <option value="empresa">Empresa privada</option>
                  <option value="institucion">Institución pública</option>
                </select>
              </div>

              <div style={estilos.campo}>
                <label style={estilos.label} htmlFor="ruc">
                  RUC
                </label>
                <input
                  id="ruc"
                  type="text"
                  inputMode="numeric"
                  maxLength={11}
                  placeholder="11 dígitos"
                  value={ruc}
                  onChange={(e) => setRuc(e.target.value)}
                  style={inputEstilo(campoMal === "ruc" || rucOk === false)}
                  required
                />
                {rucOk === false && (
                  <div style={estilos.error}>
                    RUC inválido: 11 dígitos con dígito verificador incorrecto.
                  </div>
                )}
              </div>

              <div style={estilos.campo}>
                <label style={estilos.label} htmlFor="razonSocial">
                  Razón social
                </label>
                <input
                  id="razonSocial"
                  type="text"
                  autoComplete="organization"
                  value={razonSocial}
                  onChange={(e) => setRazonSocial(e.target.value)}
                  style={inputEstilo(campoMal === "razonSocial")}
                  required
                />
              </div>
            </>
          )}

          {/* --- Captcha (anti-bots; el servidor lo exige siempre) --- */}
          <div style={estilos.campo}>
            <Captcha onResolved={setCaptchaToken} />
            {campoMal === "captcha" && (
              <div style={estilos.error}>Resuelve el captcha para continuar.</div>
            )}
          </div>

          <button
            type="submit"
            style={
              formularioOk && !enviando
                ? estilos.enviar
                : { ...estilos.enviar, ...estilos.enviarOff }
            }
            disabled={!formularioOk || enviando}
          >
            {enviando ? "Creando cuenta…" : "Crear cuenta"}
          </button>

          <div style={estilos.pie}>
            ¿Ya tienes cuenta? <Link href="/login">Inicia sesión</Link>
          </div>
        </form>
      </div>
    </>
  );
}
