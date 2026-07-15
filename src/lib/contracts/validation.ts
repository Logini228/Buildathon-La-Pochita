import type { ExtractedData, FieldName } from "./types";

const stringFields = ["invoice_number", "supplier_name", "tax_id", "purchase_order_number"] as const;

export function normalizeExtractedData(input: Omit<ExtractedData, "invalid_fields">): ExtractedData {
  const normalized = { ...input } as ExtractedData;
  const invalid: FieldName[] = [];
  for (const key of stringFields) {
    const value = input[key];
    normalized[key] = typeof value === "string" ? value.trim() || null : null;
    if (!normalized[key]) invalid.push(key);
  }
  if (typeof input.total !== "number" || !Number.isFinite(input.total) || input.total < 0) {
    normalized.total = null;
    invalid.push("total");
  }
  normalized.invalid_fields = invalid;
  return normalized;
}
