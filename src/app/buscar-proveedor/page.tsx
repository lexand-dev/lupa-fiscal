"use client";

/**
 * app/buscar-proveedor/page.tsx — Lupa Fiscal
 *
 * Corazón del pitch a los 3 públicos (ciudadano · periodista · funcionario):
 * consulta el perfil de riesgo de un proveedor por su RUC y muestra el semáforo
 * con motivos explicables.
 *
 * Flujo:
 *   1. El usuario escribe un RUC -> se valida EN EL CLIENTE con validarRuc (mismo
 *      validador del dominio, módulo 11 SUNAT), sin pegarle al servidor en balde.
 *   2. Resuelve el captcha matemático propio (componente Captcha, sin libs).
 *   3. Al enviar se llama GET /api/proveedores/[ruc] (token del captcha en query)
 *      y se pinta <PerfilRiesgo /> con el resultado.
 *
 * Reutiliza las clases de globals.css (header.site / wrap / controls / stat / empty…).
 */
import { useState } from "react";
import Captcha from "@/components/Captcha";
import PerfilRiesgo from "@/components/PerfilRiesgo";
import { validarRuc } from "@/domain/validators";
import type { PerfilRiesgoProveedor } from "@/domain/proveedor-risk";

type Estado = "inicial" | "cargando" | "ok" | "no_encontrado" | "error";

export default function BuscarProveedor() {
  const [ruc, setRuc] = useState("");
  const [captchaToken, setCaptchaToken] = useState<string | null>(null);
  const [estado, setEstado] = useState<Estado>("inicial");
  const [perfil, setPerfil] = useState<PerfilRiesgoProveedor | null>(null);
  const [mensaje, setMensaje] = useState("");

  const rucLimpio = ruc.trim();
  const rucValido = validarRuc(rucLimpio);
  const puedeConsultar =
    rucValido && captchaToken !== null && estado !== "cargando";

  async function consultar(e: React.FormEvent) {
    e.preventDefault();
    // Defensa: aunque el botón se deshabilita, revalidamos antes de pegarle a la API.
    if (!rucValido) {
      setEstado("error");
      setMensaje("El RUC no es válido (deben ser 11 dígitos con verificador correcto).");
      return;
    }
    if (!captchaToken) {
      setEstado("error");
      setMensaje("Resuelve la verificación humana antes de consultar.");
      return;
    }

    setEstado("cargando");
    setMensaje("");
    setPerfil(null);
    try {
      const url = `/api/proveedores/${encodeURIComponent(rucLimpio)}?captcha=${encodeURIComponent(captchaToken)}`;
      const res = await fetch(url);
      if (res.status === 404) {
        setEstado("no_encontrado");
        return;
      }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setEstado("error");
        setMensaje(data?.error ?? "No se pudo consultar el proveedor.");
        return;
      }
      const data = (await res.json()) as PerfilRiesgoProveedor;
      setPerfil(data);
      setEstado("ok");
    } catch {
      setEstado("error");
      setMensaje("Error de red al consultar el proveedor.");
    }
  }

  return (
    <>
      <header className="site">
        <h1>🔎 Lupa Fiscal — Consulta por RUC</h1>
        <p>
          Escribe el RUC de un proveedor del Estado y mira su semáforo de riesgo:
          adjudicaciones a dedo, sobrecostos, captura de un comprador, sanciones y
          obras paralizadas asociadas.
        </p>
      </header>

      <div className="wrap">
        <form className="controls" onSubmit={consultar}>
          <div>
            <label htmlFor="ruc">RUC del proveedor</label>
            <input
              id="ruc"
              inputMode="numeric"
              autoComplete="off"
              placeholder="20100070970"
              maxLength={11}
              value={ruc}
              onChange={(e) => setRuc(e.target.value.replace(/\D/g, ""))}
              aria-invalid={rucLimpio.length > 0 && !rucValido}
              style={{
                padding: "10px 14px",
                fontSize: "1rem",
                border: "1px solid var(--border)",
                borderRadius: 8,
                background: "#fff",
                minWidth: 240,
                letterSpacing: "1px",
              }}
            />
            {rucLimpio.length > 0 && !rucValido && (
              <div className="fuente-nota" style={{ color: "var(--alto)" }}>
                RUC inválido (11 dígitos + verificador SUNAT).
              </div>
            )}
          </div>

          <Captcha
            onResolved={(token) => setCaptchaToken(token === "" ? null : token)}
          />

          <div>
            <button
              type="submit"
              disabled={!puedeConsultar}
              style={{
                padding: "10px 20px",
                fontSize: "1rem",
                fontWeight: 700,
                color: "#fff",
                background: puedeConsultar ? "var(--accent)" : "var(--ink-soft)",
                border: "none",
                borderRadius: 8,
                cursor: puedeConsultar ? "pointer" : "not-allowed",
              }}
            >
              {estado === "cargando" ? "Consultando…" : "Consultar riesgo"}
            </button>
          </div>
        </form>

        {estado === "cargando" && <div className="empty">Consultando el RUC…</div>}

        {estado === "no_encontrado" && (
          <div className="empty">
            No se encontraron contrataciones para el RUC {rucLimpio}.
          </div>
        )}

        {estado === "error" && mensaje && (
          <div className="empty" style={{ color: "var(--alto)" }}>
            {mensaje}
          </div>
        )}

        {estado === "ok" && perfil && (
          <div className="lista" style={{ maxHeight: "none" }}>
            <PerfilRiesgo perfil={perfil} />
          </div>
        )}
      </div>
    </>
  );
}
