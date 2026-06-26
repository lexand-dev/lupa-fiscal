# Lupa Fiscal — Documentos y fuentes de datos para alimentar la web app

Este documento enumera los archivos/fuentes que se usarán para alimentar la demo de **Lupa Fiscal**, con una breve descripción de cada uno y un espacio para agregar manualmente el enlace oficial o de descarga.

---

## 1. OCDS OECE / SEACE — Contrataciones Abiertas

**Documento / archivo:** `2026-06_seace_v3.json`  
**Link:** `https://contratacionesabiertas.oece.gob.pe/descargas`  
**Uso en la web app:** módulo de análisis de proveedor por RUC.  
**Descripción:** archivo JSON mensual de contrataciones públicas en formato OCDS. Permite analizar procedimientos, entidades compradoras, proveedores, montos, categorías, postores, adjudicaciones y contratos cuando estén disponibles.  
**Importancia:** esencial para calcular señales como postor único, concentración con una entidad, monto adjudicado, historial de contratación y perfil del proveedor.

---

## 2. Sancionados / Inhabilitados

**Documento / archivo:** `sancionados.csv`  
**Link:** `https://bi.seace.gob.pe/pentaho/api/repos/%3Apublic%3Aportal%3Adataset.html/content?userid=public&password=key&pagina=penalidades`  
**Uso en la web app:** bandera de sanción vigente o histórica.  
**Descripción:** listado de proveedores sancionados o inhabilitados para contratar con el Estado. Incluye RUC, razón social, fechas de sanción, resolución y motivo de infracción.  
**Importancia:** es la bandera más fuerte para el perfil de riesgo del proveedor.

---

## 3. Sancionados con multa

**Documento / archivo:** `sancionados_multa.csv`  
**Link:** `https://bi.seace.gob.pe/pentaho/api/repos/%3Apublic%3Aportal%3Adataset.html/content?userid=public&password=key&pagina=penalidades`  
**Uso en la web app:** bandera complementaria de multas.  
**Descripción:** listado de proveedores sancionados con multa. Incluye RUC, razón social, fechas, resolución, motivo y monto de la multa.  
**Importancia:** ayuda a enriquecer el perfil de riesgo del proveedor con antecedentes económicos sancionatorios.

---

## 4. Inhabilitaciones judiciales

**Documento / archivo:** `inhabilitaciones_judiciales.csv`  
**Link:** `https://bi.seace.gob.pe/pentaho/api/repos/%3Apublic%3Aportal%3Adataset.html/content?userid=public&password=key&pagina=penalidades`  
**Uso en la web app:** bandera de inhabilitación por mandato judicial.  
**Descripción:** registro de proveedores o personas inhabilitadas por decisión judicial. Incluye RUC/DNI, razón social o nombre, órgano jurisdiccional, resolución y fechas de inicio/fin.  
**Importancia:** útil como señal fuerte de riesgo legal o de cumplimiento.

---

## 5. Penalidades contractuales

**Documento / archivo:** `penalidades.csv`  
**Link:** `https://bi.seace.gob.pe/pentaho/api/repos/%3Apublic%3Aportal%3Adataset.html/content?userid=public&password=key&pagina=penalidades`  
**Uso en la web app:** bandera de penalidades en contratos.  
**Descripción:** listado de penalidades aplicadas a contratistas. Incluye ID de contrato, RUC del contratista, tipo de penalidad, entidad contratante, fecha, motivo y monto.  
**Importancia:** permite detectar antecedentes de problemas de ejecución o cumplimiento contractual.

---

## 6. Penalidades históricas 2018

**Documento / archivo:** `penalidades2018.csv`  
**Link:** `https://bi.seace.gob.pe/pentaho/api/repos/%3Apublic%3Aportal%3Adataset.html/content?userid=public&password=key&pagina=penalidades`  
**Uso en la web app:** histórico adicional de penalidades.  
**Descripción:** archivo histórico de penalidades contractuales con estructura similar a `penalidades.csv`.  
**Importancia:** recomendable para enriquecer la demo con historial adicional, siempre que se deduplique correctamente con otros archivos de penalidades.

