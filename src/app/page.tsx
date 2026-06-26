"use client";

import { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { ObraEvaluada, RegionResumen } from "@/application/ports";
import ObraCard from "@/components/ObraCard";
import { money } from "@/lib/format";

// El mapa solo se renderiza en el cliente (Leaflet usa window).
const MapaObras = dynamic(() => import("@/components/MapaObras"), {
  ssr: false,
  loading: () => <div id="mapa" />,
});

export default function Home() {
  const [regiones, setRegiones] = useState<RegionResumen[]>([]);
  const [fuente, setFuente] = useState<string>("");
  const [region, setRegion] = useState<string>("");
  const [obras, setObras] = useState<ObraEvaluada[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetch("/api/regiones")
      .then((r) => r.json())
      .then((d) => {
        const rs: RegionResumen[] = d.regiones ?? [];
        setRegiones(rs);
        setFuente(d.fuente ?? "");
        if (rs.length) setRegion(rs[0].region);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!region) return;
    setLoading(true);
    fetch(`/api/obras?region=${encodeURIComponent(region)}`)
      .then((r) => r.json())
      .then((d) => setObras(d.obras ?? []))
      .catch(() => setObras([]))
      .finally(() => setLoading(false));
  }, [region]);

  const resumen = useMemo(
    () => regiones.find((r) => r.region === region),
    [regiones, region],
  );
  const totalNacional = useMemo(
    () => regiones.reduce((s, r) => s + r.inversionCongelada, 0),
    [regiones],
  );
  const conBanderas = obras.filter((o) => o.evaluacion.banderas.length > 0).length;

  return (
    <>
      <header className="site">
        <h1>🔎 Lupa Fiscal</h1>
        <p>
          Obras públicas paralizadas cerca de ti — cuánta plata está congelada y qué
          señales de riesgo tiene el contrato que las financió.
        </p>
      </header>

      <div className="wrap">
        <div className="controls">
          <div>
            <label htmlFor="region">Elige tu región</label>
            <select
              id="region"
              value={region}
              onChange={(e) => setRegion(e.target.value)}
            >
              {regiones.map((r) => (
                <option key={r.region} value={r.region}>
                  {r.region} ({r.totalParalizadas} paralizadas)
                </option>
              ))}
            </select>
            {fuente && (
              <div className="fuente-nota">
                Fuente de datos: {fuente === "seed" ? "demo precargada" : "PostgreSQL"}
              </div>
            )}
          </div>
        </div>

        <div className="stats">
          <div className="stat">
            <div className="num accent">{money(totalNacional)}</div>
            <div className="lbl">Inversión congelada (regiones cargadas)</div>
          </div>
          <div className="stat">
            <div className="num">{money(resumen?.inversionCongelada ?? 0)}</div>
            <div className="lbl">Congelado en {region || "—"}</div>
          </div>
          <div className="stat">
            <div className="num">{resumen?.totalParalizadas ?? 0}</div>
            <div className="lbl">Obras paralizadas en {region || "—"}</div>
          </div>
          <div className="stat">
            <div className="num">{conBanderas}</div>
            <div className="lbl">Con señales de riesgo</div>
          </div>
        </div>

        <div className="layout">
          <MapaObras obras={obras} />
          <div className="lista">
            {loading && <div className="empty">Cargando obras…</div>}
            {!loading && obras.length === 0 && (
              <div className="empty">No hay obras cargadas para esta región.</div>
            )}
            {!loading &&
              obras.map((o) => <ObraCard key={o.obra.id} o={o} />)}
          </div>
        </div>
      </div>
    </>
  );
}
