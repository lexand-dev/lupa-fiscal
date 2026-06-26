# Flujo de Datos y Motor de Señales

A continuación se presenta la estructura de los datos crudos extraídos de las fuentes del Estado, y cómo el motor los transforma en el JSON final que consume el frontend (Next.js/React). 📊

## 1. Los Datos Base (Extraídos del Estado) 🏗️

Estos son los registros independientes almacenados en la base de datos tras el proceso de extracción (ETL). Se mantienen separados por sus identificadores únicos (`cui`, `ocid`, `ruc`).

### A. Registro de INFOBRAS (Tabla `obras`)

```json
{
  "cui": "2345678",
  "nombre_proyecto": "Mejoramiento del sistema de agua y alcantarillado en Villa María del Triunfo",
  "estado": "Paralizada",
  "motivo_paralizacion": "Resolución de contrato por incumplimiento",
  "fecha_paralizacion": "2025-08-15",
  "inversion_congelada_pen": 4500000,
  "coordenadas": {
    "lat": -12.1611,
    "lng": -76.9422
  }
}
```

### B. Registro del SEACE (Tabla `contratos`)

```json
{
  "ocid": "ocds-lcu-seace-2024-9876",
  "cui_vinculado": "2345678",
  "ruc_contratista": "20123456789",
  "entidad_contratante": "Ministerio de Vivienda",
  "cantidad_postores": 1,
  "monto_adjudicado": 4000000,
  "monto_final_con_adendas": 5200000
}
```

### C. Registro del RNP y Tribunal OSCE (Tabla `proveedores`)

```json
{
  "ruc": "20123456789",
  "razon_social": "Constructora Los Andes SAC",
  "estado_rnp": "Vigente",
  "sanciones_tribunal_historicas": 2,
  "inhabilitacion_vigente": false
}
```

## 2. El Motor de Señales (El Flujo de Lógica) ⚙️

El backend ejecuta un flujo secuencial cuando un usuario hace clic en una obra paralizada en el mapa interactivo:

1. **Consulta Inicial:** El frontend envía el `cui` (ej. `2345678`) al endpoint del backend.
2. **Resolución de Relaciones (Drizzle ORM):**
   - Busca la obra en la tabla `obras`.
   - Busca todos los contratos asociados a ese `cui` en la tabla `contratos`.
   - Por cada contrato, extrae el `ruc` y busca la información de la empresa en la tabla `proveedores`.
3. **Ejecución de Funciones Puras (Señales Atómicas):**
   - `evaluarPostorUnico(cantidad_postores)` ➡️ Devuelve `true` (porque fue `1`).
   - `evaluarSobrecosto(monto_adjudicado, monto_final)` ➡️ Devuelve `true` (hay un aumento del 30%, superior al límite de alerta del 15%).
   - `evaluarRiesgoProveedor(sanciones_historicas)` ➡️ Devuelve `true` (tiene 2 sanciones previas).
4. **Construcción del Perfil (`buildSupplierProfile`):** Se agrupan los resultados atómicos en un único objeto estructurado.

## 3. El JSON de Salida (Consumido por el Frontend) 🎯

Este es el payload final que recibe la aplicación cliente para pintar el "Semáforo de Integridad" y la "Ficha Técnica" sin tener que procesar lógica pesada en el navegador:

```json
{
  "obra": {
    "cui": "2345678",
    "titulo": "Mejoramiento del sistema de agua y alcantarillado en Villa María del Triunfo",
    "impacto_financiero": {
      "estado": "Paralizada",
      "monto_perdido_pen": 4500000
    },
    "ubicacion": { "lat": -12.1611, "lng": -76.9422 }
  },
  "analisis_riesgo": {
    "nivel_riesgo_global": "ALTO",
    "score_integridad": 35,
    "contratista_principal": {
      "ruc": "20123456789",
      "razon_social": "Constructora Los Andes SAC",
      "estado_actual": "Vigente con Antecedentes"
    },
    "banderas_rojas": [
      {
        "codigo": "RIESGO_001",
        "tipo": "Licitación sin competencia",
        "descripcion": "El contrato ocds-lcu-seace-2024-9876 se adjudicó con un (1) único postor.",
        "severidad": "CRITICO"
      },
      {
        "codigo": "RIESGO_002",
        "tipo": "Sobrecosto por Adendas",
        "descripcion": "El costo de la obra incrementó un 30.00% respecto al monto originalmente adjudicado.",
        "severidad": "ALTO"
      },
      {
        "codigo": "RIESGO_003",
        "tipo": "Historial de Sanciones",
        "descripcion": "El proveedor registra 2 sanciones históricas emitidas por el Tribunal del OSCE.",
        "severidad": "MEDIO"
      }
    ]
  }
}
```

Este diseño permite que el componente visual de React simplemente itere sobre el array `banderas_rojas` (`map()`) para renderizar los íconos de alerta 🔴🟡 correspondientes en la interfaz de usuario, manteniendo una separación total entre la lógica de negocio y la presentación. 🖥️✨
