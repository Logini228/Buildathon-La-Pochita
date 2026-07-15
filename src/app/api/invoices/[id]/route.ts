import { NextResponse } from "next/server";
import { getPersistedResult } from "@/lib/invoice-processing";
import { SupabaseRepositoryError } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const result = await getPersistedResult(id);
    return result ? NextResponse.json(result) : NextResponse.json({ code: "NOT_FOUND", message: "Factura no encontrada." }, { status: 404 });
  } catch (error) {
    if (error instanceof SupabaseRepositoryError) return NextResponse.json({ code: "PERSISTENCE_UNAVAILABLE", message: "No fue posible consultar la factura." }, { status: 503 });
    return NextResponse.json({ code: "READ_FAILED", message: "No fue posible consultar la factura." }, { status: 500 });
  }
}
