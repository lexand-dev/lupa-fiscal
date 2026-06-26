"use client";

import { useEffect, useRef } from "react";
import type { ObraEvaluada } from "@/application/ports";

const COLOR: Record<string, string> = {
  alto: "#dc2626",
  medio: "#f59e0b",
  bajo: "#16a34a",
};

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
    const pts: [number, number][] = [];
    for (const o of obras) {
      const { lat, lng } = o.obra;
      if (lat == null || lng == null) continue;
      const color = COLOR[o.evaluacion.nivel] ?? COLOR.bajo;
      const marker = L.circleMarker([lat, lng], {
        radius: 9,
        color,
        fillColor: color,
        fillOpacity: 0.75,
        weight: 2,
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
