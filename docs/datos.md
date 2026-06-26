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

## 2. Contraloría / INFOBRAS — Obras y paralizadas

Portal: `https://infobras.contraloria.gob.pe/infobrasweb` (ASP.NET MVC 5, IIS).
Backoffice JSON expuesto vía rutas `/InfobrasWeb/...` — **sin autenticación** para
lectura pública. La API interna (`api-host`) apunta a `/InfobrasApi` pero el front
usa los endpoints MVC bajo `/InfobrasWeb/Mapa/...`. Respuesta envoltorio estándar:

```json
{ "Parameters": {...}, "Code": 0, "Description": "Success",
  "ErrorDescription": null, "Result": <list|object|int> }
```
`Code == 0` => OK; `Code == -2` => error de servidor (normalmente falta `Parameters`).

### Endpoints descubiertos

| Endpoint (`GET /InfobrasWeb/...`) | Descripción | Salida |
|---|---|---|
| `Mapa/Busqueda` | Arranque del buscador público (HTML). | JSON pequeño de configuración. |
| `Mapa/busqueda?page=0&rowsPerPage=N` | **Totales agregados**. Devuelve `[totalObras, totalObrasParalizadas]`. | `Result: [int, int]`. |
| `Mapa/busqueda/obrasnombre?term=<texto>` | **Autocompletado de obras por nombre**. Máx ~5 resultados, **objeto de obra completo**. | `Result: Obra[]`. |
| `Mapa/busqueda/obras?page=&rowsPerPage=&Parameters=<b64>` | Listado filtrado paginado (avanzado). Requiere `Parameters` base64. | `Result: Obra[]`. |
| `Mapa/busqueda/obras/groupby/departamento?page=&rowsPerPage=&Parameters=` | Conteo de obras agrupado por departamento. | `Result: {"DEPT": n}`. |
| `Mapa/Sumario?ObraId=<Codigo>` | **Ficha de una obra**: contratista, supervisor, cronograma, avances, adicionales, controversias, SIAF, galería, SEACE vinculado. | HTML (render сервер-side). |
| `Mapa/galeria?page=&Parameters=` | Fotos de avance de obra. | JSON (vacío sin `Parameters`). |
| `Mapa/modalidad-control?control=<id>` | Catálogo de modalidades de control (OCI). | `Result: []`. |
| `Mapa/ListaParametrosComentario` | Catálogos: departamentos, provincias, distritos, estados, naturaleza, tipo de obra (para llenar filtros). | JSON con listas. |
| `Interoperabilidad/ObtenerProvinciasByDep?page=0&rowsPerPage=1000&departamento=<cod>` | Provincias por dep. (ubigeos). | `Result: []`. |
| `Interoperabilidad/ObtenerDistritosByProv?page=0&rowsPerPage=1000&provincia=<cod>` | Distritos por provincia. | `Result: []`. |
| `Archivo/DownloadFile?filename=<hash>&name=<>&contentType=<>&extension=<.pdf>` | Descarga de PDFs (directivas, capacitaciones, reportes). | Binario. |
| `Archivo/ShowFile?filename=<>` | Visualización inline de un archivo. | Binario. |

### Modelo `Obra` (campos clave para Lupa Fiscal)

Del campo `Result` de `obrasnombre` / `obras`:

- `Codigo` (id obra), `NombreObra`, `CodigoSnip`, `CodigoUnicoInversion`
- `ObraParalizada: bool` — **bandera directa de obra paralizada**
- `estObra`, `estObraDesc` — estado de ejecución
- `MontoProyecto`, `Montototal`, `montoSIAF*` — montos
- `nombreDepartamento / nombreProvincia / nombreDistrito` — ubicación (para mapa)
- `supervisor` (`dniSupervisor`, `rucSupervisor`, `nombresSupervisor`),
  `residente` (`numdocResidente`, `nombresResidente`)
- `contratista`, `concesionario`, `CodigoConcesionario`, `RucConsecion` — **cruce con RUC del proveedor**
- `seaces` — referencia al proceso SEACE (para enlazar con endpoints de la sección 3)
- `existeDenuncia`, `existeAuditoria`, `controversias`, `adicionales`,
  `modificaciones`, `transferencias`

