/**
 * domain/proveedor-risk.test.ts — Lupa Fiscal
 *
 * Suite del perfil de riesgo POR PROVEEDOR (RUC): camino feliz + casos de error/
 * datos incompletos. El motor es puro (agregación sobre el motor por-contrato),
 * así que se testea sin DB ni servidor.
 */
import { describe, it, expect } from "vitest";
import type { Contrato, Entidad, Obra, Proveedor } from "./entities";
import {
  banderaCapturaComprador,
  banderaConcentracionPostorUnico,
  banderaPatronSobrecostos,
  calcularMetricas,
  hhiPorComprador,
  perfilRiesgoProveedor,
  shareTopComprador,
  type ContratoAgregable,
  type EntradaPerfilProveedor,
} from "./proveedor-risk";

// ---------- Fixtures ----------
function proveedor(over: Partial<Proveedor> = {}): Proveedor {
  return {
    id: "P-1",
    ruc: "20100111222",
    razonSocial: "Constructora Andina S.A.C.",
    sancionado: false,
    numAdjudicaciones: 5,
    ...over,
  };
}
function contrato(over: Partial<Contrato> = {}): Contrato {
  return {
    id: "C-1",
    ocid: "ocds-abc-0001",
    valorReferencial: 1_000_000,
    montoAdjudicado: 1_000_000,
    numPostores: 3,
    entidadId: "E-1",
    proveedorId: "P-1",
    ...over,
  };
}
function entidad(over: Partial<Entidad> = {}): Entidad {
  return {
    id: "E-1",
    nombre: "Gobierno Regional Demo",
    nivelGobierno: "regional",
    region: "Cusco",
    ubigeo: "080000",
    ...over,
  };
}
function obra(over: Partial<Obra> = {}): Obra {
  return {
    id: "O-1",
    nombre: "Mejoramiento de vía",
    montoInversion: 1_000_000,
    estado: "paralizada",
    mesesParada: 12,
    avanceFisico: 70,
    lat: -13.5,
    lng: -71.97,
    entidadId: "E-1",
    contratoId: "C-1",
    ...over,
  };
}
/** Arma una entrada de perfil rápida. */
function entrada(
  contratos: ContratoAgregable[],
  prov: Partial<Proveedor> = {},
): EntradaPerfilProveedor {
  return { proveedor: proveedor(prov), contratos };
}

