"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ObraEvaluada, RegionResumen } from "@/application/ports";
import { ESTADO_LABEL, colorNivel, etiquetaNivel, idProveedor, money, moneyCorto, nombreBandera, tipoObra } from "@/lib/format";
import Info from "@/components/Info";

const MapaObras = dynamic(() => import("@/components/MapaObras"), {
  ssr: false,
  loading: () => <div id="mapa" />,
});

export default function VistaCiudadano() {
  const [regiones, setRegiones] = useState<RegionResumen[]>([]);
  const [region, setRegion] = useState<string>("");
  const [obras, setObras] = useState<ObraEvaluada[]>([]);
  const [cargando, setCargando] = useState(false);
  const [sel, setSel] = useState<ObraEvaluada | null>(null);
  const [categoria, setCategoria] = useState<string>("");

  useEffect(() => {
    fetch("/api/regiones")
      .then((r) => r.json())
      .then((d) => {
        const rs: RegionResumen[] = (d.regiones ?? []).sort(
          (a: RegionResumen, b: RegionResumen) => b.totalObras - a.totalObras,
        );
        setRegiones(rs);
        if (rs.length) setRegion(rs[0].region);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!region) return;
    setCargando(true);
    setSel(null);
    const url = `/api/obras?region=${encodeURIComponent(region)}${categoria ? `&categoria=${categoria}` : ""}`;
    fetch(url)
      .then((r) => r.json())
      .then((d) => setObras(d.obras ?? []))
      .catch(() => setObras([]))
      .finally(() => setCargando(false));
  }, [region, categoria]);

  const resumen = useMemo(() => regiones.find((r) => r.region === region), [regiones, region]);
  const ordenadas = useMemo(
    () => [...obras].sort((a, b) => b.evaluacion.puntaje - a.evaluacion.puntaje),
    [obras],
  );
  const inversionTop = obras.reduce((s, o) => s + (o.obra.montoInversion ?? 0), 0);
  const conRiesgo = obras.filter((o) => o.evaluacion.banderas.length > 0).length;

  return (
    <section>
      <div className="title-row">
        <div>
          <h1>Contrataciones públicas cerca de ti</h1>
          <p className="sub">
            Elige tu departamento y revisa las contrataciones del Estado con señales de riesgo en
            el contrato. Datos reales OCDS del OECE (SEACE), 2025.
          </p>
        </div>
      </div>

      <div className="filters">
        {regiones.map((r) => (
          <button
            key={r.region}
            className={r.region === region ? "on" : ""}
            onClick={() => setRegion(r.region)}
          >
            {r.region} ({r.totalObras.toLocaleString("es-PE")})
          </button>
        ))}
      </div>

      <div className="filters">
        <span className="label" style={{ alignSelf: "center", marginRight: 4 }}>
          Tipo
          <Info texto="OCDS clasifica cada proceso: Obras (works) = construcción física; Bienes = compra de productos; Servicios = contratos de servicio. Solo ~12% son obras." />
        </span>
        {[
          { v: "", n: "Todas" },
          { v: "works", n: "🏗 Obras" },
          { v: "goods", n: "📦 Bienes" },
          { v: "services", n: "🛠 Servicios" },
        ].map((c) => (
          <button key={c.v} className={categoria === c.v ? "on" : ""} onClick={() => setCategoria(c.v)}>
            {c.n}
          </button>
        ))}
      </div>

      <div className="stats">
        <div className="stat">
          <div className="n">{(resumen?.totalObras ?? 0).toLocaleString("es-PE")}</div>
          <div className="k">Procesos en {region || "—"}</div>
        </div>
        <div className="stat">
          <div className="n red">{conRiesgo}</div>
          <div className="k">Con señales de riesgo (top 300)</div>
        </div>
        <div className="stat">
          <div className="n">{moneyCorto(inversionTop)}</div>
          <div className="k">Inversión analizada (top 300)</div>
        </div>
      </div>

      <div className="split">
        <div className="mapcard">
          <span className="label">Mapa · por departamento</span>
          <MapaObras obras={obras} onSelect={(id) => setSel(obras.find((o) => o.obra.id === id) ?? null)} />
          <div className="legend">
            <span><i style={{ background: "var(--verify)" }} />Riesgo bajo</span>
            <span><i style={{ background: "var(--warn)" }} />Medio</span>
            <span><i style={{ background: "var(--seal)" }} />Alto</span>
            <span style={{ marginLeft: "auto" }}>Tamaño = monto del contrato</span>
          </div>
        </div>

        <div className="listcard">
          {cargando && <div className="spin">Cargando contrataciones…</div>}
          {!cargando && ordenadas.length === 0 && (
            <div className="empty">No hay contrataciones cargadas para esta región.</div>
          )}
          {!cargando &&
            ordenadas.map((o) => (
              <div
                key={o.obra.id}
                className={`obra ${sel?.obra.id === o.obra.id ? "sel" : ""}`}
                onClick={() => setSel(o)}
              >
                <div className="score" style={{ background: colorNivel(o.evaluacion.nivel) }}>
                  {o.evaluacion.puntaje}
                </div>
                <div>
                  <div className="nm">{o.obra.nombre}</div>
                  <div className="meta">
                    {o.entidad.nombre} · {o.entidad.region} · {money(o.obra.montoInversion)}
                  </div>
                  <div className="fls">
                    {o.evaluacion.banderas.length > 0 ? (
                      o.evaluacion.banderas.map((b) => (
                        <span key={b.codigo} className="ftag r">🚩 {b.codigo.replace(/_/g, " ").toLowerCase()}</span>
                      ))
                    ) : (
                      <span className="ftag">sin banderas</span>
                    )}
                  </div>
                </div>
              </div>
            ))}
        </div>
      </div>

      <div className="foot">
        Datos reales OCDS del OECE/SEACE (CC BY 4.0). estado/avance = &quot;requiere INFOBRAS&quot;.
        Las señales son indicios que ameritan revisión, no una acusación.
      </div>

      {/* Drawer ficha */}
      <div className={`backdrop ${sel ? "show" : ""}`} onClick={() => setSel(null)} />
      <aside className={`drawer ${sel ? "open" : ""}`} aria-label="Detalle de contratación">
        {sel && (
          <>
            <div className="dhead">
              <span className="label">Ficha de la contratación</span>
              <button className="dclose" onClick={() => setSel(null)} aria-label="Cerrar">×</button>
              <div style={{ fontWeight: 800, fontSize: 17, marginTop: 8, lineHeight: 1.2 }}>
                {sel.obra.nombre}
              </div>
            </div>
            <div className="dbody">
              <div className="ficha-riesgo" style={{ borderLeftColor: colorNivel(sel.evaluacion.nivel) }}>
                <div className="big" style={{ background: colorNivel(sel.evaluacion.nivel) }}>
                  {sel.evaluacion.puntaje}
                </div>
                <div>
                  <div className="rt">
                    Riesgo {etiquetaNivel(sel.evaluacion.nivel)}
                    <Info texto="Suma de las señales detectadas en el contrato. No es una acusación: son indicios que ameritan revisión." />
                  </div>
                  <div className="rx">
                    {sel.evaluacion.nivel === "alto"
                      ? "Tiene varias señales que ameritan revisión a fondo."
                      : sel.evaluacion.nivel === "medio"
                        ? "Tiene alguna señal que conviene revisar."
                        : "No detectamos señales de riesgo en este contrato."}
                  </div>
                </div>
              </div>

              <p className="ficha-lead">
                {tipoObra(sel.obra.categoria)} de <b>{sel.entidad.nombre}</b> en <b>{sel.entidad.region}</b>.
              </p>

              <div className="cifras">
                <div className="c">
                  <div className="n">{money(sel.contrato?.montoAdjudicado ?? sel.obra.montoInversion)}</div>
                  <div className="k">Monto pagado</div>
                </div>
                <div className="c">
                  <div className="n">{money(sel.contrato?.valorReferencial)}</div>
                  <div className="k">Precio estimado</div>
                </div>
              </div>

              <div className="bloque">
                <div className="dato"><span>Empresa que ganó</span><span className="v">{sel.proveedor?.razonSocial ?? "—"}</span></div>
                <div className="dato"><span>Identificación</span><span className="v">{sel.proveedor ? idProveedor(sel.proveedor.ruc) : "—"}</span></div>
                <div className="dato">
                  <span>Empresas que compitieron <Info texto="Cuántas empresas se presentaron. 1 = nadie más compitió." /></span>
                  <span className="v">{sel.contrato?.numPostores ?? "—"}{sel.contrato?.numPostores === 1 ? " · sin competencia" : ""}</span>
                </div>
                <div className="dato">
                  <span>Estado de la obra <Info texto="Si está paralizada y su avance físico. Viene de INFOBRAS (en integración)." /></span>
                  <span className="v">{ESTADO_LABEL[sel.obra.estado] ?? sel.obra.estado}</span>
                </div>
              </div>

              <div className="bloque">
                <h4>¿Por qué aparece con riesgo?</h4>
                {sel.evaluacion.banderas.length > 0 ? (
                  sel.evaluacion.banderas.map((b) => (
                    <div className="senal" key={b.codigo}>
                      <span style={{ fontSize: 18 }}>🚩</span>
                      <div>
                        <b>{nombreBandera(b.codigo)}</b>
                        <span>{b.detalle}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div style={{ fontSize: 13.5, color: "var(--muted)" }}>
                    Sin señales — este contrato no disparó ninguna bandera.
                  </div>
                )}
              </div>

              <button
                className="cta"
                onClick={() =>
                  alert(
                    "Lupa pre-arma una denuncia para el SINAD de la Contraloría con los datos de esta contratación (entidad, monto, código, señales). No la envía.",
                  )
                }
              >
                Reportar a la Contraloría →
              </button>
              <button
                className="cta ghost"
                onClick={() =>
                  alert("Lupa pre-arma un pedido de acceso a información pública (Ley 27806) con los datos del proceso.")
                }
              >
                Pedir acceso a información
              </button>

              <details className="tecnico">
                <summary>Ver detalles técnicos (periodistas / auditores)</summary>
                <div className="dato"><span>Código del proceso (OCID)</span><span className="v mono">{sel.contrato?.ocid}</span></div>
                <div className="dato"><span>CUI (llave a INFOBRAS)</span><span className="v mono">{sel.contrato?.cui ?? "no aplica"}</span></div>
              </details>
            </div>
          </>
        )}
      </aside>
    </section>
  );
}
