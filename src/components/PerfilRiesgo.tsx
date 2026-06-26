"use client";

/**
 * components/PerfilRiesgo.tsx — Lupa Fiscal
 *
 * Semáforo + motivos explicables del perfil de riesgo POR PROVEEDOR (RUC).
 * Consume el shape `PerfilRiesgoProveedor` del dominio (domain/proveedor-risk.ts),
 * que ya trae color (verde/ambar/rojo), nivel (alto/medio/bajo), métricas y banderas.
 *
 * No calcula nada: el riesgo se computa en el dominio/backend. Aquí solo se PINTA,
 * usando las clases y variables de globals.css (badge/banderas/card/stat…). El
 * color del semáforo mapea 1:1 con `nivel` para reutilizar las mismas clases CSS
 * (.alto/.medio/.bajo) ya definidas para las obras.
 */
import type {
  ColorSemaforo,
  PerfilRiesgoProveedor,
} from "@/domain/proveedor-risk";
import { money } from "@/lib/format";

/** Mapea el color del semáforo a la clase de nivel ya existente en globals.css. */
const CLASE_NIVEL: Record<ColorSemaforo, string> = {
  verde: "bajo",
  ambar: "medio",
  rojo: "alto",
};

/** Etiqueta legible del semáforo para el ciudadano/periodista. */
const ETIQUETA_SEMAFORO: Record<ColorSemaforo, string> = {
  verde: "Riesgo bajo",
  ambar: "Riesgo medio",
  rojo: "Riesgo alto",
};

/** Formatea un porcentaje 0..100 (o null) de forma legible. */
function pct(valor: number | null): string {
  return valor == null ? "—" : `${valor.toFixed(0)}%`;
}

/** Formatea un ratio 0..1 (o null) como porcentaje. */
function ratioPct(valor: number | null): string {
  return valor == null ? "—" : `${(valor * 100).toFixed(0)}%`;
}

export default function PerfilRiesgo({
  perfil,
}: {
  perfil: PerfilRiesgoProveedor;
}) {
  const clase = CLASE_NIVEL[perfil.color];
  const m = perfil.metricas;

  return (
    <article className={`card ${clase}`}>
      <h3>{perfil.razonSocial || "Proveedor sin razón social"}</h3>
      <div className="meta">RUC {perfil.ruc}</div>

      <div className="montos">
        <span>
          Semáforo
          <b>
            <span className={`badge ${clase}`}>
              {ETIQUETA_SEMAFORO[perfil.color]} · {perfil.puntaje}
            </span>
          </b>
        </span>
        <span>
          Contratos
          <b>{m.totalContratos}</b>
        </span>
        <span>
          Postor único
          <b>{pct(m.pctPostorUnico)}</b>
        </span>
      </div>

      <div className="montos">
        <span>
          Concentración (1 comprador)
          <b>{ratioPct(m.shareTopComprador)}</b>
        </span>
        <span>
          Compradores
          <b>{m.numCompradores}</b>
        </span>
        <span>
          Obras paralizadas
          <b>{m.obrasParalizadas}</b>
        </span>
      </div>

      {m.inversionParalizada > 0 && (
        <div className="meta">
          Plata expuesta en obras paralizadas asociadas:{" "}
          {money(m.inversionParalizada)}
        </div>
      )}

      {m.sancionado && (
        <div className="meta" style={{ color: "var(--alto)", fontWeight: 700 }}>
          ⚠ Proveedor inhabilitado / sancionado (RNSSC)
        </div>
      )}

      {perfil.banderas.length > 0 ? (
        <ul className="banderas">
          {perfil.banderas.map((b) => (
            <li key={b.codigo}>
              <span className="peso">+{b.peso}</span>
              {b.detalle}
            </li>
          ))}
        </ul>
      ) : (
        <p className="fuente-nota">
          Sin señales de riesgo detectadas sobre las contrataciones de este RUC.
        </p>
      )}
    </article>
  );
}
