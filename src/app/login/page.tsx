"use client";

/**
 * app/login/page.tsx — Lupa Fiscal
 *
 * UI de inicio de sesión (cliente). Email + contraseña + captcha. No distingue
 * roles: el rol se resuelve en el servidor a partir de la cuenta. El mensaje de
 * error es genérico (igual que el caso de uso `login`) para no permitir
 * enumeración de cuentas: nunca decimos si falló el email o la contraseña.
 *
 * Captcha: usa el componente compartido @/components/Captcha (ver WIRING).
 *
 * Postea a /api/auth/login (ver WIRING). El body coincide con DatosLogin de
 * application/auth-use-cases (email, password, captchaToken).
 */
import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import Captcha from "@/components/Captcha";

// Estilos scoped a auth (sin tocar CSS compartido); reusan los tokens var(--…).
const estilos: Record<string, React.CSSProperties> = {
  panel: {
    maxWidth: 460,
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
  aviso: {
    border: "1px solid var(--alto)",
    background: "#fef2f2",
    color: "var(--alto)",
    borderRadius: 8,
    padding: "10px 14px",
    margin: "0 0 16px",
    fontSize: "0.86rem",
  },
  pie: { marginTop: 18, fontSize: "0.86rem", color: "var(--ink-soft)" },
};

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [captchaToken, setCaptchaToken] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  // El botón se habilita con email con forma + password no vacía + captcha.
  // La rigurosidad real (credenciales) la decide el servidor.
  const formularioOk =
    emailOk && password.length > 0 && captchaToken.length > 0;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formularioOk || enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password, captchaToken }),
      });
      if (res.ok) {
        // El cookie de sesión httpOnly lo setea el servidor; volvemos al inicio.
        router.push("/");
        router.refresh();
        return;
      }
      const data = await res.json().catch(() => ({}) as Record<string, unknown>);
      // Mensaje genérico (anti-enumeración): no detallamos qué falló.
      setError(
        typeof data.error === "string" ? data.error : "Credenciales inválidas",
      );
    } catch {
      setError("Error de red. Intenta de nuevo.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <header className="site">
        <h1>🔎 Lupa Fiscal</h1>
        <p>Inicia sesión para seguir las obras públicas de tu región.</p>
      </header>

      <div className="wrap">
        <form style={estilos.panel} onSubmit={onSubmit} noValidate>
          <h2 style={{ marginTop: 0, color: "var(--navy)" }}>Iniciar sesión</h2>

          {error && (
            <div style={estilos.aviso} role="alert">
              {error}
            </div>
          )}

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
              style={estilos.input}
              required
            />
          </div>

          <div style={estilos.campo}>
            <label style={estilos.label} htmlFor="password">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={estilos.input}
              required
            />
          </div>

          {/* Captcha: el servidor lo exige siempre antes de verificar credenciales. */}
          <div style={estilos.campo}>
            <Captcha onResolved={setCaptchaToken} />
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
            {enviando ? "Ingresando…" : "Iniciar sesión"}
          </button>

          <div style={estilos.pie}>
            ¿No tienes cuenta? <Link href="/registro">Regístrate</Link>
          </div>
        </form>
      </div>
    </>
  );
}
