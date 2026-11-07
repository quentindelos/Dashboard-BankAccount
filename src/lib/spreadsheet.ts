// Reads the first sheet of an .xlsx file, or a ;/,-separated CSV, into an
// array of { header: value } objects. Dependency-free: an .xlsx is a zip
// archive of XML files, read here with Node's zlib.
import { inflateRawSync } from "zlib";

export type SheetRow = Record<string, string>;

/** Largest size an xlsx part may unzip to: guards against zip bombs (a few MB
 * file that expands to gigabytes and exhausts the server's memory). */
const MAX_UNZIPPED_BYTES = 100 * 1024 * 1024;

function unzipEntry(buf: Buffer, wanted: string): Buffer | null {
  // End of central directory record: scan back from the end.
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error("Fichier xlsx illisible");
  const count = buf.readUInt16LE(eocd + 10);
  let p = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < count; n++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) break;
    const method = buf.readUInt16LE(p + 10);
    const compSize = buf.readUInt32LE(p + 20);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const localOffset = buf.readUInt32LE(p + 42);
    const name = buf.toString("utf8", p + 46, p + 46 + nameLen);
    if (name === wanted) {
      const lNameLen = buf.readUInt16LE(localOffset + 26);
      const lExtraLen = buf.readUInt16LE(localOffset + 28);
      const start = localOffset + 30 + lNameLen + lExtraLen;
      const data = buf.subarray(start, start + compSize);
      if (method === 0) return Buffer.from(data);
      if (method === 8) {
        try {
          return inflateRawSync(data, { maxOutputLength: MAX_UNZIPPED_BYTES });
        } catch {
          throw new Error("Fichier xlsx illisible ou trop volumineux une fois décompressé");
        }
      }
      throw new Error("Compression xlsx non gérée");
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&amp;/g, "&");
}

const texts = (xml: string) => [...xml.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((t) => decodeXml(t[1])).join("");

function colIndex(ref: string): number {
  let n = 0;
  for (const ch of ref.match(/^[A-Z]+/)![0]) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** "MoÃ«t" -> "Moët": text that was UTF-8 but got read as Latin-1 (e.g. a CSV opened in Excel). */
export function fixMojibake(s: string): string {
  if (!/[ÃÂ][\u0080-ÿ]/.test(s) || /[^\u0000-ÿ]/.test(s)) return s;
  const fixed = Buffer.from(s, "latin1").toString("utf8");
  return fixed.includes("�") ? s : fixed;
}

function toObjects(rows: string[][]): SheetRow[] {
  const header = (rows[0] ?? []).map((h) => h.trim());
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c !== undefined && c !== ""))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, fixMojibake(r[i] ?? "")])));
}

export function readXlsx(buf: Buffer): SheetRow[] {
  const sharedXml = unzipEntry(buf, "xl/sharedStrings.xml")?.toString("utf8") ?? "";
  const shared = [...sharedXml.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => texts(m[1]));
  const sheet = unzipEntry(buf, "xl/worksheets/sheet1.xml")?.toString("utf8");
  if (!sheet) throw new Error("Feuille introuvable dans le fichier xlsx");
  const rows: string[][] = [];
  for (const rm of sheet.matchAll(/<row[^>]*>([\s\S]*?)<\/row>/g)) {
    const cells: string[] = [];
    for (const cm of rm[1].matchAll(/<c r="([A-Z]+\d+)"([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const [, ref, attrs, inner = ""] = cm;
      const type = attrs.match(/t="(\w+)"/)?.[1];
      const v = inner.match(/<v>([\s\S]*?)<\/v>/)?.[1];
      let val = "";
      if (type === "s") val = shared[Number(v)] ?? "";
      else if (type === "inlineStr") val = texts(inner);
      else if (v !== undefined) val = decodeXml(v);
      cells[colIndex(ref)] = val;
    }
    rows.push(cells);
  }
  return toObjects(rows);
}

export function readCsv(text: string): SheetRow[] {
  const clean = text.replace(/^﻿/, "");
  const firstLine = clean.slice(0, clean.indexOf("\n"));
  const sep = firstLine.split(";").length >= firstLine.split(",").length ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (quoted) {
      if (ch === '"' && clean[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && clean[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return toObjects(rows);
}

/** Picks the reader from the file content (xlsx files start with the zip signature). */
export function readSpreadsheet(buf: Buffer): SheetRow[] {
  return buf.readUInt32LE(0) === 0x04034b50 ? readXlsx(buf) : readCsv(buf.toString("utf8"));
}
