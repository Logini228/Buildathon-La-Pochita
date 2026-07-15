import { describe, expect, it, vi } from "vitest";
import { InvoiceRepository, SupabaseRepositoryError } from "@/lib/supabase";
import type { ExtractedData } from "@/lib/contracts/types";
import type { SupabaseClient } from "@supabase/supabase-js";

const extracted: ExtractedData = {
  invoice_number: "INV-1", supplier_name: "Proveedor Demo S.A.", tax_id: "1790012345001",
  purchase_order_number: "PO-DEMO-1500", total: 1500, invalid_fields: [],
  extraction_source: "OPENAI", fallback_reason: null,
};

describe("Supabase repository failures", () => {
  it("turns a supplier query failure into an explicit technical error", async () => {
    const db = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: { message: "offline" } }) }) }) }) } as unknown as SupabaseClient;
    const repository = new InvoiceRepository(db);
    await expect(repository.findSupplier("1790012345001")).rejects.toMatchObject({ kind: "QUERY", status: 503 });
  });

  it("does not attempt audit when the invoice write fails", async () => {
    const auditInsert = vi.fn();
    const db = { from: (table: string) => table === "invoices"
      ? ({ insert: () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "write failed" } }) }) }) })
      : ({ insert: auditInsert }) } as unknown as SupabaseClient;
    const repository = new InvoiceRepository(db);
    await expect(repository.persistAttempt({ processingId: crypto.randomUUID(), extracted, supplierId: null, purchaseOrderId: null, duplicateOfInvoiceId: null, automaticDecision: "APPROVED", reasons: [], audit: [] }))
      .rejects.toBeInstanceOf(SupabaseRepositoryError);
    expect(auditInsert).not.toHaveBeenCalled();
  });

  it("compensates the invoice row when timeline persistence fails", async () => {
    const deleteEq = vi.fn(async () => ({ error: null }));
    const db = { from: (table: string) => table === "invoices"
      ? ({
          insert: () => ({ select: () => ({ single: async () => ({ data: { id: "invoice-id" }, error: null }) }) }),
          delete: () => ({ eq: deleteEq }),
        })
      : ({ insert: async () => ({ error: { message: "audit failed" } }) }) } as unknown as SupabaseClient;
    const repository = new InvoiceRepository(db);
    await expect(repository.persistAttempt({ processingId: crypto.randomUUID(), extracted, supplierId: null, purchaseOrderId: null, duplicateOfInvoiceId: null, automaticDecision: "APPROVED", reasons: [], audit: [] }))
      .rejects.toMatchObject({ kind: "WRITE", status: 503 });
    expect(deleteEq).toHaveBeenCalledWith("id", "invoice-id");
  });
});
