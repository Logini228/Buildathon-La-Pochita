import { describe, expect, it } from "vitest";
import { normalizeExtractedData } from "@/lib/contracts/validation";

describe("extraction contract", () => {
  it("trims strings and rejects whitespace-only values", () => {
    const result = normalizeExtractedData({
      invoice_number: " INV-1 ", supplier_name: "   ", tax_id: " 179001 ",
      purchase_order_number: " PO-1 ", total: 1500,
      extraction_source: "OPENAI", fallback_reason: null,
    });
    expect(result.invoice_number).toBe("INV-1");
    expect(result.supplier_name).toBeNull();
    expect(result.invalid_fields).toEqual(["supplier_name"]);
  });
});
