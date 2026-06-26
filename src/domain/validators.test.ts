/**
 * domain/validators.test.ts — Lupa Fiscal
 *
 * Suite de los validadores de identificadores (DNI/RUC): camino feliz + caso
 * de error. Funciones puras, sin DB ni servidor.
 */
import { describe, it, expect } from "vitest";
import { validarDni, validarRuc, tipoRuc } from "./validators";

// ============================================================
//  DNI
// ============================================================
describe("validarDni — camino feliz", () => {
  it("acepta 8 dígitos exactos", () => {
    expect(validarDni("12345678")).toBe(true);
    expect(validarDni("00000001")).toBe(true);
    expect(validarDni("99999999")).toBe(true);
  });

  it("recorta espacios de los extremos (trim)", () => {
    expect(validarDni(" 12345678 ")).toBe(true);
  });

  it("acepta verificador dígito con guion o espacio", () => {
    expect(validarDni("12345678-9")).toBe(true);
    expect(validarDni("12345678 5")).toBe(true);
  });

  it("acepta verificador letra (mayúscula o minúscula)", () => {
    expect(validarDni("12345678-K")).toBe(true);
    expect(validarDni("12345678-k")).toBe(true);
  });

  it("acepta verificador-dígito pegado (8+1 sin separador)", () => {
    expect(validarDni("123456785")).toBe(true);
  });
});

describe("validarDni — casos de error", () => {
  it("rechaza cadena vacía", () => {
    expect(validarDni("")).toBe(false);
    expect(validarDni("   ")).toBe(false);
  });

  it("rechaza el número centinela 00000000", () => {
    expect(validarDni("00000000")).toBe(false);
  });

  it("rechaza longitudes incorrectas del núcleo", () => {
    expect(validarDni("1234567")).toBe(false); // 7 dígitos
    expect(validarDni("123456789")).toBe(true); // 8 + verificador-dígito pegado (ver spec)
  });

  it("rechaza letras dentro de los 8 dígitos del núcleo", () => {
    expect(validarDni("1234567A")).toBe(false);
    expect(validarDni("abcdefgh")).toBe(false);
  });

  it("rechaza verificador de más de 1 carácter o separador sin verificador", () => {
    expect(validarDni("12345678-99")).toBe(false);
    expect(validarDni("12345678-")).toBe(false);
  });

  it("rechaza separadores no permitidos (puntos)", () => {
    expect(validarDni("12.345.678")).toBe(false);
  });

  it("rechaza entradas que no son string (guarda de tipo en runtime)", () => {
    // @ts-expect-error prueba de runtime con tipo inválido
    expect(validarDni(null)).toBe(false);
    // @ts-expect-error prueba de runtime con tipo inválido
    expect(validarDni(undefined)).toBe(false);
    // @ts-expect-error prueba de runtime con tipo inválido
    expect(validarDni(12345678)).toBe(false);
  });
});

// ============================================================
//  RUC
// ============================================================
describe("validarRuc — camino feliz", () => {
  it("acepta RUCs reales de SUNAT con DV correcto", () => {
    expect(validarRuc("20131312955")).toBe(true); // SUNAT
    expect(validarRuc("20131380951")).toBe(true); // MEF
    expect(validarRuc("20100070970")).toBe(true); // BCP
    expect(validarRuc("20100128056")).toBe(true); // Telefónica
  });

  it("recorta espacios de los extremos (trim)", () => {
    expect(validarRuc("  20131312955  ")).toBe(true);
  });

  it("acepta prefijo 10 (persona natural) con DV correcto", () => {
    // base 2010011122 → DV correcto = 6 (verificado contra el algoritmo).
    expect(validarRuc("20100111226")).toBe(true);
  });
});

describe("validarRuc — casos de error", () => {
  it("rechaza longitudes distintas de 11", () => {
    expect(validarRuc("2013131295")).toBe(false); // 10 dígitos
    expect(validarRuc("201313129550")).toBe(false); // 12 dígitos
  });

  it("rechaza caracteres no numéricos", () => {
    expect(validarRuc("2013131295A")).toBe(false);
    expect(validarRuc("")).toBe(false);
  });

  it("rechaza prefijos de tipo inválidos", () => {
    expect(validarRuc("30131312955")).toBe(false); // prefijo 30
    expect(validarRuc("00000000000")).toBe(false); // prefijo 00
  });

  it("rechaza DV que no coincide aunque forma/prefijo sean correctos", () => {
    expect(validarRuc("20131312954")).toBe(false); // DV real es 5, no 4
  });

  it("rechaza entradas que no son string (guarda de tipo en runtime)", () => {
    // @ts-expect-error prueba de runtime con tipo inválido
    expect(validarRuc(null)).toBe(false);
    // @ts-expect-error prueba de runtime con tipo inválido
    expect(validarRuc(undefined)).toBe(false);
    // @ts-expect-error prueba de runtime con tipo inválido
    expect(validarRuc(20131312955)).toBe(false);
  });
});

describe("tipoRuc", () => {
  it("clasifica jurídica (prefijo 20) y natural (prefijo 10)", () => {
    expect(tipoRuc("20131312955")).toBe("juridica");
    expect(tipoRuc("20100111226")).toBe("juridica");
    // base 1012345678 → DV correcto = 1 (verificado contra el algoritmo).
    expect(tipoRuc("10123456781")).toBe("natural");
  });

  it("devuelve null cuando el RUC es inválido", () => {
    expect(tipoRuc("20131312954")).toBeNull(); // DV malo
    expect(tipoRuc("30131312955")).toBeNull(); // prefijo malo
    expect(tipoRuc("")).toBeNull();
  });
});
