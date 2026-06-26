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

Las dependencias se dirigen hacia adentro: la presentación (`app/`, `components/`, `lib/`) puede importar `application/` y `domain/`; `infrastructure/` implementa los puertos declarados en `application/`; `domain/` no importa framework ni DB.

| Capa              | Directorio              | Responsabilidad                                                                                                              |
|-------------------|-------------------------|------------------------------------------------------------------------------------------------------------------------------|
| Ingesta           | `etl/`                  | Descarga/parseo OCDS + INFOBRAS, normaliza a Postgres o a `data/seed.json`. Corre una vez y deja la base lista.              |
| Dominio           | `src/domain/`          | Entidades, `risk-engine`, `proveedor-risk`, `fraccionamiento`, `validators`. Puro, sin deps externas. Aquí viven los tests.   |
| Aplicación        | `src/application/`     | Casos de uso (`use-cases.ts`, `auth-use-cases.ts`) y puertos (`ports.ts`): `ObrasRepository`, `CryptoPort`, `CaptchaVerifier`.|
| Infraestructura   | `src/infrastructure/`  | Adaptadores: `db/client.ts` + `schema.sql`, repositorios PG/JSON (`repositories/`), `auth/{captcha-store,session}.ts`.      |
| Presentación      | `src/app/`, `src/components/`, `src/lib/` | Next.js App Router: landing, `/plataforma`, `/login`, `/registro`, `/buscar-proveedor`; route handlers en `app/api/`; mapas Leaflet y helpers de formato. |

Decisión clave: la fábrica `getObrasRepository()` elige adaptador Postgres o `seed.json` según exista `DATABASE_URL` (ver [ADR-0001](./adr/ADR-0001.md)); la separación en capas y sus reglas de dependencia se formalizan en [ADR-0004](./adr/ADR-0004.md).

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

**Decisiones clave:** los datos se precargan (ETL) en vez de llamar APIs del Estado en vivo, para que la demo de las 6 pm no dependa de que un portal externo esté arriba. Ver [ADR-0001](./adr/ADR-0001.md); la estructura hexagonal en capas se documenta en [ADR-0004](./adr/ADR-0004.md).