import type { Decision, ExtractedData, ValidationResult } from "@/lib/contracts/types";

export interface RuleContext {
  extracted: ExtractedData;
  supplier: { id: string } | null;
  purchaseOrder: { id: string; supplier_id: string; authorized_amount: number } | null;
  duplicateRootId: string | null;
}

export interface RuleOutcome {
  decision: Decision;
  reasons: string[];
  validations: ValidationResult[];
  duplicateOfInvoiceId: string | null;
}

export function normalizeKey(value: string | null): string | null {
  const normalized = value?.trim().toUpperCase();
  return normalized || null;
}

export function evaluateInvoice(context: RuleContext): RuleOutcome {
  const validations: ValidationResult[] = [];
  const reasons: string[] = [];
  const add = (code: string, passed: boolean, message: string) => {
    validations.push({ code, status: passed ? "PASSED" : "FAILED", message });
    if (!passed) reasons.push(code);
  };

  if (context.duplicateRootId) {
    add("DUPLICATE_INVOICE", false, "El número de factura ya fue procesado.");
    return { decision: "REJECTED", reasons, validations, duplicateOfInvoiceId: context.duplicateRootId };
  }

  add("EXTRACTION_COMPLETE", context.extracted.invalid_fields.length === 0, "Los cinco campos son obligatorios.");
  add("SUPPLIER_EXISTS", Boolean(context.supplier), "El proveedor debe existir por RUC.");
  add("PURCHASE_ORDER_EXISTS", Boolean(context.purchaseOrder), "La orden de compra debe existir.");

  if (context.purchaseOrder && context.supplier) {
    add("SUPPLIER_MATCHES_ORDER", context.purchaseOrder.supplier_id === context.supplier.id, "El proveedor debe coincidir con la orden.");
  }
  if (context.purchaseOrder && context.extracted.total !== null) {
    add("AMOUNT_MATCHES", context.extracted.total === context.purchaseOrder.authorized_amount, "El total debe coincidir con el monto autorizado.");
  }

  return {
    decision: reasons.length ? "NEEDS_REVIEW_HIGH_RISK" : "APPROVED",
    reasons,
    validations,
    duplicateOfInvoiceId: null,
  };
}
