import type { Metadata } from "next";
import "leaflet/dist/leaflet.css";
import "./globals.css";

export const metadata: Metadata = {
  title: "Lupa Fiscal — obras públicas paralizadas",
  description:
    "Radar ciudadano de obras públicas paralizadas y señales de riesgo en sus contrataciones (Perú).",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
