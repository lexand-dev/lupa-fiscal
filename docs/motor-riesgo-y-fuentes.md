# Motor de señales de riesgo y fuentes — Lupa Fiscal

## 4.1 Señales de riesgo (banderas)

Cada bandera es una **función pura** sobre un contrato; el puntaje es la **suma de pesos**. No es una caja negra: cada bandera explica su motivo.

| Bandera            | Qué detecta                                                              | Peso |
|--------------------|---------------------------------------------------------------------------|------|
| Postor único       | Adjudicación con un solo postor (sin competencia)                         | 3    |
| Sobrecosto         | Monto adjudicado > 15% sobre el valor referencial                         | 2    |
| Proveedor recurrente| Mismo proveedor adjudicado ≥ 3 veces por la entidad                       | 1    |
| Proveedor sancionado| Contrato adjudicado a proveedor inhabilitado (stretch)                    | 3    |
| Obra atrapada      | Paralizada > 6 meses con alto avance físico                               | 2    |

> El sobrecosto se calcula como **adjudicado vs. valor referencial**, no por `amendments` ni `milestones`: el dataset OCDS no publica modificaciones de contrato. Decisión documentada para no prometer lo que el dato no sostiene.

## 4.2 Fuentes de datos (verificadas)

| Fuente                                  | Uso                                     | Estado                                                            |
|-----------------------------------------|------------------------------------------|-------------------------------------------------------------------|
| OCDS contrataciones (OECE / OCP)        | Contratos + banderas + región            | Verificada · descarga directa por año, sin API key, CC BY 4.0     |
| Contraloría / INFOBRAS                  | Obras paralizadas (capa headline)        | Anexo Excel · ETL única                                          |
| Ubigeos INEI + Centros Poblados IGN      | Geocodificación para el mapa             | Datasets disponibles                                              |
| OSCE / RNSSC (sancionados)              | Bandera proveedor inhabilitado           | Verificar acceso · stretch                                        |

**Descarga OCDS:**
```
https://data.open-contracting.org/en/publication/135/download?name=2025.jsonl.gz
```
Rango ene-2003 a jun-2026, actualización diaria.