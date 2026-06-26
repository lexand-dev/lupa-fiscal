# Fuentes y endpoints de datos — Lupa Fiscal

## 1. OCDS contrataciones (OECE / OCP)

- **Descarga:** `https://data.open-contracting.org/en/publication/135/download?name=2025.jsonl.gz`
- **Formato:** JSONL (un record OCDS por línea)
- **Rango:** enero 2003 a junio 2026
- **Actualización:** diaria
- **Licencia:** CC BY 4.0
- **Autenticación:** ninguna (sin API key)
- **Uso:** contratos + banderas + región

### Descarga por año

```bash
curl -L -o data/2025.jsonl.gz \
  "https://data.open-contracting.org/en/publication/135/download?name=2025.jsonl.gz"
```

## 2. Contraloría / INFOBRAS — Obras paralizadas

- **Origen:** anexo de obras paralizadas (Contraloría)
- **Formato:** Excel
- **Uso:** capa headline — obras paralizadas (problema y contexto)
- **ETL:** carga única, normalizada a Postgres

## 3. Ubigeos INEI + Centros Poblados IGN

- **Uso:** geocodificación para el mapa
- Si la obra solo trae distrito o código `ubigeo`, se obtiene `lat/lng` del centroide cruzando con estos datasets oficiales.

## 4. OSCE / RNSSC — Proveedores sancionados

- **Uso:** bandera "proveedor sancionado"
- **Estado:** verificar acceso · stretch
- Número de RUC del proveedor inhabilitado para cruce contra contratos adjudicados.