"use client";

import { useState } from "react";
import Link from "next/link";
import VistaCiudadano from "@/components/VistaCiudadano";
import VistaProveedor from "@/components/VistaProveedor";

export default function Plataforma() {
  const [vista, setVista] = useState<"c" | "p">("c");

  return (
    <>
      <header className="appbar">
        <Link href="/" className="brand" style={{ textDecoration: "none" }}>
          <svg width="22" height="22" viewBox="0 0 40 40" aria-hidden="true">
            <circle cx="17" cy="17" r="13" fill="none" stroke="currentColor" strokeWidth="2.4" />
            <line x1="26.5" y1="26.5" x2="36" y2="36" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
          </svg>
          Lupa Fiscal
        </Link>
        <div className="switch">
          <button className={vista === "c" ? "on" : ""} onClick={() => setVista("c")}>Ciudadano</button>
          <button className={vista === "p" ? "on" : ""} onClick={() => setVista("p")}>Proveedor</button>
        </div>
        <div className="src">OCDS · OECE/SEACE · corte 2025</div>
      </header>

      <div className="wrap">
        {vista === "c" ? <VistaCiudadano /> : <VistaProveedor />}
      </div>
    </>
  );
}
