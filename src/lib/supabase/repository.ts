import type { AuditEvent, Decision, ExtractedData } from "@/lib/contracts/types";
import { normalizeKey } from "@/lib/rules";
import { getServerSupabase, SupabaseRepositoryError } from "./server";
import type { SupabaseClient } from "@supabase/supabase-js";

export interface SupplierRow { id: string; tax_id: string; name: string }
export interface PurchaseOrderRow { id: string; po_number: string; supplier_id: string; authorized_amount: number }
export interface AuditWrite { event_type: string; status: "STARTED" | "PASSED" | "FAILED" | "COMPLETED"; details?: Record<string, unknown> }
export interface PersistAttempt {
  processingId: string;
  extracted: ExtractedData;
  supplierId: string | null;
  purchaseOrderId: string | null;
  duplicateOfInvoiceId: string | null;
  automaticDecision: Decision;
  reasons: string[];
  audit: AuditWrite[];
}

export interface InvoiceRow {
  id: string;
  processing_id: string;
  invoice_number_raw: string | null;
  supplier_name_extracted: string | null;
  tax_id_extracted: string | null;
  purchase_order_number: string | null;
  total: number | null;
  duplicate_of_invoice_id: string | null;
  missing_or_invalid_fields: string[];
  automatic_decision: Decision;
  automatic_reasons: string[];
  human_decision: "APPROVED" | "REJECTED" | null;
  human_justification: string | null;
}

const one = <T>(data: T | null): T | null => data ?? null;

export class InvoiceRepository {
  constructor(private readonly db: SupabaseClient = getServerSupabase()) {}

  async findSupplier(taxId: string | null): Promise<SupplierRow | null> {
    if (!taxId?.trim()) return null;
    const result = await this.db.from("suppliers").select("id,tax_id,name").eq("tax_id", normalizeKey(taxId)).maybeSingle();
    if (result.error) throw new SupabaseRepositoryError("QUERY", "Could not query supplier", result.error);
    return one(result.data as SupplierRow | null);
  }

  async findPurchaseOrder(poNumber: string | null): Promise<PurchaseOrderRow | null> {
    if (!poNumber?.trim()) return null;
    const result = await this.db.from("purchase_orders").select("id,po_number,supplier_id,authorized_amount").eq("po_number", normalizeKey(poNumber)).maybeSingle();
    if (result.error) throw new SupabaseRepositoryError("QUERY", "Could not query purchase order", result.error);
    const row = result.data as PurchaseOrderRow | null;
    return row ? { ...row, authorized_amount: Number(row.authorized_amount) } : null;
  }

  async findDuplicateRoot(invoiceNumber: string | null): Promise<string | null> {
    const normalized = normalizeKey(invoiceNumber);
    if (!normalized) return null;
    const result = await this.db.from("invoices")
      .select("id,duplicate_of_invoice_id,created_at")
      .eq("invoice_number_normalized", normalized)
      .order("created_at", { ascending: true }).limit(1).maybeSingle();
    if (result.error) throw new SupabaseRepositoryError("QUERY", "Could not query duplicate invoice", result.error);
    if (!result.data) return null;
    return (result.data.duplicate_of_invoice_id as string | null) ?? (result.data.id as string);
  }

  async persistAttempt(input: PersistAttempt): Promise<string> {
    const invoice = {
      processing_id: input.processingId,
      invoice_number_raw: input.extracted.invoice_number,
      invoice_number_normalized: normalizeKey(input.extracted.invoice_number),
      supplier_name_extracted: input.extracted.supplier_name,
      tax_id_extracted: normalizeKey(input.extracted.tax_id),
      purchase_order_number: normalizeKey(input.extracted.purchase_order_number),
      total: input.extracted.total,
      supplier_id: input.supplierId,
      purchase_order_id: input.purchaseOrderId,
      duplicate_of_invoice_id: input.duplicateOfInvoiceId,
      missing_or_invalid_fields: input.extracted.invalid_fields,
      automatic_decision: input.automaticDecision,
      automatic_reasons: input.reasons,
    };
    const inserted = await this.db.from("invoices").insert(invoice).select("id").single();
    if (inserted.error || !inserted.data) throw new SupabaseRepositoryError("WRITE", "Could not persist invoice attempt", inserted.error);
    const invoiceId = inserted.data.id as string;
    const logs = input.audit.concat({ event_type: "INVOICE_PERSISTED", status: "COMPLETED", details: { automatic_decision: input.automaticDecision } })
      .map(event => ({ processing_id: input.processingId, invoice_id: invoiceId, event_type: event.event_type, status: event.status, details: event.details ?? {} }));
    const audited = await this.db.from("audit_logs").insert(logs);
    if (audited.error) {
      const rollback = await this.db.from("invoices").delete().eq("id", invoiceId);
      const suffix = rollback.error ? "; compensation also failed" : "";
      throw new SupabaseRepositoryError("WRITE", `Could not persist audit timeline${suffix}`, audited.error);
    }
    return invoiceId;
  }

  async recordLastPossibleEvent(processingId: string, event: AuditWrite, invoiceId: string | null = null): Promise<boolean> {
    const result = await this.db.from("audit_logs").insert({ processing_id: processingId, invoice_id: invoiceId, event_type: event.event_type, status: event.status, details: event.details ?? {} });
    return !result.error;
  }

