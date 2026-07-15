import OpenAI from "openai";
import type { ExtractedData } from "@/lib/contracts/types";
import { normalizeExtractedData } from "@/lib/contracts/validation";
import { fixtureFallback } from "./fixtures";
import { pdfPagesToPng } from "./pdf";
import { recognizeWithOcrSpace } from "@/lib/ocr-space";

const extractionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["invoice_number", "supplier_name", "tax_id", "purchase_order_number", "total"],
  properties: {
    invoice_number: { type: ["string", "null"] },
    supplier_name: { type: ["string", "null"] },
    tax_id: { type: ["string", "null"] },
    purchase_order_number: { type: ["string", "null"] },
    total: { type: ["number", "null"] },
  },
} as const;

type ModelExtraction = Pick<ExtractedData, "invoice_number" | "supplier_name" | "tax_id" | "purchase_order_number" | "total">;

export class ExtractionUnavailableError extends Error {
  readonly code = "EXTRACTION_UNAVAILABLE";
}

function toDataUrl(bytes: Buffer, mime: string): string {
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function openAIClient(): Promise<OpenAI> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OPENAI_API_KEY no está configurada");
  return new OpenAI({ apiKey });
}

async function extractWithOpenAI(bytes: Buffer, mime: string): Promise<ExtractedData> {
  const client = await openAIClient();
  const images = mime === "application/pdf" ? await pdfPagesToPng(bytes) : [bytes];
  const content: Array<Record<string, unknown>> = [{
    type: "input_text",
    text: "Extrae exactamente número de factura, proveedor, RUC o identificación tributaria, orden de compra y total. Usa null si un campo no está visible.",
  }];
  for (const image of images) {
    content.push({ type: "input_image", image_url: toDataUrl(image, mime === "application/pdf" ? "image/png" : mime), detail: "high" });
  }
  const response = await client.responses.create({
    model: process.env.OPENAI_VISION_MODEL || "gpt-5.4",
    input: [{ role: "user", content: content as never }],
    text: { format: { type: "json_schema", name: "invoice_extraction", strict: true, schema: extractionSchema } },
  });
  const parsed = JSON.parse(response.output_text) as ModelExtraction;
  return normalizeExtractedData({ ...parsed, extraction_source: "OPENAI", fallback_reason: null });
}

async function structureOcrTextWithOpenAI(text: string, visionFailure: string): Promise<ExtractedData> {
  const client = await openAIClient();
  const response = await client.responses.create({
    model: process.env.OPENAI_VISION_MODEL || "gpt-5.4",
    input: [{
      role: "user",
      content: [{
        type: "input_text",
        text: `Extrae exactamente número de factura, proveedor, RUC o identificación tributaria, orden de compra y total del siguiente texto OCR. Usa null si un campo no aparece.\n\n${text}`,
      }],
    }],
    text: { format: { type: "json_schema", name: "invoice_extraction", strict: true, schema: extractionSchema } },
  });
  const parsed = JSON.parse(response.output_text) as ModelExtraction;
  return normalizeExtractedData({
    ...parsed,
    extraction_source: "OCR_SPACE_OPENAI",
    fallback_reason: visionFailure,
  });
}

interface ExtractionDependencies {
  vision: typeof extractWithOpenAI;
  ocr: typeof recognizeWithOcrSpace;
  structureOcrText: typeof structureOcrTextWithOpenAI;
  fixture: typeof fixtureFallback;
}

const defaultDependencies: ExtractionDependencies = {
  vision: extractWithOpenAI,
  ocr: recognizeWithOcrSpace,
  structureOcrText: structureOcrTextWithOpenAI,
  fixture: fixtureFallback,
};

export async function extractInvoice(
  file: { name: string; type: string; bytes: Buffer },
  dependencies: ExtractionDependencies = defaultDependencies,
): Promise<ExtractedData> {
  try {
    return await dependencies.vision(file.bytes, file.type);
  } catch (visionError) {
    const visionReason = visionError instanceof Error ? visionError.message : "Fallo desconocido de OpenAI Vision";
    try {
      const ocr = await dependencies.ocr(file);
      return await dependencies.structureOcrText(ocr.text, visionReason);
    } catch (ocrError) {
      const ocrReason = ocrError instanceof Error ? ocrError.message : "Fallo desconocido del fallback OCR";
      const reason = `OpenAI Vision: ${visionReason}; OCR fallback: ${ocrReason}`;
      const fallback = await dependencies.fixture(file.name, file.bytes, reason).catch(() => null);
      if (fallback) return fallback;
      throw new ExtractionUnavailableError("No fue posible extraer la factura con OpenAI Vision ni con OCR.space.");
    }
  }
}
