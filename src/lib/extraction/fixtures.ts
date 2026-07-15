import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { ExtractedData } from "@/lib/contracts/types";
import { normalizeExtractedData } from "@/lib/contracts/validation";

interface ManifestEntry {
  filename: string;
  sha256: string;
  extraction: Omit<ExtractedData, "invalid_fields" | "extraction_source" | "fallback_reason">;
}

export async function fixtureFallback(filename: string, bytes: Buffer, reason: string): Promise<ExtractedData | null> {
  const manifestPath = path.join(process.cwd(), "fixtures", "manifest.json");
  const entries = JSON.parse(await readFile(manifestPath, "utf8")) as ManifestEntry[];
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const entry = entries.find((candidate) => candidate.filename === filename && candidate.sha256 === sha256);
  if (!entry) return null;
  return normalizeExtractedData({
    ...entry.extraction,
    extraction_source: "FIXTURE_FALLBACK",
    fallback_reason: reason,
  });
}
