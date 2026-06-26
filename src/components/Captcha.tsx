"use client";

/**
 * components/Captcha.tsx — Lupa Fiscal
 *
 * Captcha emitido por el SERVIDOR (sin libs externas). Pide un reto a
 * GET /api/captcha (el servidor guarda la solución), muestra "a + b =" y, cuando
 * el usuario responde bien, entrega al padre el valor "<token>:<respuesta>" para
 * que el backend lo verifique. El front ya NO es la autoridad del captcha.
 *
 * Contrato hacia el padre (igual que antes: un solo string):
 *   - onResolved(valor) -> "<token>:<respuesta>" cuando la respuesta local cuadra;
 *     "" cuando deja de estar resuelto (respuesta cambiada o reto refrescado).
 *   - onInvalidado?()   -> opcional, además del token vacío.
 */
import { useCallback, useEffect, useState } from "react";

interface Reto {
  token: string;
  a: number;
  b: number;
}

export interface CaptchaProps {
  onResolved: (valor: string) => void;
  onInvalidado?: () => void;
}

export default function Captcha({ onResolved, onInvalidado }: CaptchaProps) {
  const [reto, setReto] = useState<Reto | null>(null);
  const [respuesta, setRespuesta] = useState("");
  const [resuelto, setResuelto] = useState(false);
  const [error, setError] = useState(false);

  const invalidar = useCallback(() => {
    onResolved("");
    onInvalidado?.();
  }, [onResolved, onInvalidado]);

  const cargarReto = useCallback(async () => {
    setRespuesta("");
    setResuelto(false);
    setError(false);
    invalidar();
    try {
      const r = await fetch("/api/captcha", { cache: "no-store" });
      if (!r.ok) throw new Error("captcha");
      const data = (await r.json()) as Reto;
      setReto(data);
    } catch {
      setReto(null);
      setError(true);
    }
  }, [invalidar]);

  // Pide el primer reto tras montar (en cliente).
  useEffect(() => {
    cargarReto();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onCambioRespuesta = (valor: string) => {
    setRespuesta(valor);
    if (!reto) return;
    // La solución se valida también en el servidor; aquí solo es UX.
    const correcta = valor.trim() !== "" && Number(valor) === reto.a + reto.b;
    if (correcta && !resuelto) {
      setResuelto(true);
      onResolved(`${reto.token}:${valor.trim()}`);
    } else if (!correcta && resuelto) {
      setResuelto(false);
      invalidar();
    }
  };

  const inputBase: React.CSSProperties = {
    padding: "10px 14px",
    fontSize: "1rem",
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "#fff",
  };

  return (
    <div>
      <label htmlFor="captcha-respuesta">Verificación humana</label>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <span
          aria-hidden="true"
          style={{
            fontSize: "1.1rem",
            fontWeight: 700,
            color: "var(--navy)",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {error ? "error" : reto ? `${reto.a} + ${reto.b} =` : "…"}
        </span>
        <input
          id="captcha-respuesta"
          inputMode="numeric"
          autoComplete="off"
          placeholder="?"
          value={respuesta}
          disabled={!reto}
          onChange={(e) => onCambioRespuesta(e.target.value)}
          aria-invalid={respuesta !== "" && !resuelto}
          style={{ ...inputBase, width: 80, textAlign: "center" }}
        />
        <button
          type="button"
          onClick={cargarReto}
          title="Generar otra operación"
          style={{ ...inputBase, cursor: "pointer", fontSize: "1.1rem", lineHeight: 1 }}
        >
          ↻
        </button>
        {resuelto && (
          <span title="Verificado" style={{ color: "var(--bajo)", fontWeight: 700 }}>
            ✓
          </span>
        )}
      </div>
      <p className="fuente-nota">
        {error
          ? "No se pudo cargar el captcha. Pulsa ↻ para reintentar."
          : "Resuelve la operación para confirmar que no eres un bot."}
      </p>
    </div>
  );
}
