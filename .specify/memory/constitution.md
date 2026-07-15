<!--
Sync Impact Report
- Version change: template (unratified) -> 1.0.0
- Modified principles:
  - Placeholder Principle 1 -> I. Un flujo vertical completo primero
  - Placeholder Principle 2 -> II. Supabase es parte esencial del MVP
  - Placeholder Principle 3 -> III. IA para extracción; reglas para decisión
  - Placeholder Principle 4 -> IV. Trazabilidad y decisión humana persistentes
  - Placeholder Principle 5 -> V. Simplicidad orientada a una demo reproducible
- Added sections:
  - Restricciones técnicas y de alcance
  - Flujo de trabajo y puerta de demo
  - Elementos eliminados para la Buildathon
- Removed sections: ninguna; se reemplazaron las secciones de plantilla.
- Templates requiring updates:
  - ✅ updated: .specify/templates/plan-template.md
  - ✅ updated: .specify/templates/spec-template.md
  - ✅ updated: .specify/templates/tasks-template.md
- Runtime guidance reviewed:
  - ✅ README.md (sin orientación técnica adicional que sincronizar)
  - ✅ .agents/skills/speckit-*/SKILL.md (sin referencias constitucionales obsoletas)
- Follow-up TODOs: ninguno.
-->
# InvoiceGuard AI Constitution

## Core Principles

### I. Un flujo vertical completo primero
El equipo DEBE entregar antes que cualquier módulo secundario un único recorrido de extremo a
extremo: recibir una imagen o PDF de factura; extraer número de factura, proveedor,
identificación tributaria, orden de compra y total; consultar proveedor y orden de compra;
detectar duplicados; comparar montos; ejecutar reglas; persistir factura, decisión y auditoría;
y mostrar decisión y timeline. Un componente parcial que no contribuya directamente a este
recorrido NO DEBE desplazar trabajo del flujo completo. La razón es que la automatización real,
no la cantidad de pantallas o módulos, constituye el valor demostrable del MVP.

### II. Supabase es parte esencial del MVP
Supabase DEBE representar el sistema empresarial persistente. El producto DEBE usar exactamente
cuatro tablas principales: `suppliers`, `purchase_orders`, `invoices` y `audit_logs`.
Proveedores y órdenes de compra PUEDEN cargarse mediante seed, pero sus consultas, la detección
de duplicados, el guardado de facturas, las decisiones y el timeline DEBEN operar contra datos
reales persistidos. Los fixtures NO DEBEN simular ni sustituir escrituras en Supabase. Esta regla
garantiza que la demo pruebe integración y trazabilidad empresarial auténticas.

### III. IA para extracción; reglas para decisión
La IA DEBE limitarse a extraer información estructurada desde al menos una imagen o PDF y su
salida DEBE validarse antes de entrar al motor de reglas. Las decisiones críticas DEBEN proceder
de reglas deterministas y explicables, incluyendo como mínimo proveedor existente, orden de
compra existente, duplicado por número de factura y comparación entre monto facturado y monto
autorizado. Ninguna salida probabilística DEBE aprobar o rechazar directamente una factura. Así,
la automatización conserva control, repetibilidad y explicación verificable.

### IV. Trazabilidad y decisión humana persistentes
Cada validación importante y cada transición del flujo DEBE crear un registro en `audit_logs`.
La factura y su decisión automática DEBEN guardarse en `invoices`. Cuando exista riesgo, la
interfaz DEBE permitir aprobación excepcional o rechazo humano; esa decisión y una justificación
obligatoria DEBEN persistirse y aparecer en el timeline. No se considera completado un paso si
solo existe en memoria o en la interfaz. La trazabilidad completa permite reconstruir qué ocurrió,
por qué ocurrió y quién resolvió una excepción.

### V. Simplicidad orientada a una demo reproducible
Toda decisión de diseño DEBE optimizar la entrega por tres personas en cuatro horas. No se DEBEN
agregar abstracciones, infraestructura o pulido sin una necesidad inmediata del MVP. DEBE existir
un fixture de respaldo para los archivos de demostración, pero DEBE atravesar el mismo extractor
o adaptador de extracción, motor de reglas y persistencia real que una carga normal. La demo
funcional, repetible y verificable tiene prioridad sobre escalabilidad y perfeccionamiento visual.

