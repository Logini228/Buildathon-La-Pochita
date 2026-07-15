import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { createCanvas } from "@napi-rs/canvas";

const scenarios = [
  ["invoice-approved", "INV-OK-001", "1500.00"],
  ["invoice-mismatch", "INV-RISK-001", "2300.00"],
  ["invoice-duplicate", "INV-DUP-001", "1500.00"],
];

const manifest = [];
for (const [base, invoiceNumber, total] of scenarios) {
  const canvas = createCanvas(1200, 800);
  const context = canvas.getContext("2d");
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, 1200, 800);
  context.fillStyle = "#11231d";
  context.font = "bold 52px sans-serif";
  context.fillText("FACTURA", 80, 100);
  context.font = "30px sans-serif";
  const lines = [
    `Número: ${invoiceNumber}`,
    "Proveedor: Proveedor Demo S.A.",
    "RUC: 1790012345001",
    "Orden de compra: PO-DEMO-1500",
    `Total USD: ${total}`,
  ];
  lines.forEach((line, index) => context.fillText(line, 80, 220 + index * 90));
  const bytes = await canvas.encode("png");
  const filename = `${base}.png`;
  await writeFile(new URL(`../fixtures/${filename}`, import.meta.url), bytes);
  manifest.push({
    filename,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    extraction: {
      invoice_number: invoiceNumber,
      supplier_name: "Proveedor Demo S.A.",
      tax_id: "1790012345001",
      purchase_order_number: "PO-DEMO-1500",
      total: Number(total),
    },
  });
}
await writeFile(new URL("../fixtures/manifest.json", import.meta.url), `${JSON.stringify(manifest, null, 2)}\n`);
