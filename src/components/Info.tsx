"use client";

/**
 * components/Info.tsx — Lupa Fiscal
 * Círculo "?" con tooltip para explicar un término a un usuario no técnico.
 * Accesible: foco por teclado + aria-label.
 */
export default function Info({ texto }: { texto: string }) {
  return (
    <span className="info" tabIndex={0} role="note" aria-label={texto}>
      ?<span className="info-bubble">{texto}</span>
    </span>
  );
}
