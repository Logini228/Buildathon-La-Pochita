import { describe, expect, it, vi } from "vitest";
import { ExtractionUnavailableError, extractInvoice } from "@/lib/extraction";
import type { ExtractedData } from "@/lib/contracts/types";

const file = { name: "invoice.png", type: "image/png", bytes: Buffer.from("image") };
const visionResult: ExtractedData = {
  invoice_number: "INV-1", supplier_name: "Supplier", tax_id: "123", purchase_order_number: "PO-1",
  total: 10, invalid_fields: [], extraction_source: "OPENAI", fallback_reason: null,
};
const ocrResult: ExtractedData = {
  ...visionResult, extraction_source: "OCR_SPACE_OPENAI", fallback_reason: "vision failed",
};

describe("extraction errors", () => {
  it("exposes the stable unavailable code", () => {
    expect(new ExtractionUnavailableError("x").code).toBe("EXTRACTION_UNAVAILABLE");
  });

  it("does not call OCR when vision extraction succeeds", async () => {
    const ocr = vi.fn().mockRejectedValue(new Error("should not run"));
    const result = await extractInvoice(file, {
      vision: vi.fn().mockResolvedValue(visionResult),
      ocr,
      structureOcrText: vi.fn(),
      fixture: vi.fn(),
    });

    expect(result).toBe(visionResult);
    expect(ocr).not.toHaveBeenCalled();
  });

  it("uses OCR and the LLM text parser after vision extraction fails", async () => {
    const ocr = vi.fn().mockResolvedValue({ text: "recognized invoice", pages: ["recognized invoice"], processingTimeMilliseconds: 1 });
    const structureOcrText = vi.fn().mockResolvedValue(ocrResult);
    const fixture = vi.fn();

    const result = await extractInvoice(file, {
      vision: vi.fn().mockRejectedValue(new Error("vision failed")),
      ocr,
      structureOcrText,
      fixture,
    });

    expect(result).toBe(ocrResult);
    expect(ocr).toHaveBeenCalledWith(file);
    expect(structureOcrText).toHaveBeenCalledWith("recognized invoice", "vision failed");
    expect(fixture).not.toHaveBeenCalled();
  });

  it("uses the fixture only after vision and OCR fallback both fail", async () => {
    const fixtureResult = { ...visionResult, extraction_source: "FIXTURE_FALLBACK" as const, fallback_reason: "failures" };
    const fixture = vi.fn().mockResolvedValue(fixtureResult);

    const result = await extractInvoice(file, {
      vision: vi.fn().mockRejectedValue(new Error("vision failed")),
      ocr: vi.fn().mockRejectedValue(new Error("OCR failed")),
      structureOcrText: vi.fn(),
      fixture,
    });

    expect(result).toBe(fixtureResult);
    expect(fixture).toHaveBeenCalledWith("invoice.png", file.bytes, expect.stringContaining("OCR fallback: OCR failed"));
  });
});