## Restricciones técnicas y de alcance

- La aplicación DEBE aceptar imágenes y PDF conforme a las capacidades que se implementen y
  verifiquen en el repositorio. Al ratificarse esta constitución no existe todavía código de
  aplicación ni capacidad de ingesta preexistente; el plan DEBE seleccionar la vía más corta que
  soporte al menos un archivo real de factura.
- Las entidades principales DEBEN permanecer limitadas a `suppliers`, `purchase_orders`,
  `invoices` y `audit_logs`; datos de decisión humana y justificación DEBEN integrarse en estas
  tablas, no crear una quinta tabla principal.
- No se DEBE implementar autenticación ni roles avanzados. Proveedores y órdenes DEBEN
  administrarse con seed; no se DEBEN crear pantallas CRUD para ellos.
- Supabase Storage NO DEBE utilizarse salvo que aparezca ya implementado antes de la planificación
  y su uso no incremente significativamente el trabajo. La persistencia relacional en Supabase
  sigue siendo obligatoria aunque el archivo se procese sin Storage.
- La extracción estructurada DEBE distinguir datos ausentes o inválidos; el motor de reglas NO
  DEBE interpretar silenciosamente valores incompletos como válidos.
- Las verificaciones disponibles del proyecto DEBEN ejecutarse antes de declarar lista la demo.
  Si el repositorio aún no ofrece verificaciones automatizadas, el plan DEBE definir una prueba
  reproducible del flujo y de las consultas/escrituras reales, sin crear una suite desproporcionada.

## Flujo de trabajo y puerta de demo

El plan y las tareas DEBEN organizar el trabajo para tres personas en paralelo, con propiedad de
archivos explícita y puntos de integración tempranos. La división recomendada es: (1) Supabase,
seed y persistencia; (2) ingesta, extracción validada y reglas; (3) frontend, decisión humana y
timeline. Las dependencias compartidas DEBEN resolverse al inicio y el equipo DEBE integrar el
flujo vertical antes de añadir mejoras.

La demo solo se considera lista cuando una ejecución reproducible demuestra todos estos casos:

1. Una factura válida resulta aprobada.
2. Una factura con monto inconsistente resulta escalada y admite resolución humana justificada.
3. Una factura duplicada resulta rechazada mediante consulta de datos persistidos.
4. Los tres casos realizan consultas y escrituras reales en Supabase.
5. El frontend muestra el timeline recuperado de `audit_logs` para la factura procesada.

Cada spec, plan y lista de tareas DEBE mantener estos escenarios como criterios de aceptación y
asignar tiempo explícito para preparar seeds, fixtures y ensayo de la demo.

### Elementos eliminados para la Buildathon

Para garantizar una implementación viable en cuatro horas quedan explícitamente eliminados del
alcance: ERP e integraciones ERP, correos, colas, procesamiento masivo, cálculo o validación de
impuestos, múltiples monedas, líneas detalladas de productos, autenticación, roles avanzados,
CRUD de proveedores, CRUD de órdenes de compra, una quinta tabla principal, Supabase Storage no
preexistente, escalabilidad anticipada, abstracciones sin uso inmediato y perfeccionamiento visual
que no sea necesario para entender la decisión y el timeline.

## Governance

Esta constitución prevalece sobre specs, planes, tareas y decisiones de implementación. Toda
planificación y revisión DEBE comprobar sus reglas antes de iniciar trabajo y nuevamente antes de
la demo. Una excepción requiere acuerdo explícito de los tres integrantes, justificación escrita,
impacto sobre la demo y una enmienda a este documento; la presión de tiempo por sí sola no permite
omitir persistencia, auditoría ni los tres escenarios obligatorios.

Las enmiendas usan versionado semántico: MAJOR para eliminar o redefinir de forma incompatible un
principio; MINOR para añadir principios, secciones o obligaciones materiales; PATCH para aclarar
sin cambiar obligaciones. Cada enmienda DEBE actualizar el Sync Impact Report, la fecha, las
plantillas dependientes y cualquier artefacto afectado. La revisión final DEBE confirmar ausencia
de alcance eliminado, cumplimiento del flujo vertical y evidencia de las verificaciones ejecutadas.

**Version**: 1.0.0 | **Ratified**: 2026-07-15 | **Last Amended**: 2026-07-15
