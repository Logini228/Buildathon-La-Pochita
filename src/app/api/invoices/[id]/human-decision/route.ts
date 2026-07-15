import { NextResponse } from "next/server";
import { getPersistedResult } from "@/lib/invoice-processing";
import { InvoiceRepository, SupabaseRepositoryError } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const body = await request.json() as { decision?: string; justification?: string };
    if (!(["APPROVED", "REJECTED"] as string[]).includes(body.decision ?? "") || !body.justification?.trim()) {
      return NextResponse.json({ code: "INVALID_HUMAN_DECISION", message: "Selecciona una decisión e ingresa una justificación." }, { status: 422 });
    }
    const repository = new InvoiceRepository();
    await repository.recordHumanDecision(id, body.decision as "APPROVED" | "REJECTED", body.justification);
    return NextResponse.json(await getPersistedResult(id, repository));
  } catch (error) {
    if (error instanceof SupabaseRepositoryError) {
      const status = error.kind === "CONFLICT" ? 409 : error.kind === "NOT_FOUND" ? 404 : 503;
      return NextResponse.json({ code: error.kind, message: error.message }, { status });
    }
    return NextResponse.json({ code: "HUMAN_DECISION_FAILED", message: "No fue posible guardar la decisión humana." }, { status: 500 });
  }
}