---

## 7. Obras paralizadas — Anexo 02

**Documento / archivo:** `8147812-anexo-n-02-reporte-obras-paralizadas-marzo-2026.xlsx`  
**Link:** `https://bi.seace.gob.pe/pentaho/api/repos/%3Apublic%3Aportal%3Adataset.html/content?userid=public&password=key&pagina=penalidades`  
**Uso en la web app:** módulo ciudadano de obras paralizadas por región/mapa.  
**Descripción:** base principal de obras públicas paralizadas en el territorio nacional. Incluye código INFOBRAS, CUI, descripción de inversión, descripción de obra, entidad, modalidad de ejecución, costos, saldo por ejecutar, departamento, provincia, distrito, avance físico, sector, causal de paralización, Ley 31589, PIM 2026, entre otros.  
**Importancia:** archivo central para construir la vista ciudadana y el mapa de obras paralizadas.

---

## 8. Servicios de control asociados a obras paralizadas — Anexo 03

**Documento / archivo:** `8147812-anexo-n-03-reporte-de-servicios-de-control-a-obras-paralizadas-marzo-2026.xlsx`  
**Link:** `https://www.gob.pe/institucion/contraloria/informes-publicaciones/8147812-informe-de-obras-paralizadas-en-el-territorio-nacional-a-marzo-2026`  
**Uso en la web app:** enriquecimiento de ficha de obra.  
**Descripción:** listado de servicios de control efectuados a obras paralizadas. Incluye código INFOBRAS, CUI, tipo de control, entidad auditada, órgano auditor, número de informe, título de informe, año y URL del informe o resumen.  
**Importancia:** opcional pero valioso para mostrar evidencia adicional en obras con control asociado.

---

## 9. Principales obras paralizadas — Anexo 01

**Documento / archivo:** `8147812-anexo-n-01-principales-obras-paralizadas-marzo-2026.xlsx`  
**Link:** `https://www.gob.pe/institucion/contraloria/informes-publicaciones/8147812-informe-de-obras-paralizadas-en-el-territorio-nacional-a-marzo-2026`  
**Uso en la web app:** ejemplos destacados / datos de apoyo para demo.  
**Descripción:** listado resumido de principales obras paralizadas por departamento y modalidad de ejecución. Incluye CUI, descripción de obra, entidad, costo actualizado, nivel de gobierno y causal de paralización.  
**Importancia:** no es necesario como tabla principal porque el Anexo 02 es más completo, pero puede servir para seleccionar casos destacados para el pitch.

---

## 10. Informe de obras paralizadas — Contraloría

**Documento / archivo:** `8147812-informe-de-obras-paralizadas-en-el-territorio-nacional-a-marzo-2026.pdf`  
**Link:** `https://www.gob.pe/institucion/contraloria/informes-publicaciones/8147812-informe-de-obras-paralizadas-en-el-territorio-nacional-a-marzo-2026`  
**Uso en la web app:** sustento documental / contexto del pitch.  
**Descripción:** informe oficial de Contraloría sobre obras paralizadas a marzo de 2026. Contiene metodología, definiciones, cifras nacionales, análisis por sector, nivel de gobierno, modalidad de ejecución, avance físico, causales y anexos.  
**Importancia:** no se carga como data operativa, pero sirve para justificar cifras, definiciones y decisiones del producto.

---

## 11. Diccionario de datos OECE

**Documento / archivo:** `Diccionario.xlsx`  
**Link:** `https://www.gob.pe/institucion/contraloria/informes-publicaciones/8147812-informe-de-obras-paralizadas-en-el-territorio-nacional-a-marzo-2026`  
**Uso en la web app:** soporte técnico para ETL y documentación.  
**Descripción:** diccionario de campos del Portal de Datos Abiertos OECE. Ayuda a interpretar columnas de adjudicaciones, proveedores, ofertantes, contratos, penalidades, sanciones, entidades y otros datasets.  
**Importancia:** no debe cargarse a la app como data de runtime, pero sí debe usarse para construir correctamente el ETL y documentar el modelo de datos.