"use client";

import type { ObraEvaluada } from "@/application/ports";
import { ESTADO_LABEL, money } from "@/lib/format";

/** Texto de una solicitud de acceso a información pública (Ley 27806) pre-armada. */
function textoSolicitud(o: ObraEvaluada): string {
  const banderas = o.evaluacion.banderas.map((b) => `  - ${b.detalle}`).join("\n");
  return `Solicitud de acceso a información pública (Ley N° 27806)

A: ${o.entidad.nombre}
Asunto: Estado de la obra "${o.obra.nombre}"

Solicito información sobre la obra "${o.obra.nombre}" (región ${o.entidad.region}), que figura como ${ESTADO_LABEL[o.obra.estado]?.toLowerCase() ?? o.obra.estado} con una inversión de ${money(o.obra.montoInversion)}.

En particular solicito:
1. Motivo y fecha de la paralización, y plan de reactivación si existe.
2. Expediente de contratación del proceso ${o.contrato?.ocid ?? "(OCID no disponible)"}.
3. Adendas, ampliaciones de plazo y penalidades aplicadas al contratista.

Señales de riesgo detectadas automáticamente sobre el contrato:
${banderas || "  - (sin señales)"}

Quedo a la espera de respuesta dentro del plazo de ley.`;
}

export default function ObraCard({ o }: { o: ObraEvaluada }) {
  const nivel = o.evaluacion.nivel;
  const avance = o.obra.avanceFisico;

  return (
    <article className={`card ${nivel}`}>
      <h3>{o.obra.nombre}</h3>
      <div className="meta">
        {o.entidad.nombre} · {o.entidad.region} · {ESTADO_LABEL[o.obra.estado] ?? o.obra.estado}
        {o.obra.estado === "paralizada" && o.obra.mesesParada != null
          ? ` · ${o.obra.mesesParada} meses parada`
          : ""}
      </div>

      <div className="montos">
        <span>
          Inversión
          <b>{money(o.obra.montoInversion)}</b>
        </span>
        {o.contrato && (
          <span>
            Adjudicado
            <b>{money(o.contrato.montoAdjudicado)}</b>
          </span>
        )}
        <span>
          Riesgo
          <b>
            <span className={`badge ${nivel}`}>
              {nivel} · {o.evaluacion.puntaje}
            </span>
          </b>
        </span>
      </div>

      {avance != null && (
        <div className="avance" title={`Avance físico ${avance}%`}>
          <span style={{ width: `${Math.max(0, Math.min(100, avance))}%` }} />
        </div>
      )}

      {o.evaluacion.banderas.length > 0 && (
        <ul className="banderas">
          {o.evaluacion.banderas.map((b) => (
            <li key={b.codigo}>
              <span className="peso">+{b.peso}</span>
              {b.detalle}
            </li>
          ))}
        </ul>
      )}

      <details className="accion">
        <summary>¿Y ahora qué? → Pre-armar solicitud de información</summary>
        <textarea readOnly value={textoSolicitud(o)} onFocus={(e) => e.currentTarget.select()} />
      </details>
    </article>
  );
}
