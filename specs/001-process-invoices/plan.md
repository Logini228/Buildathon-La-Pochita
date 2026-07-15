# Implementation Plan: InvoiceGuard AI MVP

**Branch**: `001-process-invoices` | **Date**: 2026-07-15 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/001-process-invoices/spec.md`

## Summary

Construir un único flujo web que reciba una imagen o PDF, obtenga cinco campos estructurados,
consulte y escriba datos reales en Supabase, aplique reglas deterministas y muestre decisión y
timeline. Una factura incompleta se guarda como `NEEDS_REVIEW_HIGH_RISK`; el usuario puede corregir
solo los cinco campos y reprocesarla. Las decisiones automática y humana permanecen separadas.

El repositorio no contiene una aplicación previa que pueda reutilizarse. Para eliminar el bloqueo de
implementación se fija un único stack mínimo: Node.js 22 LTS, TypeScript 5 y Next.js 16.1 con App
Router. Frontend y Route Handlers viven en el mismo proceso; no existe un backend desplegado como
microservicio. Supabase se consume exclusivamente desde módulos server-only mediante
`@supabase/supabase-js`. Se fijan versiones estables y se conserva el lockfile.
El lockfile fija el patch exacto resuelto de Next.js dentro de la línea 16.1.

## Technical Context

**Language/Version**: Node.js 22 LTS, TypeScript 5, Next.js 16.1 estable y React 19.2.4 o superior

**Primary Dependencies**: Next.js App Router, React, `@supabase/supabase-js`, el SDK oficial
`openai`, `pdfjs-dist` y `@napi-rs/canvas`; el extractor queda detrás de un adaptador server-only que
usa la Responses API y el contrato JSON congelado, sin añadir otro servicio de aplicación

**Storage**: Supabase Postgres; exactamente `suppliers`, `purchase_orders`, `invoices`, `audit_logs`

**Testing**: Vitest para contrato y reglas puras; smoke end-to-end reproducible según `quickstart.md`

**Target Platform**: Aplicación web local o desplegable con navegador y un backend confiable

**Project Type**: Una aplicación Next.js full-stack con Route Handlers y Supabase; un solo proceso y
un solo despliegue lógico, sin microservicios

**Performance Goals**: Decisión visible en menos de dos minutos por factura de demo; resolución
humana en menos de dos minutos

**Constraints**: Tres personas, cuatro horas, una factura por operación, USD, imagen/PDF, sin Auth,
sin Storage nuevo, sin procesamiento masivo, sin tecnologías adicionales no justificadas

**Scale/Scope**: Tres fixtures de demo y procesamiento interactivo individual

**Extractor Configuration**: `OPENAI_API_KEY` es obligatoria para la extracción real y solo existe
en servidor. `OPENAI_VISION_MODEL` es opcional y usa `gpt-5.4` por defecto.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

- **Vertical slice — PASS**: carga, extracción, validación persistente, reglas, decisión, auditoría,
  corrección y resolución humana forman un solo recorrido.
- **Supabase — PASS**: el modelo usa únicamente las cuatro tablas permitidas; seed, duplicados,
  facturas, decisiones y timeline son persistentes.
- **Decision integrity — PASS**: el extractor solo estructura datos; el backend valida y decide con
  reglas deterministas y precedencia explícita.
- **Demo gate — PASS**: quickstart reserva validación de factura correcta, monto inconsistente y
  duplicado con lecturas/escrituras reales y timeline recuperado.
- **Four-hour scope — PASS**: tres frentes paralelos, integración temprana, sin Auth, ERP, colas,
  microservicios, paneles ni abstracciones adicionales.
- **Post-design re-check — PASS**: modelo, contratos y quickstart mantienen las mismas restricciones.

## Project Structure

### Documentation (this feature)

```text
specs/001-process-invoices/
├── spec.md
├── plan.md
├── research.md
├── data-model.md
├── quickstart.md
├── contracts/
│   ├── api.yaml
│   └── extractor.schema.json
└── checklists/
    └── requirements.md
```

### Source Code (repository root)

Las rutas siguientes son definitivas para el MVP y permiten propiedad separada sin crear proyectos
ni procesos adicionales.

```text
src/
├── app/
│   ├── page.tsx
│   └── api/invoices/
│       ├── process/route.ts
│       └── [id]/
│           ├── route.ts
│           ├── timeline/route.ts
│           ├── extracted-data/route.ts
│           └── human-decision/route.ts
├── components/
│   ├── invoice-upload.tsx
│   ├── invoice-result.tsx
│   └── review-action.tsx
└── lib/
    ├── contracts/
    ├── extraction/
    ├── invoice-processing/
    ├── rules/
    └── supabase/

supabase/
├── migrations/
└── seed/

