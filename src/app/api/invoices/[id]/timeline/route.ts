import { NextResponse } from "next/server";
import { InvoiceRepository, SupabaseRepositoryError } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    return NextResponse.json(await new InvoiceRepository().timeline(id));
  } catch (error) {
    if (error instanceof SupabaseRepositoryError) return NextResponse.json({ code: "PERSISTENCE_UNAVAILABLE", message: "No fue posible consultar el timeline." }, { status: 503 });
    return NextResponse.json({ code: "READ_FAILED", message: "No fue posible consultar el timeline." }, { status: 500 });
  }
}
