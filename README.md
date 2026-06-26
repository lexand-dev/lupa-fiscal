# Lupa Fiscal - Builders For The Win

Plataforma de señales de riesgo sobre datos abiertos del Estado: un mismo motor, tres públicos.

## Problemática y usuario

**Problema.** A inicios de 2026 hay más de 2,700 obras públicas paralizadas en el Perú, con más de S/ 67,139 millones de inversión congelada (Contraloría / INFOBRAS). El dato existe, pero está disperso y es ilegible: no hay forma simple de ver "qué obra cerca de mí está parada, por qué, y quién responde".

**Usuarios.**

- **Ciudadano — vigilancia.** Busca tu región y ve las obras públicas paralizadas cerca, cuánta inversión está congelada y qué banderas de riesgo tiene el contrato que las financió. De la indignación a la denuncia.
- **Entidad pública — contratación responsable.** Antes de adjudicar, busca un proveedor por RUC y ve su perfil de riesgo: sanciones e inhabilitaciones, historial de postor único, sobrecostos, concentración con una sola entidad y obras paralizadas asociadas.
- **Empresa privada — debida diligencia (Ley 30424).** La misma consulta por RUC que la ley anticorrupción obliga a hacer sobre proveedores, clientes y socios de negocio. El semáforo de integridad en compra pública de tu contraparte, en segundos.

## Stack tecnológico

| Capa        | Tecnología                                                       |
|-------------|------------------------------------------------------------------|
| Frontend    | Next.js (App Router) + TypeScript                                |
| Mapa        | Leaflet / MapLibre (render de obras por ubicación)               |
| API         | Route Handlers de Next.js                                        |
| Persistencia| PostgreSQL gestionado (Supabase / Neon)                          |
| ETL         | Node.js (descarga + parseo streaming de OCDS)                    |
| Testing     | Vitest (motor de señales de riesgo)                              |
| Despliegue  | Vercel (el timestamp del deploy sirve de verificación)           |

## Cómo correr el proyecto localmente

```bash
# 1. Clonar e instalar
git clone https://github.com/lexand-dev/lupa-fiscal.git && cd lupa-fiscal
npm install

# 2. Variables de entorno
cp .env.example .env        # completar DATABASE_URL

# 3. Cargar datos (ETL): descarga 1 año de OCDS y lo normaliza a Postgres
curl -L -o data/2025.jsonl.gz \
  "https://data.open-contracting.org/en/publication/135/download?name=2025.jsonl.gz"
node scripts/etl_ocds.mjs data/2025.jsonl.gz

# 4. Levantar y testear
npm run dev                 # http://localhost:3000
npm test                    # motor de señales de riesgo
```

## Modelos y herramientas de IA

Se usa IA generativa como **copiloto de ingeniería**, no como caja negra: para validar decisiones de arquitectura, generar boilerplate y tests, y explicar código mientras se construye. Cada integrante es dueño de sus módulos para sustentarlos en el Q&A.

- **Claude (Opus / Sonnet)** — arquitectura, ETL, tests
- **IA para documentación y diagramas** — asistente de editor
- **Asistente de editor (Copilot / Cursor)**

> Ajustar esta lista a las herramientas y cuentas que efectivamente use el equipo el día del evento.

## Integrantes y roles

| Integrante    | Rol                                                    | Defiende en el Q&A                                          |
|---------------|--------------------------------------------------------|-------------------------------------------------------------|
| [Bruno ]    | Datos & ETL · modelo de datos                           | Cómo se cargan y normalizan los datos                       |
| [Alexander F]    | Dominio · motor de reglas · tests                       | Por qué cada bandera y cómo se valida                        |
| [Jorge Nureña]    | API · UI/Mapa · despliegue                              | Cómo se consume y por qué la demo es estable                |


## Enlaces a documentación adicional

- Diagramas de arquitectura → [./docs/architecture.md](./docs/architecture.md)
- Decisiones de arquitectura → [./docs/adr/](./docs/adr/)
- Fuentes y endpoints de datos → [./docs/datos.md](./docs/datos.md)
- Repositorio: https://github.com/lexand-dev/lupa-fiscal · URL de producción: [pending — Vercel]