// ---------- CAMINO FELIZ ----------
describe("perfilRiesgoProveedor — camino feliz", () => {
  it("proveedor competido, diversificado y sin sanción => verde, puntaje 0", () => {
    // 3 compradores con montos similares: top-share < 0.50 y HHI < 0.50 (sin captura).
    const r = perfilRiesgoProveedor(
      entrada([
        { contrato: contrato({ id: "C-1", entidadId: "E-1", numPostores: 3, montoAdjudicado: 100 }), entidad: entidad({ id: "E-1" }) },
        { contrato: contrato({ id: "C-2", entidadId: "E-2", numPostores: 4, montoAdjudicado: 100 }), entidad: entidad({ id: "E-2", nombre: "Municipalidad Demo" }) },
        { contrato: contrato({ id: "C-3", entidadId: "E-3", numPostores: 5, montoAdjudicado: 100 }), entidad: entidad({ id: "E-3", nombre: "Ministerio Demo" }) },
      ]),
    );
    expect(r.banderas).toHaveLength(0);
    expect(r.puntaje).toBe(0);
    expect(r.color).toBe("verde");
    expect(r.nivel).toBe("bajo");
    expect(r.ruc).toBe("20100111222");
    expect(r.metricas.pctPostorUnico).toBe(0);
    expect(r.metricas.numCompradores).toBe(3);
  });

  it("proveedor sistémico => rojo: postor único alto + captura + sobrecostos + obras paralizadas", () => {
    // 2 contratos, mismo comprador (E-1), ambos postor único + sobrecosto 40%, 2 obras paralizadas.
    const ag: ContratoAgregable[] = [
      {
        contrato: contrato({ id: "C-1", entidadId: "E-1", numPostores: 1, valorReferencial: 40_000_000, montoAdjudicado: 56_000_000 }),
        entidad: entidad({ id: "E-1", nombre: "GORE Cusco" }),
        obra: obra({ id: "O-1", estado: "paralizada", montoInversion: 45_000_000 }),
      },
      {
        contrato: contrato({ id: "C-2", entidadId: "E-1", numPostores: 1, valorReferencial: 45_000_000, montoAdjudicado: 60_000_000 }),
        entidad: entidad({ id: "E-1", nombre: "GORE Cusco" }),
        obra: obra({ id: "O-2", estado: "paralizada", montoInversion: 52_000_000 }),
      },
    ];
    const r = perfilRiesgoProveedor(entrada(ag));
    const codigos = r.banderas.map((b) => b.codigo).sort();
    expect(codigos).toEqual(
      ["CAPTURA_COMPRADOR", "CONC_POSTOR_UNICO", "OBRAS_PARALIZADAS_PROVEEDOR", "PATRON_SOBRECOSTOS"].sort(),
    );
    // 100% postor único (3) + captura share 1.0 (2) + 2 sobrecostos -> ámbar (1) + 2 obras paralizadas (2) = 8
    expect(r.puntaje).toBe(3 + 2 + 1 + 2);
    expect(r.color).toBe("rojo");
    expect(r.nivel).toBe("alto");
    expect(r.metricas.shareTopComprador).toBe(1);
    expect(r.metricas.topCompradorNombre).toBe("GORE Cusco");
    expect(r.metricas.obrasParalizadas).toBe(2);
  });

  it("sanción vigente escala a rojo por sí sola (riesgo legal directo)", () => {
    const r = perfilRiesgoProveedor(
      entrada(
        [{ contrato: contrato({ numPostores: 3 }), entidad: entidad() }],
        { sancionado: true },
      ),
    );
    expect(r.color).toBe("rojo");
    expect(r.nivel).toBe("alto");
    expect(r.banderas.map((b) => b.codigo)).toContain("PROVEEDOR_SANCIONADO");
    expect(r.metricas.sancionado).toBe(true);
  });

  it("shareTopComprador agrupa por entidad y elige el top-1 por monto", () => {
    const top = shareTopComprador([
      { contrato: contrato({ id: "C-1", entidadId: "E-1", montoAdjudicado: 80 }), entidad: entidad({ id: "E-1", nombre: "Comprador A" }) },
      { contrato: contrato({ id: "C-2", entidadId: "E-2", montoAdjudicado: 20 }), entidad: entidad({ id: "E-2", nombre: "Comprador B" }) },
    ]);
    expect(top.id).toBe("E-1");
    expect(top.nombre).toBe("Comprador A");
    expect(top.share).toBeCloseTo(0.8, 5);
  });

  it("hhiPorComprador: un solo comprador => 1; reparto 50/50 => 0.5", () => {
    const unSolo = hhiPorComprador([
      { contrato: contrato({ id: "C-1", entidadId: "E-1", montoAdjudicado: 100 }) },
      { contrato: contrato({ id: "C-2", entidadId: "E-1", montoAdjudicado: 100 }) },
    ]);
    expect(unSolo).toBeCloseTo(1, 5);
    const dos = hhiPorComprador([
      { contrato: contrato({ id: "C-1", entidadId: "E-1", montoAdjudicado: 100 }) },
      { contrato: contrato({ id: "C-2", entidadId: "E-2", montoAdjudicado: 100 }) },
    ]);
    expect(dos).toBeCloseTo(0.5, 5);
  });

  it("banderaConcentracionPostorUnico: >=60% rojo (peso 3), 30..59% ámbar (peso 1)", () => {
    const rojo = banderaConcentracionPostorUnico(
      calcularMetricas(
        entrada([
          { contrato: contrato({ id: "C-1", numPostores: 1 }) },
          { contrato: contrato({ id: "C-2", numPostores: 1 }) },
          { contrato: contrato({ id: "C-3", numPostores: 3 }) },
        ]),
      ),
    );
    expect(rojo?.peso).toBe(3); // 66%
    const ambar = banderaConcentracionPostorUnico(
      calcularMetricas(
        entrada([
          { contrato: contrato({ id: "C-1", numPostores: 1 }) },
          { contrato: contrato({ id: "C-2", numPostores: 3 }) },
          { contrato: contrato({ id: "C-3", numPostores: 3 }) },
        ]),
      ),
    );
    expect(ambar?.peso).toBe(1); // 33%
  });

  it("banderaPatronSobrecostos: >=3 rojo (peso 2), 1..2 ámbar (peso 1)", () => {
    const sobre = (id: string) => ({
      contrato: contrato({ id, valorReferencial: 100, montoAdjudicado: 140 }), // +40%
    });
    const limpio = (id: string) => ({
      contrato: contrato({ id, valorReferencial: 100, montoAdjudicado: 105 }), // +5%
    });
    const rojo = banderaPatronSobrecostos(
      calcularMetricas(entrada([sobre("C-1"), sobre("C-2"), sobre("C-3")])),
    );
    expect(rojo?.peso).toBe(2);
    const ambar = banderaPatronSobrecostos(
      calcularMetricas(entrada([sobre("C-1"), limpio("C-2")])),
    );
    expect(ambar?.peso).toBe(1);
  });

  it("banderaCapturaComprador: share >=0.70 rojo, 0.50..0.69 ámbar", () => {
    const rojo = banderaCapturaComprador(
      calcularMetricas(
        entrada([
          { contrato: contrato({ id: "C-1", entidadId: "E-1", montoAdjudicado: 80 }), entidad: entidad({ id: "E-1", nombre: "A" }) },
          { contrato: contrato({ id: "C-2", entidadId: "E-2", montoAdjudicado: 20 }), entidad: entidad({ id: "E-2", nombre: "B" }) },
        ]),
      ),
    );
    expect(rojo?.peso).toBe(2);
    // Ámbar real: top-share en banda 0.50..0.69 PERO HHI < 0.50 (resto repartido fino).
    // top=55%, más 9 compradores de 5% c/u => HHI = 0.55² + 9·0.05² = 0.325 (< 0.50).
    const fino = Array.from({ length: 9 }, (_, i) => ({
      contrato: contrato({ id: `F-${i}`, entidadId: `EF-${i}`, montoAdjudicado: 5 }),
      entidad: entidad({ id: `EF-${i}`, nombre: `Comprador ${i}` }),
    }));
    const ambar = banderaCapturaComprador(
      calcularMetricas(
        entrada([
          { contrato: contrato({ id: "C-1", entidadId: "E-1", montoAdjudicado: 55 }), entidad: entidad({ id: "E-1", nombre: "A" }) },
          ...fino,
        ]),
      ),
    );
    expect(ambar?.peso).toBe(1);
  });
});