fixtures/
├── approved-invoice
├── amount-mismatch-invoice
└── duplicate-invoice
```

**Structure Decision**: UI, Route Handlers y lógica server-only forman una sola aplicación Next.js.
La división A/B/C es de propiedad de archivos, no de despliegues. El navegador nunca accede con
credenciales privilegiadas a Supabase; toda carga, corrección y decisión pasa por Route Handlers.

## Components and Files Affected

| Área | Responsabilidad | Artefactos objetivo |
|------|-----------------|---------------------|
| Frontend | Carga, resultado, corrección limitada, decisión humana y timeline | `src/app/page.tsx`, `src/components/*.tsx` |
| Backend/extracción | Route Handlers, validación JSON, adaptador y errores | `src/app/api/invoices/**/route.ts`, `src/lib/extraction/`, `src/lib/invoice-processing/` |
| Supabase/reglas | Esquema, seed, consultas, duplicidad, reglas, persistencia y auditoría | `supabase/migrations/`, `supabase/seed/`, `src/lib/supabase/`, `src/lib/rules/` |
| Demo | Tres archivos reproducibles y guía de ensayo | `fixtures/`, `quickstart.md` |

## Processing Flow

1. Frontend valida tipo básico y envía una factura individual como `multipart/form-data`.
2. Backend crea un `processing_id` y registra `PROCESSING_STARTED` en `audit_logs`.
3. El adaptador recibe una imagen o rasteriza cada página del PDF como PNG mediante `pdfjs-dist` y
   `@napi-rs/canvas`; llama a la Responses
   API de OpenAI mediante el SDK oficial `openai`, usando `OPENAI_API_KEY` y
   `OPENAI_VISION_MODEL` (predeterminado `gpt-5.4`), y produce JSON estructurado conforme a
   cinco campos estructurados. Después calcula `invalid_fields` y agrega procedencia antes de
   validar el objeto enriquecido con `contracts/extractor.schema.json`. Si la API falla, selecciona
   por nombre exacto y hash un fixture registrado en el manifiesto de demo y devuelve
   `extraction_source = FIXTURE_FALLBACK` y `fallback_reason`; sin coincidencia, informa fallo.
4. Backend valida tipos y campos. Si faltan datos, guarda una factura incompleta con
   `NEEDS_REVIEW_HIGH_RISK`, audita los campos afectados y responde.
5. Con estructura suficiente, normaliza RUC exacto y número de factura (trim + mayúsculas).
6. Consulta proveedor por RUC, orden por referencia y duplicado por número normalizado.
7. Compara proveedor de la orden y monto autorizado con total facturado.
8. Motor puro aplica precedencia: duplicado → `REJECTED`; cualquier otro fallo →
   `NEEDS_REVIEW_HIGH_RISK`; todo válido → `APPROVED`.
9. Guarda siempre un nuevo intento de factura y su decisión automática. Si es duplicado, guarda
   `duplicate_of_invoice_id` apuntando a la factura original o raíz; no existe restricción única sobre el
   número normalizado. Registra cada validación y persistencia.
10. Frontend obtiene resultado y timeline persistido.
11. Una factura incompleta puede corregirse en sus cinco campos; el backend audita el cambio y
    repite desde el paso 4. Una factura en revisión puede recibir decisión humana justificada.

## Endpoints and Contracts

| Método y ruta | Entrada | Salida | Uso |
|---------------|---------|--------|-----|
| `POST /api/invoices/process` | Archivo imagen/PDF | `InvoiceResult` | Ejecuta flujo completo |
| `GET /api/invoices/{id}` | ID de factura | `InvoiceResult` | Recupera datos, decisiones y validaciones |
| `GET /api/invoices/{id}/timeline` | ID de factura | `AuditEvent[]` | Recupera timeline persistido |
| `PATCH /api/invoices/{id}/extracted-data` | Cinco campos corregibles + justificación | `InvoiceResult` | Corrige incompleta y reprocesa |
| `POST /api/invoices/{id}/human-decision` | `APPROVED` o `REJECTED` + justificación | `InvoiceResult` | Resuelve revisión |

Los contratos detallados están en `contracts/api.yaml`. El extractor y backend intercambian
exactamente `invoice_number`, `supplier_name`, `tax_id`, `purchase_order_number`, `total`, más
metadatos de validez y procedencia (`extraction_source`, `fallback_reason`); no se incluyen líneas,
impuestos ni monedas múltiples.

## Error Handling

- Tipo de archivo no aceptado: `400`, sin factura; auditar solo si el procesamiento ya comenzó.
- Extracción parcial/ilegible: persistir incompleta en `NEEDS_REVIEW_HIGH_RISK`, devolver campos
  afectados y permitir corrección limitada.
- Error de OpenAI: usar el fixture de demostración correspondiente detrás del mismo adaptador,
  registrar `EXTRACTION_FALLBACK_USED` con el motivo en `audit_logs` y continuar con reglas y
  Supabase reales. Si el manifiesto no contiene coincidencia exacta de nombre y hash, no seleccionar
  otro fixture: devolver HTTP `503`, código `EXTRACTION_UNAVAILABLE` y un mensaje comprensible.
- Proveedor/orden ausente, relación o monto inválido: persistir revisión con todos los motivos.
- Duplicado: `REJECTED`; persistir el nuevo intento con referencia `duplicate_of_invoice_id`. La
  demo procesa una factura por operación y no añade coordinación de concurrencia fuera de alcance.
- Supabase no disponible o consulta/escritura fallida: devolver `503`, no marcar el proceso como
  completado y no devolver `APPROVED`, `REJECTED` ni otro éxito de negocio. No crear registros
  parciales incorrectos; registrar el último evento posible únicamente cuando la persistencia siga
  disponible.
- Decisión humana sin justificación, valor inválido o factura no revisable: `422`.
- Corrección concurrente o decisión ya resuelta: `409`; recuperar estado actual antes de reintentar.
- Nunca devolver credenciales, trazas internas ni salida cruda sensible del extractor.

## Testing Strategy

1. **Contrato**: validar ejemplos de request/response contra JSON Schema/OpenAPI, incluidos campos
   ausentes, total inválido y estados permitidos.
2. **Reglas unitarias**: tabla de casos para duplicado, proveedor ausente, orden ausente, proveedor
   distinto, monto distinto y caso aprobado; verificar precedencia del duplicado.
3. **Persistencia integrada**: seed real, lectura por RUC/orden, índice no único de duplicidad, persistencia
   separada del intento original y del duplicado rechazado, eventos y resolución humana separada.
4. **Flujo integrado**: procesar cada fixture mediante endpoint, volver a consultar factura y
   timeline, y comprobar orden y contenido de eventos.
5. **Prueba manual de frontend**: carga, campos, decisión, corrección limitada, justificación y
   recarga del timeline.
6. **Smoke final**: ejecutar los tres escenarios consecutivamente sobre un seed limpio.

## Parallel Work and Integration Order

| Persona | 0:00–1:30 | 1:30–2:45 | 2:45–4:00 |
|---------|-----------|-----------|-----------|
| A — Frontend | Pantalla única contra respuestas mock conformes al contrato | Integrar endpoint y timeline reales | Revisión humana y ensayo |
| B — Backend/extracción | Contrato e interfaz del adaptador; luego OpenAI real | Orquestación y extracción parcial | Fallback y ensayo |
| C — Supabase/reglas | Esquema/seed en paralelo con el extractor y frontend | Repositorios, reglas y auditoría | Reset seed y evidencia |

Orden obligatorio de integración:

1. Minuto 0–15: verificar Node.js 22, instalar el stack ya fijado y congelar contratos.
2. Minuto 15–40: ejecutar tres frentes paralelos: A monta frontend con mocks del contrato; B define
   la interfaz del extractor y conecta OpenAI; C crea esquema, seed, repositorios y reglas.
3. Minuto 40–85: integrar una factura aprobada desde archivo y extracción real hasta Supabase,
   decisión, frontend y timeline.
4. Minuto 85–90: ejecutar el checkpoint obligatorio T010 descrito en `tasks.md`. Si falla, eliminar
   inmediatamente todas las tareas P1 y cualquier pulido visual.
5. Minuto 90–150: ejecutar en paralelo extracción parcial, discrepancia/resolución y duplicado.
6. Minuto 150–190: verificar fallback separado y cerrar integración.
7. Minuto 190–225: reset/seed, ejecutar tres escenarios y corregir solo bloqueantes.
8. Minuto 225–240: segundo ensayo de demo y congelamiento.

## Demo Risks and Fallbacks

| Riesgo | Mitigación primaria | Respaldo permitido |
|--------|---------------------|--------------------|
| OpenAI/Responses API falla o varía | Validar JSON estructurado y conservar el error seguro | Fixture de extracción para el mismo archivo, evento `EXTRACTION_FALLBACK_USED`, reglas y Supabase reales |
| PDF no soportado por extractor | Probar PDF al inicio | Usar imagen de la misma factura; mantener endpoint compatible con ambos tipos |
| Supabase remoto inestable | Health check, seed idempotente y evitar cambios tardíos | Proyecto Supabase alterno ya configurado con el mismo schema/seed; no usar memoria local |
| Duplicado contaminado por ensayos | Script de reset y números conocidos | Re-seed antes de demo |
| Integración frontend tardía | Contrato congelado y respuestas fixture | Cliente mínimo de una pantalla; no omitir backend ni persistencia |
| Tiempo insuficiente | Checkpoint obligatorio al minuto 90 | Eliminar P1 y pulido visual; concentrar las tres personas en el flujo P0 |

## Complexity Tracking

No existen violaciones constitucionales justificadas. La edición limitada de cinco campos fue una
aclaración aprobada y reutiliza el mismo endpoint de reprocesamiento; no introduce un CRUD general.
