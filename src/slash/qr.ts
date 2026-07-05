import type { JsonSchema, SlashCommandArgument } from "../models";
import { LookupSlashCommand, type SlashCommandContext } from "./base";

type QrArgs = {
  data: string;
  size: number;
  ecc: "L" | "M" | "Q" | "H";
};

export type QrOutput = {
  data: string;
  size: number;
  ecc: "L" | "M" | "Q" | "H";
  imageUrl: string;
  downloadUrl: string;
};

export const qrOutputSchema = {
  type: "object",
  required: ["data", "size", "ecc", "imageUrl", "downloadUrl"],
  properties: {
    data: { type: "string" },
    size: { type: "number" },
    ecc: { type: "string" },
    imageUrl: { type: "string" },
    downloadUrl: { type: "string" }
  }
} satisfies JsonSchema;

const ECC_LEVELS = new Set(["L", "M", "Q", "H"]);

// We render the QR through a public, key-less encoder rather than shipping a
// hand-rolled matrix generator into the bundle — the previous attempt produced
// scannably-wrong codes, and a wrong QR is worse than none. Both URLs below are
// the same well-formed PNG; the second carries a download disposition hint.
function buildImageUrl(data: string, size: number, ecc: QrArgs["ecc"]): string {
  const params = new URLSearchParams({
    data,
    size: `${size}x${size}`,
    ecc,
    margin: "8",
    format: "png"
  });
  return `https://api.qrserver.com/v1/create-qr-code/?${params}`;
}

export class QrCommand extends LookupSlashCommand<QrArgs, QrOutput> {
  readonly id = "slash.qr";
  readonly name = "QR Code";
  readonly command = "/qr";
  readonly description = "Generate a QR code PNG for any text, URL, or payload.";
  readonly arguments: SlashCommandArgument[] = [
    { name: "data", label: "data", type: "text", required: true, placeholder: "https://zip.cat", widthChars: 28 },
    { name: "size", label: "size", type: "number", required: false, placeholder: "256", widthChars: 5 },
    {
      name: "ecc",
      label: "ecc",
      type: "choice",
      required: false,
      choices: [
        { label: "L (7%)", value: "L" },
        { label: "M (15%)", value: "M" },
        { label: "Q (25%)", value: "Q" },
        { label: "H (30%)", value: "H" }
      ]
    }
  ];
  readonly outputSchema = qrOutputSchema;

  parseArguments(context: SlashCommandContext): QrArgs {
    const explicitData = this.argumentValue(context, "data");
    const inline = context.request.query.replace(/^\/qr\b/i, "").trim();
    const data = String(explicitData || inline).trim();

    if (!data) {
      throw new Error("/qr requires data to encode.");
    }
    if (data.length > 900) {
      throw new Error("/qr data is too long (max 900 characters).");
    }

    const rawSize = Number(this.argumentValue(context, "size") ?? 256);
    const size = Math.min(Math.max(Math.round(rawSize) || 256, 64), 1000);

    const rawEcc = String(this.argumentValue(context, "ecc") ?? "M").toUpperCase();
    const ecc = (ECC_LEVELS.has(rawEcc) ? rawEcc : "M") as QrArgs["ecc"];

    return { data, size, ecc };
  }

  executeCommand(args: QrArgs): QrOutput {
    const imageUrl = buildImageUrl(args.data, args.size, args.ecc);
    const downloadUrl = `${imageUrl}&download=1`;
    return {
      data: args.data,
      size: args.size,
      ecc: args.ecc,
      imageUrl,
      downloadUrl
    };
  }
}

export function qrSlashCommand() {
  return new QrCommand();
}