### Uso en Lupa Fiscal

- **Headline de contexto** (cartel "2700 obras paralizadas / S/67.13B congelados"):
  `Mapa/busqueda?page=0&rowsPerPage=1` → `Result[0]` y `Result[1]`.
- **Mapa ciudadano de obras paralizadas**: paginar `Mapa/busqueda/obrasnombre?term=`
  por departamentos/letras o construir `Parameters` (b64) con `estObra` = estado
  paralizada; ubicar por `nombre*Distrito` + ubigeos INEI.
- **Perfil de proveedor (RUC)**: `Mapa/Sumario?ObraId=<Codigo>` + parse HTML para
  extraer `contratista.RUC` y cruzar con OCDS adjudicaciones; bandera
  "obras paralizadas asociadas a este proveedor".
- **Enlace a ficha pública**: `https://infobras.contraloria.gob.pe/InfobrasWeb/Mapa/ExperienciaComentario?obraId=<Codigo>` (página pública conocha).
- **Catálogos** (ubigeos, estados, tipos) vía `ListaParametrosComentario` +
  `Interoperabilidad/ObtenerProvinciasByDep` / `ObtenerDistritosByProv`.

## 3. Ubigeos INEI + Centros Poblados IGN

- **Uso:** geocodificación para el mapa
- Si la obra solo trae distrito o código `ubigeo`, se obtiene `lat/lng` del centroide cruzando con estos datasets oficiales.

## 3b. SEACE — Buscador público de procesos de selección

Portal: `https://prod2.seace.gob.pe/seacebus-uiwd-pub/buscadorPublico/buscadorPublico.xhtml`
(JavaServer Faces + PrimeFaces, POST stateful con `javax.faces.ViewState` y
`PrimeFaces.ab` AJAX). **No existe API REST pública documentada**; la interacción
es por formularios JSF cuyos resultados se devuelven como fragmentos XML
parciales tras POST al mismo `.xhtml` con la cookie `JSESSIONID` y el
`ViewState` de la sesión.

### "Endpoints" (rutas JSF)

| Ruta / form | Descripción |
|---|---|
| `buscadorPublico.xhtml` (GET) | Pantalla con 5 pestañas/formularios de búsqueda. |
| Form `tbBuscador:idFormBuscarProceso` | **Procesos de selección** (LP, AS,subasta, etc.) — el principal. Campos: RUC/Nombre/Sigla entidad, `numeroConvocatoria`, `numeroSeleccion`, `descripcionObjeto`, `anioConvocatoria`, fechas `dfechaInicio_input`/`dfechaFin_input`, ubigeo dep/prov/distrito, modalidad `j_idt194_input`, tipo `j_idt206_input`, estado `j_idt254_input`, `btnBuscarSel`, `btnExportar`. |
| Form `tbBuscador:idFormbuscarACF` | **Anuncio de Contratación Futura** (ACF): planificación. `cbxObjContratacion`, `cbxTipoSeleccion`, fechas pub. y aprox. convocatoria, RUC, `btnBuscarSelCCOToken`. |
| Form `tbBuscador:idFormbuscarexpresionInteres` | **Expresión de Interés** (procedimientos por méritos). |
| Form `tbBuscador:idFormbuscarDifusionRequerimientos` | **Difusión de Requerimientos** (URS). |
| Form `tbBuscador:idFormbuscarOCOS` | **Órdenes de Compra / de Servicio** (OCOS). |
| `recurso?nombre=cmsDescarga.js` | Script de descarga (exportación). |
| `buscadorPublico/contact/contactenos.xhtml`, `copyright.xhtml` | Auxiliares. |

### Patrón de consumo (no hay GET directo a resultados)

1. GET `buscadorPublico.xhtml` sin params → capturar cookie `JSESSIONID` y el
   `input[name="javax.faces.ViewState"]`.
