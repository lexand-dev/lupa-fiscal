#!/usr/bin/env bash
# validar_fuentes.sh — Lupa Fiscal
# Comprueba que cada fuente de datos responde ANTES de comprometerte con ella.
# Uso:  bash scripts/validar_fuentes.sh
set -uo pipefail

ok()   { printf "  [OK] %s\n" "$1"; }
bad()  { printf "  [!!] %s\n" "$1"; }
head_status() { curl -s -o /dev/null -w "%{http_code}" -I -L --max-time 25 "$1"; }
get_status()  { curl -s -o /dev/null -w "%{http_code}" -L --max-time 25 "$1"; }

echo "== 1. OCDS contrataciones (descarga masiva — FUENTE PRINCIPAL) =="
URL_OCDS="https://data.open-contracting.org/en/publication/135/download?name=2025.jsonl.gz"
CODE=$(head_status "$URL_OCDS")
[ "$CODE" = "200" ] && ok "OCDS 2025 responde 200" || bad "OCDS devolvio $CODE"

echo "== 2. CKAN Plataforma Nacional de Datos Abiertos (API JSON) =="
URL_CKAN="https://www.datosabiertos.gob.pe/api/3/action/package_search?q=obras&rows=1"
CODE=$(get_status "$URL_CKAN")
[ "$CODE" = "200" ] && ok "CKAN responde 200" || bad "CKAN devolvio $CODE (puede bloquear bots; prueba en navegador)"

echo "== 3. INFOBRAS / Contraloria (obras, incl. paralizadas) =="
get_status "https://infobras.contraloria.gob.pe/infobrasweb/" | grep -q "200" \
  && ok "INFOBRAS arriba" || bad "INFOBRAS no responde 200"

echo "== 4. Geocodificacion (Centros Poblados / Ubigeos) =="
get_status "https://www.datosabiertos.gob.pe/dataset/dataset-centros-poblados" | grep -q "200" \
  && ok "Dataset Centros Poblados accesible" || bad "Centros Poblados no responde 200"

echo
echo "Las marcadas [!!] por bot-detection suelen abrir bien desde el navegador."
echo "La fuente principal (OCDS) es la que NO puede fallar."
