import "server-only";
import { readFileSync } from "node:fs";
import path from "node:path";
import { jpegImage, type PdfImage } from "./writer";

let logo: PdfImage | null = null;

/** The AM Traders logo for the letterhead of every document, read once per process. */
export function letterheadLogo(): PdfImage {
  logo ??= jpegImage(new Uint8Array(readFileSync(path.join(/* turbopackIgnore: true */ process.cwd(), "src/lib/pdf/brand/am-traders.jpg"))));
  return logo;
}
