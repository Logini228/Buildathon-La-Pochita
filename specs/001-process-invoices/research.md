# Research: InvoiceGuard AI MVP

## Repository stack

**Decision**: Adoptar una única aplicación Next.js 16.1 con frontend y Route Handlers, Supabase como
persistencia empresarial y OpenAI Responses API mediante el SDK oficial `openai` para extracción.

**Rationale**: El repositorio no contenía una aplicación reutilizable. Fijar un solo proyecto
Next.js reduce bootstrap, integración y despliegue; Supabase cubre consultas y escrituras
obligatorias; y el SDK oficial de OpenAI evita construir un cliente HTTP o integrar otro proveedor.
Estas decisiones minimizan coordinación y tiempo de desarrollo para tres personas en cuatro horas.

**Alternatives considered**: Proyectos separados para frontend/backend, microservicios, otro
framework y otro proveedor de extracción fueron descartados por aumentar superficies de
integración sin aportar valor al flujo de demo.

## Application boundary

**Decision**: Una aplicación web con frontend y backend confiable, conectada a un único Supabase.

**Rationale**: Permite trabajo paralelo y mantiene secretos, extracción, reglas y escrituras fuera
del navegador sin introducir servicios adicionales.

**Alternatives considered**: Acceso directo desde frontend se descartó porque no hay Auth y una
clave secreta o `service_role` nunca debe exponerse. Edge Functions se descartaron porque no están
implementadas y añadirían otra superficie.

## Supabase access

**Decision**: Todas las operaciones pasan por backend; tablas con claves primarias, claves foráneas,
constraints e índices. Verificar exposición/grants de Data API en el proyecto usado.

**Rationale**: Supabase cambió el comportamiento de exposición automática de tablas en 2026. Grants
y RLS son capas distintas; el backend debe usar credenciales secretas solo en servidor y mínimo
privilegio. Aunque el MVP no tiene usuarios, RLS debe habilitarse si las tablas quedan expuestas.

**Alternatives considered**: Políticas públicas desde el navegador y desactivar controles fueron
descartados. Supabase Storage fue descartado por constitución.

## Duplicate identity

**Decision**: Índice global no único sobre `invoice_number_normalized`, normalizado con trim y
mayúsculas; conservar `invoice_number_raw`. Cada intento se inserta, incluso cuando el índice
permite encontrar una factura anterior con el mismo valor. El nuevo intento queda `REJECTED` y
guarda `duplicate_of_invoice_id` hacia la factura original.

**Rationale**: La auditoría requiere conservar el intento rechazado y su timeline. Una restricción
única impediría precisamente esa escritura; el índice mantiene rápida la consulta persistente sin
perder evidencia.

**Alternatives considered**: Coincidencia literal y clave compuesta proveedor+número fueron
rechazadas durante aclaración.

## OpenAI extraction integration

**Decision**: El adaptador server-only usa OpenAI mediante la Responses API y el SDK oficial
`openai`. Lee `OPENAI_API_KEY` exclusivamente en servidor y el modelo desde
`OPENAI_VISION_MODEL`, cuyo valor predeterminado es `gpt-5.4`. Para una imagen envía la imagen de la
factura; para un PDF rasteriza sus páginas como PNG con `pdfjs-dist` y `@napi-rs/canvas` y las envía
como entradas visuales. OpenAI devuelve únicamente número de factura, proveedor,
RUC/identificación tributaria, orden de compra y total. El adaptador valida esos cinco valores,
calcula `invalid_fields` y agrega `extraction_source` y `fallback_reason` antes de validar el objeto
enriquecido contra `contracts/extractor.schema.json`.

**Rationale**: Fija proveedor, interfaz, credencial, modelo, transformación de entrada y forma de
salida sin exponerlos al resto del flujo. Reglas y persistencia dependen solo del contrato existente
del extractor.

**Alternatives considered**: OCR local, otro proveedor y acceso directo desde el navegador fueron
descartados porque dejarían T009 con decisiones pendientes o expondrían la credencial.

## Extraction fallback

**Decision**: Un adaptador produce el mismo JSON tanto para extractor real como para fixture. El
fixture solo reemplaza la extracción cuando falla la llamada a OpenAI, nunca reglas, consultas ni
escrituras. El adaptador marca `extraction_source = FIXTURE_FALLBACK` y conserva un
`fallback_reason`; el orquestador registra `EXTRACTION_FALLBACK_USED` en `audit_logs` antes de
continuar por el motor y la persistencia reales. Un manifiesto de demo asocia el nombre exacto y
hash de cada archivo conocido con su fixture; si no existe coincidencia, el proceso reporta fallo de
extracción mediante HTTP `503`, código `EXTRACTION_UNAVAILABLE` y mensaje comprensible; nunca
inventa ni selecciona arbitrariamente otro fixture.

**Rationale**: Protege la demo sin fingir automatización empresarial ni bifurcar el flujo crítico.

**Alternatives considered**: Respuesta completa simulada fue descartada por constitución.

## State representation

**Decision**: Guardar `automatic_decision`, `human_decision` y justificación separadas; estado
efectivo = humano si existe, automático en otro caso.

**Rationale**: Mantiene explicación, auditoría y la última aclaración aprobada sin una quinta tabla.

**Alternatives considered**: Sobrescribir decisión o guardar acción solo en logs fueron rechazadas.

## Current Supabase references

- Changelog consultado: cambio 2026 sobre exposición automática de tablas a Data/GraphQL API.
- Documentación consultada: seguridad de Data API, claves de API y tablas/relaciones.
- Implicación: confirmar grants y RLS en el entorno real y mantener la clave secreta en backend.
