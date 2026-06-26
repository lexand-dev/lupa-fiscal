# Lupa Fiscal — imagen de la app Next.js (incluye etl/ para la carga inicial)
FROM node:20-alpine

WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1

# 1) Dependencias (capa cacheable)
COPY package.json package-lock.json ./
RUN npm ci

# 2) Código + build de producción
COPY . .
RUN npm run build

EXPOSE 3000

# 3) Arranque: si hay DATABASE_URL, corre la ETL (schema + seed) y luego sirve.
#    Comando inline para evitar problemas de CRLF con un .sh en Windows.
CMD ["sh","-c","if [ -n \"$DATABASE_URL\" ]; then echo '> Cargando schema + seed en Postgres...'; node etl/db_setup.mjs || echo '! db_setup fallo (¿ya cargado?), continuo'; fi; exec npm run start"]
