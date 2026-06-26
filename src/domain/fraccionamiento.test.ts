/**
 * domain/fraccionamiento.test.ts — Lupa Fiscal
 *
 * Suite de la bandera AGREGADA de fraccionamiento: caso que detecta + caso que
 * no. La función es pura, así que se testea sin DB ni servidor.
 */
import { describe, it, expect } from "vitest";
import type { Contrato } from "./entities";
import { detectarFraccionamiento, UMBRAL_FRACCIONAMIENTO } from "./fraccionamiento";

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

// ---------- CASO QUE DETECTA ----------
describe("detectarFraccionamiento — detecta", () => {
  it("3 contratos individualmente bajo el umbral que sumados lo superan", () => {
    const contratos = [
      contrato({ id: "C-1", montoAdjudicado: 3_000_000 }),
      contrato({ id: "C-2", montoAdjudicado: 3_000_000 }),
      contrato({ id: "C-3", montoAdjudicado: 3_000_000 }), // suma 9M > 8M umbral
    ];
    const grupos = detectarFraccionamiento(contratos);
    expect(grupos).toHaveLength(1);
    const g = grupos[0];
    expect(g.entidadId).toBe("E-1");
    expect(g.proveedorId).toBe("P-1");
    expect(g.contratoIds).toEqual(["C-1", "C-2", "C-3"]);
    expect(g.montoTotal).toBe(9_000_000);
    expect(g.bandera.codigo).toBe("FRACCIONAMIENTO");
    expect(g.bandera.peso).toBe(3);
  });

  it("solo agrupa por (entidadId, proveedorId): no mezcla proveedores distintos", () => {
    const contratos = [
      contrato({ id: "C-1", proveedorId: "P-1", montoAdjudicado: 5_000_000 }),
      contrato({ id: "C-2", proveedorId: "P-1", montoAdjudicado: 5_000_000 }), // P-1 suma 10M
      contrato({ id: "C-3", proveedorId: "P-2", montoAdjudicado: 5_000_000 }), // P-2 solo 1 contrato
    ];
    const grupos = detectarFraccionamiento(contratos);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].proveedorId).toBe("P-1");
    expect(grupos[0].contratoIds).toEqual(["C-1", "C-2"]);
  });

  it("respeta umbral y minContratos por opciones", () => {
    const contratos = [
      contrato({ id: "C-1", montoAdjudicado: 600_000 }),
      contrato({ id: "C-2", montoAdjudicado: 600_000 }), // suma 1.2M > 1M umbral custom
    ];
    const grupos = detectarFraccionamiento(contratos, { umbral: 1_000_000, minContratos: 2 });
    expect(grupos).toHaveLength(1);
    expect(grupos[0].montoTotal).toBe(1_200_000);
  });
});

// ---------- CASO QUE NO DETECTA ----------
describe("detectarFraccionamiento — no detecta", () => {
  it("dos contratos cuya suma NO supera el umbral", () => {
    const contratos = [
      contrato({ id: "C-1", montoAdjudicado: 2_000_000 }),
      contrato({ id: "C-2", montoAdjudicado: 3_000_000 }), // suma 5M < 8M umbral
    ];
    expect(detectarFraccionamiento(contratos)).toHaveLength(0);
  });

  it("un contrato por encima del umbral NO es indicio (iría a licitación) y se ignora del grupo", () => {
    const contratos = [
      contrato({ id: "C-1", montoAdjudicado: UMBRAL_FRACCIONAMIENTO + 1 }), // sobre umbral: ignorado
      contrato({ id: "C-2", montoAdjudicado: 3_000_000 }), // queda 1 contrato bajo umbral
    ];
    expect(detectarFraccionamiento(contratos)).toHaveLength(0);
  });

  it("un solo contrato bajo el umbral no forma grupo", () => {
    const contratos = [contrato({ id: "C-1", montoAdjudicado: 3_000_000 })];
    expect(detectarFraccionamiento(contratos)).toHaveLength(0);
  });

  it("contratos sin proveedor o sin monto se ignoran sin romper", () => {
    const contratos = [
      contrato({ id: "C-1", proveedorId: null, montoAdjudicado: 5_000_000 }),
      contrato({ id: "C-2", montoAdjudicado: null, valorReferencial: null }),
      contrato({ id: "C-3", montoAdjudicado: 5_000_000 }), // queda 1 válido bajo umbral
    ];
    expect(detectarFraccionamiento(contratos)).toHaveLength(0);
  });

  it("lista vacía => sin grupos, sin excepción", () => {
    expect(detectarFraccionamiento([])).toEqual([]);
  });
});
