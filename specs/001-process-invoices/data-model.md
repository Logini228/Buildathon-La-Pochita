# Data Model: InvoiceGuard AI MVP

## Conventions

- IDs: UUID generados por la base.
- Fechas: timestamp con zona horaria, UTC.
- Dinero: decimal de precisión fija, no punto flotante; USD implícito para la demo.
- RUC: texto normalizado para coincidencia exacta.
- Número de factura: valor original más versión `trim + uppercase` indexada para detectar
  coincidencias; cada intento, incluido un duplicado rechazado, se conserva como fila independiente.
- Solo cuatro tablas principales.

## `suppliers`

| Campo | Tipo lógico | Restricción |
|-------|-------------|-------------|
| `id` | UUID | PK |
| `tax_id` | texto | obligatorio, único, normalizado |
| `name` | texto | obligatorio, informativo para coincidencia |
| `created_at` | timestamp | obligatorio |

## `purchase_orders`

| Campo | Tipo lógico | Restricción |
|-------|-------------|-------------|
| `id` | UUID | PK |
| `po_number` | texto | obligatorio, único |
| `supplier_id` | UUID | FK a `suppliers.id`, obligatorio |
| `authorized_amount` | decimal | obligatorio, no negativo |
| `created_at` | timestamp | obligatorio |

## `invoices`

| Campo | Tipo lógico | Restricción |
|-------|-------------|-------------|
| `id` | UUID | PK |
| `processing_id` | UUID | obligatorio, único |
| `invoice_number_raw` | texto nullable | valor extraído/corregido |
| `invoice_number_normalized` | texto nullable | indexado, no único |
| `supplier_name_extracted` | texto nullable | informativo |
| `tax_id_extracted` | texto nullable | búsqueda exacta normalizada |
| `purchase_order_number` | texto nullable | referencia extraída |
| `total` | decimal nullable | no negativo cuando existe |
| `supplier_id` | UUID nullable | FK a `suppliers.id` |
| `purchase_order_id` | UUID nullable | FK a `purchase_orders.id` |
| `duplicate_of_invoice_id` | UUID nullable | FK autorreferente a la factura original o raíz |
| `missing_or_invalid_fields` | lista JSON | obligatorio; vacío si completa |
| `automatic_decision` | enum lógico | `APPROVED`, `NEEDS_REVIEW_HIGH_RISK`, `REJECTED` |
| `automatic_reasons` | lista JSON | obligatorio |
| `human_decision` | enum lógico nullable | solo `APPROVED` o `REJECTED` |
| `human_justification` | texto nullable | obligatorio si hay decisión humana |
| `human_decided_at` | timestamp nullable | junto con decisión humana |
| `created_at`, `updated_at` | timestamp | obligatorios |

`effective_decision` se deriva en respuesta: `human_decision ?? automatic_decision`; no requiere
otra tabla ni ocultar la decisión automática.

## `audit_logs`

| Campo | Tipo lógico | Restricción |
|-------|-------------|-------------|
| `id` | UUID | PK |
| `processing_id` | UUID | obligatorio, permite auditar antes de crear factura |
| `invoice_id` | UUID nullable | FK a `invoices.id` |
| `event_type` | texto controlado | obligatorio |
| `status` | texto controlado | `STARTED`, `PASSED`, `FAILED`, `COMPLETED` |
| `details` | JSON | motivos, valores relevantes o cambios before/after |
| `created_at` | timestamp | obligatorio, indexado con `processing_id` |

Eventos mínimos: `PROCESSING_STARTED`, `EXTRACTION_COMPLETED`, `EXTRACTION_INVALID`,
`EXTRACTION_FALLBACK_USED`,
`SUPPLIER_CHECKED`, `PURCHASE_ORDER_CHECKED`, `DUPLICATE_CHECKED`, `AMOUNT_COMPARED`,
`RULES_EVALUATED`, `INVOICE_PERSISTED`, `FIELDS_CORRECTED`, `HUMAN_DECISION_RECORDED`.

## Relationships

- Supplier 1:N Purchase Order.
- Supplier 1:N Invoice validada; nullable para factura incompleta/desconocida.
- Purchase Order 1:N Invoice; nullable si no se encuentra.
- Invoice 1:N Audit Log; `processing_id` enlaza eventos previos a la factura.
- Invoice 1:N Invoice duplicada mediante `duplicate_of_invoice_id`; cada intento conserva su propia
  decisión y timeline.

## State Transitions

```text
upload
  -> extraction incomplete -> automatic NEEDS_REVIEW_HIGH_RISK
       -> fields corrected -> full reprocessing -> automatic decision recalculated
  -> extraction complete -> full validation -> APPROVED | NEEDS_REVIEW_HIGH_RISK | REJECTED

NEEDS_REVIEW_HIGH_RISK
  -> human APPROVED (justification required)
  -> human REJECTED (justification required)
```

- `APPROVED` o `REJECTED` automáticos no admiten decisión humana.
- Una corrección no decide: reinicia todas las validaciones.
- La decisión automática previa a una corrección permanece en `audit_logs`.
- Una decisión humana no sobrescribe `automatic_decision`.

## Rule Matrix

| Condición | Decisión automática | Precedencia |
|-----------|---------------------|-------------|
| Número normalizado ya existe | `REJECTED` | 1 |
| Campo requerido ausente/inválido | `NEEDS_REVIEW_HIGH_RISK` | 2 |
| Proveedor por RUC no existe | `NEEDS_REVIEW_HIGH_RISK` | 2 |
| Orden no existe | `NEEDS_REVIEW_HIGH_RISK` | 2 |
| Proveedor de orden no coincide | `NEEDS_REVIEW_HIGH_RISK` | 2 |
| Total != monto autorizado | `NEEDS_REVIEW_HIGH_RISK` | 2 |
| Todas las validaciones pasan | `APPROVED` | 3 |

Todos los fallos de precedencia 2 se acumulan como razones cuando los datos permiten evaluarlos.
