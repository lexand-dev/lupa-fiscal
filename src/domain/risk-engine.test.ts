/**
 * domain/risk-engine.test.ts — Lupa Fiscal
 *
 * Suite de la FUNCIONALIDAD CRÍTICA (Hito 2): camino feliz + caso de error.
 * El motor es puro, así que se testea sin DB ni servidor.
 */
import { describe, it, expect } from "vitest";
import type { Contrato, Obra, Proveedor } from "./entities";
import {
  banderaObraAtrapada,
  banderaPostorUnico,
  banderaProveedorRecurrente,
  banderaProveedorSancionado,
  banderaSobrecosto,
  evaluarRiesgo,
  type ContextoRiesgo,
} from "./risk-engine";

// ---------- Fixtures ----------
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
function proveedor(over: Partial<Proveedor> = {}): Proveedor {
  return {
    id: "P-1",
    ruc: "20123456789",
    razonSocial: "Constructora Demo S.A.C.",
    sancionado: false,
    numAdjudicaciones: 1,
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

// ---------- CAMINO FELIZ ----------
describe("evaluarRiesgo — camino feliz", () => {
  it("contrato limpio y competido => puntaje 0, nivel bajo, sin banderas", () => {
    const r = evaluarRiesgo({
      contrato: contrato(),
      proveedor: proveedor(),
      obra: obra({ estado: "en_ejecucion" }),
    });
    expect(r.banderas).toHaveLength(0);
    expect(r.puntaje).toBe(0);
    expect(r.nivel).toBe("bajo");
  });

  it("contrato riesgoso dispara varias banderas y suma sus pesos", () => {
    const ctx: ContextoRiesgo = {
      contrato: contrato({
        numPostores: 1, // POSTOR_UNICO (3)
        valorReferencial: 1_000_000,
        montoAdjudicado: 1_400_000, // SOBRECOSTO 40% (2)
      }),
      proveedor: proveedor({ numAdjudicaciones: 5, sancionado: true }), // RECURRENTE(1)+SANCIONADO(3)
      obra: obra({ estado: "paralizada", mesesParada: 18, avanceFisico: 80 }), // ATRAPADA (2)
    };
    const r = evaluarRiesgo(ctx);
    const codigos = r.banderas.map((b) => b.codigo).sort();
    expect(codigos).toEqual(
      [
        "OBRA_ATRAPADA",
        "POSTOR_UNICO",
        "PROVEEDOR_RECURRENTE",
        "PROVEEDOR_SANCIONADO",
        "SOBRECOSTO",
      ].sort(),
    );
    expect(r.puntaje).toBe(3 + 2 + 1 + 3 + 2); // 11
    expect(r.nivel).toBe("alto");
  });

  it("sobrecosto justo en el umbral (15%) NO dispara; por encima sí", () => {
    const en15 = banderaSobrecosto({
      contrato: contrato({ valorReferencial: 100, montoAdjudicado: 115 }),
    });
    const sobre15 = banderaSobrecosto({
      contrato: contrato({ valorReferencial: 100, montoAdjudicado: 116 }),
    });
    expect(en15).toBeNull();
    expect(sobre15).not.toBeNull();
    expect(sobre15?.codigo).toBe("SOBRECOSTO");
  });

  it("postor único dispara solo con exactamente 1 postor", () => {
    expect(banderaPostorUnico({ contrato: contrato({ numPostores: 1 }) })).not.toBeNull();
    expect(banderaPostorUnico({ contrato: contrato({ numPostores: 2 }) })).toBeNull();
  });

  it("proveedor recurrente requiere >= 3 adjudicaciones", () => {
    expect(
      banderaProveedorRecurrente({ contrato: contrato(), proveedor: proveedor({ numAdjudicaciones: 3 }) }),
    ).not.toBeNull();
    expect(
      banderaProveedorRecurrente({ contrato: contrato(), proveedor: proveedor({ numAdjudicaciones: 2 }) }),
    ).toBeNull();
  });

  it("obra atrapada: paralizada > 6 meses y avance alto", () => {
    expect(
      banderaObraAtrapada({ contrato: contrato(), obra: obra({ mesesParada: 7, avanceFisico: 60 }) }),
    ).not.toBeNull();
    // poco avance => no es "plata atrapada"
    expect(
      banderaObraAtrapada({ contrato: contrato(), obra: obra({ mesesParada: 24, avanceFisico: 10 }) }),
    ).toBeNull();
  });

  it("proveedor sancionado dispara bandera de peso 3", () => {
    const b = banderaProveedorSancionado({ contrato: contrato(), proveedor: proveedor({ sancionado: true }) });
    expect(b?.peso).toBe(3);
  });
});

// ---------- CASO DE ERROR / DATOS INCOMPLETOS ----------
describe("evaluarRiesgo — datos incompletos (defensa)", () => {
  it("valor referencial nulo NO rompe el sobrecosto (devuelve null)", () => {
    expect(banderaSobrecosto({ contrato: contrato({ valorReferencial: null }) })).toBeNull();
    expect(banderaSobrecosto({ contrato: contrato({ montoAdjudicado: null }) })).toBeNull();
  });

  it("valor referencial 0 no produce división por cero", () => {
    expect(banderaSobrecosto({ contrato: contrato({ valorReferencial: 0, montoAdjudicado: 999 }) })).toBeNull();
  });

  it("sin proveedor ni obra, el motor no lanza y evalúa solo lo posible", () => {
    const r = evaluarRiesgo({ contrato: contrato({ numPostores: 1 }) });
    expect(r.banderas.map((b) => b.codigo)).toEqual(["POSTOR_UNICO"]);
    expect(r.puntaje).toBe(3);
  });

  it("contrato con todos los campos nulos => sin banderas, sin excepción", () => {
    const r = evaluarRiesgo({
      contrato: contrato({ numPostores: null, valorReferencial: null, montoAdjudicado: null }),
      proveedor: null,
      obra: null,
    });
    expect(r.banderas).toHaveLength(0);
    expect(r.puntaje).toBe(0);
    expect(r.nivel).toBe("bajo");
  });

  it("obra no paralizada no dispara 'atrapada' aunque tenga avance alto", () => {
    expect(
      banderaObraAtrapada({ contrato: contrato(), obra: obra({ estado: "en_ejecucion", mesesParada: 20, avanceFisico: 90 }) }),
    ).toBeNull();
  });
});
