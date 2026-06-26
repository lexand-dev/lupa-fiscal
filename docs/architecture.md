# Arquitectura — Lupa Fiscal

Modelo en capas (estilo C4). La lógica de negocio no depende de framework ni base de datos: por eso es testeable y defendible.

## 2.1 Contexto

```mermaid
flowchart LR
    U["Ciudadano / Periodista<br/>(usuario objetivo)"]
    U --> LF["Lupa Fiscal<br/>(mapa + señales de riesgo)"]
    LF --> SRC["Fuentes del Estado<br/>OCDS · Contraloría · INFOBRAS"]
```

Nivel 1 — El sistema, su usuario y las fuentes de datos del Estado.

## 2.2 Contenedores y capas

```mermaid
flowchart TB
    subgraph INGESTA["INGESTA (ETL · 1 vez)"]
        E1["OCDS bulk (JSON)"]
        E2["Anexo obras paralizadas<br/>(Contraloría)"]
        E3["Ubigeos (geocodifica)"]
        E1 --> ETL["Normalizador<br/>(extracción tolerante)"]
        E2 --> ETL
        E3 --> ETL
    end
    ETL --> DB[("PostgreSQL<br/>datos normalizados")]
    subgraph NUCLEO["NÚCLEO (lógica pura · testeable)"]
        DOM["Dominio<br/>Obra · Contrato · Proveedor · Entidad"]
        MOTOR["Motor de señales de riesgo<br/>(funciones puras → tests)"]
    end
    DB --> APP["Aplicación (casos de uso)<br/>buscarObras · evaluarRiesgo"]
    DOM --> APP
    MOTOR --> APP
    APP --> API["API · Route Handlers"]
    API --> UI["UI · Mapa<br/>buscador + ficha"]
```

Nivel 2 — Capas y contenedores. La ETL deja la base lista; el núcleo no conoce ni framework ni DB.

| Capa           | Responsabilidad                                                                                           |
|----------------|-----------------------------------------------------------------------------------------------------------|
| `etl/`         | Descarga, parseo y normalización de fuentes. Corre una vez y deja Postgres listo para una demo estable.  |
| `domain/`      | Entidades y motor de señales de riesgo. Cero dependencias externas. Aquí viven los tests.                 |
| `application/` | Casos de uso que orquestan dominio + repositorios.                                                        |
| `infrastructure/` | Repositorios Postgres, API (Route Handlers), UI con mapa.                                              |

## 2.3 Flujo de la funcionalidad crítica

```mermaid
sequenceDiagram
    participant U as Usuario
    participant API as API
    participant DB as PostgreSQL
    participant R as evaluarRiesgo()
    U->>API: 1. busca región
    API->>DB: 2. obras + contratos de la región
    DB-->>API: 3. filas
    API->>R: 4. evalúa banderas
    R-->>API: 5. puntaje + banderas
    API-->>U: 6. mapa + fichas
```

Nivel 3 — Camino feliz de la funcionalidad crítica (la que se demuestra en vivo y la que cubren los tests).

**Decisión clave:** los datos se precargan (ETL) en vez de llamar APIs del Estado en vivo, para que la demo de las 6 pm no dependa de que un portal externo esté arriba. Ver [ADR-0001](./adr/ADR-0001.md).