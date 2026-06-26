import Link from "next/link";

export const metadata = {
  title: "Lupa Fiscal — Rayos X de las contrataciones públicas del Perú",
  description:
    "Plataforma de señales de riesgo sobre datos abiertos del Estado (OCDS). Un mismo motor, tres públicos: el que vigila, el que contrata y el que por ley debe verificar.",
};

const PUBLICOS = [
  {
    tag: "Ciudadano · vigilancia",
    titulo: "Mira la contratación de tu región",
    texto:
      "Busca tu departamento y ve las contrataciones del Estado, cuánta plata mueven y qué banderas de riesgo tiene el contrato. De la indignación a la denuncia.",
  },
  {
    tag: "Entidad pública · contratación responsable",
    titulo: "Revisa un proveedor antes de adjudicar",
    texto:
      "Busca un RUC y ve su perfil de riesgo: sanciones, historial de postor único, sobrecostos y concentración con una sola entidad.",
  },
  {
    tag: "Empresa privada · debida diligencia",
    titulo: "Verifica a tu contraparte (Ley 30424)",
    texto:
      "La misma consulta por RUC que la ley anticorrupción obliga sobre proveedores, clientes y socios. El semáforo de integridad en compra pública, en segundos.",
  },
];

const PASOS = [
  { n: "01", t: "Dato abierto", d: "OCDS de contrataciones del OECE (SEACE), descarga oficial CC BY 4.0." },
  { n: "02", t: "ETL", d: "Normaliza a una base limpia: entidad, contrato, proveedor, por departamento." },
  { n: "03", t: "Motor de reglas", d: "Funciones puras y testeadas calculan banderas + puntaje explicable." },
  { n: "04", t: "3 vistas", d: "Ciudadano, entidad y empresa consultan el mismo motor, su modo." },
];

const BANDERAS = [
  { n: "Postor único", d: "Se adjudicó con una sola empresa compitiendo.", p: 3 },
  { n: "Proveedor sancionado", d: "La empresa está inhabilitada (RNSSC).", p: 3 },
  { n: "Sobrecosto", d: "Se pagó más de 15% sobre el valor estimado.", p: 2 },
  { n: "Obra atrapada", d: "Paralizada +6 meses con avance alto.", p: 2 },
  { n: "Fraccionamiento", d: "Varios contratos chicos para evitar licitar.", p: 2 },
  { n: "Proveedor recurrente", d: "Misma empresa adjudicada 3+ veces.", p: 1 },
];

export default function Landing() {
  return (
    <>
      <header className="appbar">
        <div className="brand">
          <svg width="22" height="22" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="17" cy="17" r="13" fill="none" stroke="currentColor" strokeWidth="2.4" />
            <line x1="26.5" y1="26.5" x2="36" y2="36" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Lupa Fiscal
        </div>
        <Link href="/plataforma" className="btn" style={{ padding: "9px 16px", fontSize: 14 }}>
          Entrar a la plataforma →
        </Link>
      </header>

      <div className="wrap">
        <section className="hero">
          <div className="eyebrow">Datos abiertos del Estado peruano</div>
          <h1>Rayos X de las contrataciones públicas del Perú.</h1>
          <p className="lead">
            Plataforma de señales de riesgo sobre las compras del Estado. Un mismo motor de reglas,
            tres públicos: el que <b>vigila</b>, el que <b>contrata</b> y el que por ley debe{" "}
            <b>verificar</b>.
          </p>
          <div className="actions">
            <Link href="/plataforma" className="btn">Explorar contrataciones</Link>
            <Link href="/plataforma" className="btn ghost">Consultar un RUC</Link>
          </div>
        </section>

        <div className="band">
          <div className="b"><div className="n">129,635</div><div className="k">Procesos reales analizados (OCDS 2025)</div></div>
          <div className="b"><div className="n">+2,700</div><div className="k">Obras públicas paralizadas en el Perú</div></div>
          <div className="b"><div className="n">S/ 67,139 M</div><div className="k">Inversión congelada (Contraloría / INFOBRAS)</div></div>
        </div>

        <h2 className="section-t">Un motor, tres públicos</h2>
        <p className="section-s">El mismo dato y las mismas reglas, servidos según quién pregunta.</p>
        <div className="three">
          {PUBLICOS.map((p) => (
            <div className="pcard" key={p.tag}>
              <div className="tag">{p.tag}</div>
              <h3>{p.titulo}</h3>
              <p>{p.texto}</p>
            </div>
          ))}
        </div>

        <h2 className="section-t">Cómo funciona</h2>
        <p className="section-s">Arquitectura en capas: del dato abierto a la señal explicable.</p>
        <div className="how">
          {PASOS.map((s) => (
            <div className="step" key={s.n}>
              <div className="num">{s.n}</div>
              <b>{s.t}</b>
              <span>{s.d}</span>
            </div>
          ))}
        </div>

        <h2 className="section-t">Cómo se calcula el puntaje de riesgo</h2>
        <p className="section-s">
          Cada señal suma puntos. El total es transparente y explicable — no es una caja negra ni una
          acusación, solo indicios que ameritan revisión.
        </p>
        <div className="metodo">
          <div className="card">
            {BANDERAS.map((b) => (
              <div className="fila" key={b.n}>
                <div>
                  <b>{b.n}</b>
                  <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{b.d}</div>
                </div>
                <span className="peso">+{b.p}</span>
              </div>
            ))}
          </div>
          <div className="card">
            <b>El semáforo</b>
            <p style={{ fontSize: 13.5, color: "var(--muted)", margin: "8px 0 0", lineHeight: 1.55 }}>
              Sumamos los pesos de las señales detectadas en el contrato:
            </p>
            <div className="semaforo" style={{ flexDirection: "column", gap: 12, marginTop: 14 }}>
              <div className="s"><i style={{ background: "var(--verify)" }} /> <b>0–1 Bajo</b> — sin señales relevantes</div>
              <div className="s"><i style={{ background: "var(--warn)" }} /> <b>2–4 Medio</b> — una o más señales, conviene revisar</div>
              <div className="s"><i style={{ background: "var(--seal)" }} /> <b>5+ Alto</b> — varias señales, amerita escrutinio</div>
            </div>
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 14 }}>
              Los pesos son una configuración justificable (postor único y sanción pesan más), en la
              línea de modelos públicos de riesgo de contratación. Cada punto es rastreable a su señal.
            </p>
          </div>
        </div>

        <div className="foot" style={{ textAlign: "left" }}>
          Fuente: OCDS de contrataciones del OECE/SEACE (CC BY 4.0). Las señales son indicios que
          ameritan revisión, no una acusación. Paralización (INFOBRAS) y sanciones (RNSSC) son
          fuentes separadas en integración.
        </div>
      </div>
    </>
  );
}