// ---------- CASO DE ERROR / DATOS INCOMPLETOS ----------
describe("perfilRiesgoProveedor — datos incompletos (defensa)", () => {
  it("proveedor sin contratos => métricas en 0/null, puntaje 0, verde, sin excepción", () => {
    const r = perfilRiesgoProveedor(entrada([]));
    expect(r.puntaje).toBe(0);
    expect(r.color).toBe("verde");
    expect(r.nivel).toBe("bajo");
    expect(r.banderas).toHaveLength(0);
    expect(r.metricas.totalContratos).toBe(0);
    expect(r.metricas.pctPostorUnico).toBeNull();
    expect(r.metricas.shareTopComprador).toBeNull();
    expect(r.metricas.hhiCompradores).toBeNull();
    expect(r.metricas.numCompradores).toBe(0);
  });

  it("sin dato de postores en ningún contrato => pctPostorUnico null, no penaliza", () => {
    const m = calcularMetricas(
      entrada([
        { contrato: contrato({ id: "C-1", numPostores: null }) },
        { contrato: contrato({ id: "C-2", numPostores: null }) },
      ]),
    );
    expect(m.pctPostorUnico).toBeNull();
    expect(banderaConcentracionPostorUnico(m)).toBeNull();
  });

  it("montos nulos / cero / negativos no rompen la concentración (sin división por cero)", () => {
    const top = shareTopComprador([
      { contrato: contrato({ id: "C-1", entidadId: "E-1", montoAdjudicado: null, valorReferencial: null }) },
      { contrato: contrato({ id: "C-2", entidadId: "E-2", montoAdjudicado: 0, valorReferencial: 0 }) },
      { contrato: contrato({ id: "C-3", entidadId: "E-3", montoAdjudicado: -100, valorReferencial: null }) },
    ]);
    expect(top.share).toBeNull();
    expect(top.id).toBeNull();
    expect(hhiPorComprador([{ contrato: contrato({ montoAdjudicado: 0, valorReferencial: 0 }) }])).toBeNull();
  });

  it("monto adjudicado nulo cae al valor referencial como fallback", () => {
    const top = shareTopComprador([
      { contrato: contrato({ id: "C-1", entidadId: "E-1", montoAdjudicado: null, valorReferencial: 100 }), entidad: entidad({ id: "E-1", nombre: "A" }) },
    ]);
    expect(top.id).toBe("E-1");
    expect(top.share).toBeCloseTo(1, 5);
  });

  it("entidad ausente: se agrupa igual por entidadId del contrato, nombre queda null", () => {
    const m = calcularMetricas(
      entrada([
        { contrato: contrato({ id: "C-1", entidadId: "E-1", montoAdjudicado: 100 }) }, // sin `entidad`
      ]),
    );
    expect(m.numCompradores).toBe(1);
    expect(m.topCompradorId).toBe("E-1");
    expect(m.topCompradorNombre).toBeNull();
    expect(m.shareTopComprador).toBeCloseTo(1, 5);
  });

  it("obras null o no paralizadas no cuentan como plata expuesta", () => {
    const m = calcularMetricas(
      entrada([
        { contrato: contrato({ id: "C-1" }), obra: null },
        { contrato: contrato({ id: "C-2" }), obra: obra({ estado: "en_ejecucion", montoInversion: 999 }) },
        { contrato: contrato({ id: "C-3" }), obra: obra({ estado: "concluida", montoInversion: 999 }) },
      ]),
    );
    expect(m.obrasParalizadas).toBe(0);
    expect(m.inversionParalizada).toBe(0);
  });

  it("una sola obra paralizada => bandera ámbar (peso 1) vía perfil", () => {
    const r = perfilRiesgoProveedor(
      entrada([
        { contrato: contrato({ id: "C-1", numPostores: 3 }), entidad: entidad(), obra: obra({ estado: "paralizada", montoInversion: 8_000_000 }) },
      ]),
    );
    const b = r.banderas.find((x) => x.codigo === "OBRAS_PARALIZADAS_PROVEEDOR");
    expect(b?.peso).toBe(1);
  });
});
