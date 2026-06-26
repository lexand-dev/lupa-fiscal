"use client";

import { useEffect, useRef } from "react";
import type { ObraEvaluada } from "@/application/ports";

const COLOR: Record<string, string> = {
  alto: "#d24026",
  medio: "#b4530a",
  bajo: "#15514a",
};

/** Radio del marcador por monto (escala sqrt, acotado). */
function radio(monto: number | null, min: number, max: number): number {
  if (monto == null || max <= min) return 7;
  const t = (Math.sqrt(monto) - Math.sqrt(min)) / (Math.sqrt(max) - Math.sqrt(min));
  return 6 + Math.max(0, Math.min(1, t)) * 16;
}

export default function MapaObras({
  obras,
  onSelect,
}: {
  obras: ObraEvaluada[];
  onSelect?: (id: string) => void;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const layerRef = useRef<any>(null);
  const LRef = useRef<any>(null);

  // Inicializa el mapa una sola vez (Leaflet solo existe en el cliente).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const mod = await import("leaflet");
      const L = (mod as any).default ?? mod;
      if (cancelled || !elRef.current || mapRef.current) return;
      LRef.current = L;
      const map = L.map(elRef.current).setView([-9.19, -75.0], 5);
      L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "© OpenStreetMap",
        maxZoom: 18,
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      pintar();
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Repinta marcadores cuando cambian las obras.
  useEffect(() => {
    pintar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [obras]);

  function pintar() {
    const L = LRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    const montos = obras.map((o) => o.obra.montoInversion ?? 0);
    const min = montos.length ? Math.min(...montos) : 0;
    const max = montos.length ? Math.max(...montos) : 0;
    const pts: [number, number][] = [];
    for (const o of obras) {
      const { lat, lng } = o.obra;
      if (lat == null || lng == null) continue;
      const color = COLOR[o.evaluacion.nivel] ?? COLOR.bajo;
      const marker = L.circleMarker([lat, lng], {
        radius: radio(o.obra.montoInversion, min, max),
        color,
        fillColor: color,
        fillOpacity: 0.45,
        weight: 1,
      });
      marker.bindPopup(
        `<b>${o.obra.nombre}</b><br/>${o.entidad.nombre}<br/>` +
          `Riesgo: <b>${o.evaluacion.nivel}</b> (${o.evaluacion.puntaje})`,
      );
      if (onSelect) marker.on("click", () => onSelect(o.obra.id));
      marker.addTo(layer);
      pts.push([lat, lng]);
    }
    if (pts.length) map.fitBounds(pts, { padding: [40, 40], maxZoom: 11 });
  }

  return <div id="mapa" ref={elRef} />;
}