2. POST al mismo URL con `Content-Type: application/x-www-form-urlencoded`,
   `faces.partial.ajax=true`, `javax.faces.partial.execute=@all`,
   `javax.faces.source=tbBuscador:idFormBuscarProceso:btnBuscarSel`,
   `submit=S`, los campos del formulario elegido y el `ViewState`.
3. La respuesta es un `<?xml ...?>` con `<partial-response>` que contiene los HTML
   updates (`<update id="...">`). Paginación y "Exportar Excel" (`btnExportar`)
   son POSTs posteriores a la misma sesión+ViewState.

### Uso en Lupa Fiscal

- **Confirmación de un proceso de selección vinculado a una obra**: parsear el
  enlace `seaces` de InfoBras → desambiguar entidad/RUC en SEACE → ver
  nomenclatura, montos adjudicados, proveedor ganador (cruce con OCDS).
- **Vigilancia de convocatorias**:可用于 ACF ("próximas compras") para
  señales tempranas de riesgo de la entidad contratante.
- **Implementación recomendada**: NO scrapear en tiempo real desde la UI
  (frágil por ViewState). Preferir (a) el dataset OCDS que ya cubre
  adjudicaciones/contratos, y (b) el **SEACE proveedor de datos masivo /
  Datos Abiertos SEACE** para exportaciones históricas; usar el buscador
  JSF solo como **deep-link de evidencia** a la ficha pública del proceso.
- Si se requiere ingestión programada: una tarea ETL con `requests` +
  cookie jar + parseo de ViewState (mismo crawler que el ciudadano haría a mano).

## 3c. Datos Abiertos del Perú (DKAN) — datasets de obras

Portal: `https://www.datosabiertos.gob.pe` (DKAN sobre Drupal). Expone una API
**compatible con CKAN v3** bajo `/api/3/action/...` + páginas HTML de búsqueda
y dataset.

### Rutas

| Ruta | Descripción |
|---|---|
| `/?query=<texto>&sort_by=changed&sort_order=DESC&page=<n>,<por página>` | **Búsqueda HTML** de datasets (la URL que da el usuario). Devuelve HTML con `<a href="/dataset/<slug>">`. |
| `/search/type/dataset?query=<texto>&...` | Variante de búsqueda por tipo. |
| `/dataset/<slug>` | Página del dataset: lista de recursos/CSV. |
| `/dataset/<slug>/resource/<uuid>` | Página de un recurso (redirige al archivo). |
| `/api/3/action/package_list` | **Lista de todos los slugs** de datasets (JSON). ✔ verificado 200. |
| `/api/3/action/package_show?id=<slug>` | **Metadata + recursos** de un dataset (JSON, fields: `title`, `notes`, `resources[].url`, `format`, `mimetype`, ...). ✔ verificado 200. |
| `/api/3/action/package_search?q=...` | **No disponible** en este portal (redirige a búsqueda HTML). Usar la página `/?query=` o `package_list` + `package_show` filtrando en el cliente. |

Cada `resources[].url` apunta normalmente a archivos directos en
`https://fs.datosabiertos.mef.gob.pe/datastorefiles/*.csv` (o XLSX/JSON).

### Uso en Lupa Fiscal

- **Catálogo de datasets de inversión / obras**: iterar `package_list` → filtrar
  slugs que contengan "obra", "inversion", "partamento", "ejecucion" →
  `package_show` para obtener URLs de CSV.
- **Descarga ETL**: para cada `resource.url` con `format` ∈ {csv, xlsx},
  `curl -L` directo a `data/<slug>/<resource>.csv` y loader a Postgres.
- Las páginas HTML (`/?query=obras`) sirven solo para descubrir slugs; la
  ingesta masiva va por `package_show` (JSON estable).
- Verificar licencia por dataset (DKAN suele ser CC BY 4.0) antes de exponer.

## 4. OSCE / RNSSC — Proveedores sancionados

- **Uso:** bandera "proveedor sancionado"
- **Estado:** verificar acceso · stretch
- Número de RUC del proveedor inhabilitado para cruce contra contratos adjudicados.