  async timeline(invoiceId: string): Promise<AuditEvent[]> {
    const result = await this.db.from("audit_logs").select("id,event_type,status,details,created_at").eq("invoice_id", invoiceId).order("created_at", { ascending: true }).order("id", { ascending: true });
    if (result.error) throw new SupabaseRepositoryError("QUERY", "Could not query audit timeline", result.error);
    return (result.data ?? []) as AuditEvent[];
  }

  async getInvoice(invoiceId: string): Promise<InvoiceRow | null> {
    const result = await this.db.from("invoices").select("id,processing_id,invoice_number_raw,supplier_name_extracted,tax_id_extracted,purchase_order_number,total,duplicate_of_invoice_id,missing_or_invalid_fields,automatic_decision,automatic_reasons,human_decision,human_justification").eq("id", invoiceId).maybeSingle();
    if (result.error) throw new SupabaseRepositoryError("QUERY", "Could not query invoice", result.error);
    if (!result.data) return null;
    return { ...result.data, total: result.data.total === null ? null : Number(result.data.total) } as InvoiceRow;
  }

  async updateAfterCorrection(input: {
    invoiceId: string;
    extracted: ExtractedData;
    supplierId: string | null;
    purchaseOrderId: string | null;
    duplicateOfInvoiceId: string | null;
    automaticDecision: Decision;
    reasons: string[];
    justification: string;
    validations: unknown[];
    before: Record<string, unknown>;
  }): Promise<void> {
    const current = await this.getInvoice(input.invoiceId);
    if (!current) throw new SupabaseRepositoryError("NOT_FOUND", "Invoice not found");
    const update = {
      invoice_number_raw: input.extracted.invoice_number,
      invoice_number_normalized: normalizeKey(input.extracted.invoice_number),
      supplier_name_extracted: input.extracted.supplier_name,
      tax_id_extracted: normalizeKey(input.extracted.tax_id),
      purchase_order_number: normalizeKey(input.extracted.purchase_order_number),
      total: input.extracted.total,
      supplier_id: input.supplierId,
      purchase_order_id: input.purchaseOrderId,
      duplicate_of_invoice_id: input.duplicateOfInvoiceId,
      missing_or_invalid_fields: input.extracted.invalid_fields,
      automatic_decision: input.automaticDecision,
      automatic_reasons: input.reasons,
      human_decision: null,
      human_justification: null,
      human_decided_at: null,
      updated_at: new Date().toISOString(),
    };
    const changed = await this.db.from("invoices").update(update).eq("id", input.invoiceId);
    if (changed.error) throw new SupabaseRepositoryError("WRITE", "Could not update corrected invoice", changed.error);
    const events = [
      { processing_id: current.processing_id, invoice_id: input.invoiceId, event_type: "FIELDS_CORRECTED", status: "COMPLETED", details: { before: input.before, after: input.extracted, justification: input.justification } },
      { processing_id: current.processing_id, invoice_id: input.invoiceId, event_type: "RULES_EVALUATED", status: "COMPLETED", details: { decision: input.automaticDecision, validations: input.validations, reasons: input.reasons } },
    ];
    const logged = await this.db.from("audit_logs").insert(events);
    if (logged.error) throw new SupabaseRepositoryError("WRITE", "Could not audit corrected invoice", logged.error);
  }

  async recordHumanDecision(invoiceId: string, decision: "APPROVED" | "REJECTED", justification: string): Promise<void> {
    const clean = justification.trim();
    if (!clean) throw new SupabaseRepositoryError("CONFLICT", "Human justification is required");
    const current = await this.db.from("invoices").select("processing_id,automatic_decision,human_decision").eq("id", invoiceId).maybeSingle();
    if (current.error) throw new SupabaseRepositoryError("QUERY", "Could not query invoice", current.error);
    if (!current.data) throw new SupabaseRepositoryError("NOT_FOUND", "Invoice not found");
    if (current.data.automatic_decision !== "NEEDS_REVIEW_HIGH_RISK" || current.data.human_decision) {
      throw new SupabaseRepositoryError("CONFLICT", "Invoice cannot be resolved again");
    }
    const decidedAt = new Date().toISOString();
    const updated = await this.db.from("invoices").update({ human_decision: decision, human_justification: clean, human_decided_at: decidedAt, updated_at: decidedAt })
      .eq("id", invoiceId).is("human_decision", null).select("id").maybeSingle();
    if (updated.error) throw new SupabaseRepositoryError("WRITE", "Could not persist human decision", updated.error);
    if (!updated.data) throw new SupabaseRepositoryError("CONFLICT", "Invoice was already resolved");
    const audit = await this.db.from("audit_logs").insert({
      processing_id: current.data.processing_id, invoice_id: invoiceId, event_type: "HUMAN_DECISION_RECORDED", status: "COMPLETED",
      details: { decision, justification: clean },
    });
    if (audit.error) {
      await this.db.from("invoices").update({ human_decision: null, human_justification: null, human_decided_at: null, updated_at: new Date().toISOString() }).eq("id", invoiceId);
      throw new SupabaseRepositoryError("WRITE", "Could not audit human decision", audit.error);
    }
  }
}
