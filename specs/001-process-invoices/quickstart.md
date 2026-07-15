# Quickstart Validation: InvoiceGuard AI MVP

## Purpose

Validar la demo completa con los comandos fijados durante el bootstrap de la aplicación Next.js;
los resultados esperados no cambian entre ejecución normal y ensayo de demo.

## Prerequisites

- Proyecto Supabase accesible desde el backend.
- Cuatro tablas creadas según [data-model.md](data-model.md), grants/Data API revisados y secretos
  solo en variables del backend.
- Seed idempotente con un proveedor, una orden `PO-DEMO-1500` por USD 1500, una factura duplicada
  conocida y referencias para los tres fixtures.
- Frontend y backend iniciados con los comandos definidos durante bootstrap.
- Archivos en `fixtures/` y extractor real o fallback de extracción configurado.

## Pre-demo reset

1. Ejecutar el mecanismo de reset/seed del proyecto.
2. Confirmar proveedor y orden mediante el backend o una consulta de verificación.
3. Confirmar que el número del caso aprobado y del monto incorrecto no existen.
4. Confirmar que el número del caso duplicado sí existe.
5. Abrir el frontend y comprobar conectividad del backend.

## Scenario 1 — Approved

1. Cargar el fixture correcto: total USD 1500, orden `PO-DEMO-1500`.
2. Esperar `APPROVED`.
3. Verificar cinco campos, proveedor y orden encontrados, no duplicado y monto coincidente.
4. Recargar la factura y su timeline.
5. Confirmar fila real en `invoices` y eventos mínimos en `audit_logs`.

## Scenario 2 — Amount mismatch and human resolution

1. Cargar el fixture con total USD 2300 para `PO-DEMO-1500`.
2. Esperar `NEEDS_REVIEW_HIGH_RISK` con ambos montos visibles.
3. Intentar decisión sin justificación y esperar rechazo de validación.
4. Aprobar excepcionalmente o rechazar con justificación.
5. Recargar: `automatic_decision` debe seguir en revisión; `human_decision` debe existir y ser el
   `effective_decision`; el timeline debe contener ambas decisiones.

## Scenario 3 — Duplicate

1. Cargar el fixture cuyo número normalizado ya está en seed.
2. Esperar `REJECTED`, incluso si proveedor, orden y monto coinciden.
3. Confirmar evento de consulta persistente y razón de duplicidad.
4. Confirmar que el índice no único permite una segunda fila con el mismo número normalizado, que
   el nuevo intento queda `REJECTED` y que `duplicate_of_invoice_id` referencia la factura original.

## OpenAI fallback check

1. Forzar un fallo de la llamada a OpenAI y cargar el fixture completo del escenario aprobado.
2. Confirmar que el adaptador devuelve los cinco campos completos con
   `extraction_source = FIXTURE_FALLBACK`.
3. Confirmar `EXTRACTION_FALLBACK_USED` y su motivo en `audit_logs`.
4. Confirmar que reglas, consultas y escritura en Supabase se ejecutan normalmente y que el caso
   termina `APPROVED`. El fallback no implica una extracción incompleta.
5. Repetir con un archivo sin coincidencia exacta de nombre y hash; confirmar HTTP `503`, código
   `EXTRACTION_UNAVAILABLE`, mensaje comprensible y ausencia de fixture arbitrario.

## Partial extraction check

1. Hacer que el extractor devuelva uno o más campos requeridos ausentes o inválidos.
2. Confirmar factura persistida con `NEEDS_REVIEW_HIGH_RISK` y campos afectados visibles.
3. Corregir únicamente los cinco campos permitidos con justificación.
4. Confirmar auditoría before/after, repetición de consultas y reglas, y resultado actualizado antes
   de cualquier decisión humana.

## Supabase failure check

1. Forzar por separado un fallo de consulta y un fallo de escritura desde el backend de prueba.
2. Confirmar HTTP `503` sin `APPROVED`, `REJECTED` ni indicador de proceso completado.
3. Confirmar que no existen filas parciales incorrectas en `invoices` o `audit_logs`.
4. Confirmar que el último evento se registra solo cuando la persistencia todavía está disponible.

## Repeated human resolution check

1. Resolver una factura `NEEDS_REVIEW_HIGH_RISK` con justificación y recargar su timeline.
2. Intentar una segunda resolución manual y confirmar HTTP `409`.
3. Confirmar que estado, justificación y timeline de la primera resolución permanecen intactos.

## Final gate

- Los tres escenarios completan en menos de dos minutos cada uno.
- Todas las decisiones y timeline sobreviven una recarga.
- No se usan datos temporales para duplicidad ni persistencia.
- El fallback solo sustituye extracción; Supabase y reglas siguen siendo reales.
- No aparecen funcionalidades fuera de alcance.
