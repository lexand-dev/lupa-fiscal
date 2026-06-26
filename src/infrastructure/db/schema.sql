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
  lat            DOUBLE PRECISION,
  lng            DOUBLE PRECISION,
  entidad_id     TEXT REFERENCES entidad(id),
  contrato_id    TEXT REFERENCES contrato(id)
);

CREATE INDEX IF NOT EXISTS idx_entidad_region ON entidad(region);
CREATE INDEX IF NOT EXISTS idx_obra_estado    ON obra(estado);
CREATE INDEX IF NOT EXISTS idx_obra_entidad   ON obra(entidad_id);
CREATE INDEX IF NOT EXISTS idx_contrato_prov  ON contrato(proveedor_id);
