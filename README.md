# InvoiceGuard AI

MVP de procesamiento auditable de facturas con Next.js, OpenAI y Supabase.

## Configuración

1. Copia `.env.example` a `.env.local`.
2. Configura `OPENAI_API_KEY`, `SUPABASE_URL` y `SUPABASE_SECRET_KEY`.
3. Ejecuta `corepack pnpm install --frozen-lockfile`.
4. Aplica `supabase/migrations/001_invoiceguard.sql` al proyecto Supabase.
5. Ejecuta `corepack pnpm demo:seed`.
6. Inicia con `corepack pnpm dev`.

## Verificación

- `corepack pnpm test`
- `corepack pnpm build`
