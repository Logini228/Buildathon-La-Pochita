import { describe, expect, it } from "vitest";
import { evaluateInvoice } from "@/lib/rules";
import type { ExtractedData } from "@/lib/contracts/types";

const extracted = (overrides: Partial<ExtractedData> = {}): ExtractedData => ({
  invoice_number: "INV-OK-001", supplier_name: "Proveedor Demo S.A.", tax_id: "1790012345001",
  purchase_order_number: "PO-DEMO-1500", total: 1500, invalid_fields: [],
  extraction_source: "OPENAI", fallback_reason: null, ...overrides,
});
const supplier = { id: "supplier-1" };
const order = { id: "po-1", supplier_id: "supplier-1", authorized_amount: 1500 };

describe("deterministic invoice rules", () => {
  it("approves only a complete matching invoice", () => {
    expect(evaluateInvoice({ extracted: extracted(), supplier, purchaseOrder: order, duplicateRootId: null }).decision).toBe("APPROVED");
  });

  it("escalates an amount mismatch and accumulates its reason", () => {
    const result = evaluateInvoice({ extracted: extracted({ total: 2300 }), supplier, purchaseOrder: order, duplicateRootId: null });
    expect(result.decision).toBe("NEEDS_REVIEW_HIGH_RISK");
    expect(result.reasons).toContain("AMOUNT_MATCHES");
  });

  it("gives duplicate rejection precedence and keeps the root reference", () => {
    const result = evaluateInvoice({ extracted: extracted({ total: 2300 }), supplier: null, purchaseOrder: null, duplicateRootId: "root-id" });
    expect(result).toMatchObject({ decision: "REJECTED", duplicateOfInvoiceId: "root-id", reasons: ["DUPLICATE_INVOICE"] });
  });

  it("escalates missing supplier, order, and incomplete extraction", () => {
    const result = evaluateInvoice({ extracted: extracted({ supplier_name: null, invalid_fields: ["supplier_name"] }), supplier: null, purchaseOrder: null, duplicateRootId: null });
    expect(result.decision).toBe("NEEDS_REVIEW_HIGH_RISK");
    expect(result.reasons).toEqual(expect.arrayContaining(["EXTRACTION_COMPLETE", "SUPPLIER_EXISTS", "PURCHASE_ORDER_EXISTS"]));
  });
});

