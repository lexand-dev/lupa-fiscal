-- schema.sql — Lupa Fiscal
-- Modelo normalizado mínimo (PDF sección 3). Las banderas son DERIVADAS por el
-- motor de dominio en runtime; no se persisten.

CREATE TABLE IF NOT EXISTS entidad (
  id              TEXT PRIMARY KEY,
  nombre          TEXT NOT NULL,
  nivel_gobierno  TEXT NOT NULL CHECK (nivel_gobierno IN ('nacional','regional','local')),
  region          TEXT NOT NULL,
  ubigeo          TEXT
);

CREATE TABLE IF NOT EXISTS proveedor (
  id                 TEXT PRIMARY KEY,
  ruc                TEXT,
  razon_social       TEXT NOT NULL,
  sancionado         BOOLEAN NOT NULL DEFAULT FALSE,
  num_adjudicaciones INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS contrato (
  id                TEXT PRIMARY KEY,
  ocid              TEXT,
  cui               TEXT,
  valor_referencial NUMERIC,
  monto_adjudicado  NUMERIC,
  num_postores      INTEGER,
  entidad_id        TEXT REFERENCES entidad(id),
  proveedor_id      TEXT REFERENCES proveedor(id)
);

CREATE TABLE IF NOT EXISTS obra (
  id             TEXT PRIMARY KEY,
  nombre         TEXT NOT NULL,
  monto_inversion NUMERIC,
  estado         TEXT NOT NULL CHECK (estado IN ('paralizada','en_ejecucion','concluida','desconocido')),
  meses_parada   INTEGER,
  avance_fisico  NUMERIC,
  categoria      TEXT,
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  entidad_id     TEXT REFERENCES entidad(id),
  contrato_id    TEXT REFERENCES contrato(id)
);

-- Columnas añadidas (idempotente, para bases ya creadas)
ALTER TABLE contrato ADD COLUMN IF NOT EXISTS cui TEXT;
ALTER TABLE obra     ADD COLUMN IF NOT EXISTS categoria TEXT;

CREATE INDEX IF NOT EXISTS idx_entidad_region ON entidad(region);
CREATE INDEX IF NOT EXISTS idx_obra_estado    ON obra(estado);
CREATE INDEX IF NOT EXISTS idx_obra_entidad   ON obra(entidad_id);
CREATE INDEX IF NOT EXISTS idx_obra_categoria ON obra(categoria);
CREATE INDEX IF NOT EXISTS idx_contrato_prov  ON contrato(proveedor_id);
CREATE INDEX IF NOT EXISTS idx_contrato_cui   ON contrato(cui);
