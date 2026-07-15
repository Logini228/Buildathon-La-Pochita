import { describe, expect, it } from "vitest";
import { ExtractionUnavailableError } from "@/lib/extraction";

describe("extraction errors", () => {
  it("exposes the stable unavailable code", () => {
    expect(new ExtractionUnavailableError("x").code).toBe("EXTRACTION_UNAVAILABLE");
  });
});
