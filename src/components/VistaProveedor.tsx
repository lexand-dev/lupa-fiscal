"use client";

import { useState } from "react";
import { colorNivel, etiquetaNivel, money } from "@/lib/format";

interface ContratoFila {
  ocid: string;
  nombre: string;
  entidad: string;
  region: string;
  monto: number | null;
  postores: number | null;
  nivel: string;
  nBanderas: number;
}
interface Perfil {
  ruc: string;
  razonSocial: string;
  puntaje: number;
  color: string;
  nivel: string;
  metricas: {
    totalContratos: number;
    pctPostorUnico: number | null;
    numCompradores: number;
    shareTopComprador: number | null;
    topCompradorNombre: string | null;
    sancionado: boolean;
    obrasParalizadas: number;
  };
  banderas: { codigo: string; peso: number; detalle: string }[];
}

const EJEMPLOS = [
  { ruc: "20511037001", nombre: "Grupo Santa Fe" },
  { ruc: "20100210909", nombre: "La Positiva Seguros" },
  { ruc: "20467534026", nombre: "América Móvil" },
];

export default function VistaProveedor() {
  const [ruc, setRuc] = useState("");
  const [perfil, setPerfil] = useState<Perfil | null>(null);
  const [contratos, setContratos] = useState<ContratoFila[]>([]);
  const [estado, setEstado] = useState<"idle" | "cargando" | "ok" | "vacio" | "error">("idle");
  const [msg, setMsg] = useState("");

  async function analizar(valor?: string) {
    const r = (valor ?? ruc).trim();
    if (valor) setRuc(valor);
    if (!/^\d{11}$/.test(r)) {
      setEstado("error");
      setMsg("El RUC debe tener 11 dígitos.");
      return;
    }
    setEstado("cargando");
    try {
      const res = await fetch(`/api/proveedores/${r}`);
      if (res.status === 404) {
        setEstado("vacio");
        setPerfil(null);
        return;
      }
      if (!res.ok) {
        const e = await res.json().catch(() => ({}));
        setEstado("error");
        setMsg(e.error || "RUC inválido.");
        return;
      }
      const d = await res.json();
      setPerfil(d.perfil);
      setContratos(d.contratos ?? []);
      setEstado("ok");
    } catch {
      setEstado("error");
      setMsg("Error de red.");
    }
  }

  const m = perfil?.metricas;

  return (
    <section>
      <div className="title-row">
        <div>
          <h1>Debida diligencia de proveedores</h1>
          <p className="sub">
            Antes de contratar, busca una empresa por RUC y revisa su perfil de riesgo en compra
            pública: postor único, sobrecostos, concentración con una entidad y sanciones.
          </p>
        </div>
      </div>

      <div className="law">
        ⚖️ <b>Ley 30424.</b> Toda empresa debe hacer debida diligencia de sus proveedores y socios
        de negocio. Esto es el semáforo de integridad en compra pública de tu contraparte, en
        segundos.
      </div>

      <div className="search">
        <input
          value={ruc}
          onChange={(e) => setRuc(e.target.value.replace(/\D/g, "").slice(0, 11))}
          onKeyDown={(e) => e.key === "Enter" && analizar()}
          inputMode="numeric"
          maxLength={11}
          placeholder="Ingresa el RUC (11 dígitos)"
        />
        <button onClick={() => analizar()}>Analizar</button>
      </div>
      <div className="samples">
        {EJEMPLOS.map((e) => (
          <button key={e.ruc} onClick={() => analizar(e.ruc)}>
            {e.ruc} · {e.nombre}
          </button>
        ))}
      </div>

      {estado === "cargando" && <div className="spin">Analizando contrataciones del RUC…</div>}
      {estado === "error" && (
        <div className="law" style={{ background: "#fff", borderColor: "var(--line)", color: "var(--seal)" }}>{msg}</div>
      )}
      {estado === "vacio" && (
        <div className="law" style={{ background: "#fff", borderColor: "var(--line)", color: "var(--muted)" }}>
          No hay registros en compra pública (2025) para ese RUC. Prueba uno de los ejemplos.
        </div>
      )}

      {estado === "ok" && perfil && m && (
        <>
          <div className="phead">
            <div
              className="s"
              style={{
                width: 56, height: 56, borderRadius: 12, display: "grid", placeItems: "center",
                fontWeight: 800, fontSize: 24, color: "#fff", background: colorNivel(perfil.nivel),
              }}
            >
              {perfil.puntaje}
            </div>
            <div style={{ flex: 1 }}>
              <div className="nm">{perfil.razonSocial}</div>
              <div className="ruc">RUC {perfil.ruc} · riesgo {etiquetaNivel(perfil.nivel)}</div>
            </div>
            {m.sancionado ? (
              <span className="badge bad">⛔ SANCIONADO / INHABILITADO</span>
            ) : (
              <span className="badge good">✓ Sin sanción registrada</span>
            )}
          </div>

          <div className="pmetrics">
            <div className="pm">
              <div className="n">{m.totalContratos.toLocaleString("es-PE")}</div>
              <div className="k">Contratos públicos (2025)</div>
            </div>
            <div className="pm">
              <div className="n" style={{ color: (m.pctPostorUnico ?? 0) >= 60 ? "var(--seal)" : "inherit" }}>
                {m.pctPostorUnico == null ? "—" : `${m.pctPostorUnico.toFixed(0)}%`}
              </div>
              <div className="k">Procesos con postor único</div>
            </div>
            <div className="pm">
              <div className="n">{m.numCompradores}</div>
              <div className="k">Entidades que le compran</div>
            </div>
            <div className="pm">
              <div className="n" style={{ color: (m.shareTopComprador ?? 0) >= 0.5 ? "var(--seal)" : "inherit" }}>
                {m.shareTopComprador == null ? "—" : `${(m.shareTopComprador * 100).toFixed(0)}%`}
              </div>
              <div className="k">Concentración 1 comprador</div>
            </div>
          </div>

          {perfil.banderas.length > 0 && (
            <>
              <span className="label">Señales detectadas</span>
              <div className="flagdetail" style={{ marginTop: 8 }}>
                {perfil.banderas.map((b) => (
                  <div className="fd" key={b.codigo}>
                    <span style={{ fontSize: 18 }}>🚩</span>
                    <div><b>{b.codigo.replace(/_/g, " ")}</b><span>{b.detalle}</span></div>
                    <span className="w">peso {b.peso}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <span className="label">Contratos (top 50 por monto)</span>
          <table style={{ marginTop: 10 }}>
            <thead>
              <tr><th>Contrato</th><th>Entidad</th><th>Depto</th><th>Monto</th><th>Banderas</th></tr>
            </thead>
            <tbody>
              {contratos.map((c) => (
                <tr key={c.ocid}>
                  <td>{c.nombre.slice(0, 50)}</td>
                  <td>{c.entidad.slice(0, 34)}</td>
                  <td>{c.region}</td>
                  <td>{money(c.monto)}</td>
                  <td>{c.nBanderas > 0 ? <span className="pill">{c.nBanderas} 🚩</span> : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <div className="foot" style={{ textAlign: "left", marginTop: 14 }}>
            Señal de integridad en compra pública (OCDS 2025). No sustituye la debida diligencia
            completa (salud financiera, beneficiario final, litigios privados). Sanción = pendiente
            integrar RNSSC.
          </div>
        </>
      )}
    </section>
  );
}
