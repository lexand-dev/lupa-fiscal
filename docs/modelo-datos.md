# Modelo de datos — Lupa Fiscal

Modelo normalizado mínimo para sostener el mapa, la ficha y el motor de banderas.

```mermaid
erDiagram
    ENTIDAD ||--o{ OBRA : "1—N (nivel_gobierno)"
    ENTIDAD ||--o{ CONTRATO : "financia"
    CONTRATO ||--|| OBRA : "1—1"
    CONTRATO }o--|| PROVEEDOR : "adjudicado a"
    CONTRATO ||--o{ BANDERA : "deriva (1—N)"
    BANDERA }o--|| CONTRATO : "N—1"
    OBRA {
        int id PK
        string nombre
        decimal monto_inversion
        string region
        string ubigeo
        float avance_fisico
        decimal meses_parada
        decimal lat
        decimal lng
        int entidad_id FK
        int contrato_id FK
    }
    CONTRATO {
        int id PK
        string ocid
        decimal valor_referencial
        decimal monto_adjudicado
        string estado
        int entidad_id FK
        int proveedor_id FK
    }
    ENTIDAD {
        int id PK
        string nombre
        string nivel_gobierno
    }
    PROVEEDOR {
        int id PK
        string ruc
        string razon_social
        boolean sancionado
        int num_adjudicaciones
    }
    BANDERA {
        int id PK
        string codigo
        int peso
        string detalle
        int contrato_id FK
    }
```

- Una **Obra** está financiada por un **Contrato**; el Contrato tiene un **Proveedor** y genera **Banderas** derivadas por el motor de riesgo.

**Geocodificación.** Si la obra solo trae distrito o código `ubigeo`, se obtiene `lat/lng` del centroide cruzando con los datasets oficiales de Ubigeos (INEI) y Centros Poblados (IGN).