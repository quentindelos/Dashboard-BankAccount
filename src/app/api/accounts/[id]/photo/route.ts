import { promises as fs } from "fs";
import path from "path";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";

// Photo of an account (a vehicle), stored in data/photos next to the database.
const DIR = path.join(process.cwd(), "data", "photos");
const MAX_BYTES = 10 * 1024 * 1024;

const TYPES = {
  jpg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
} as const;
type Ext = keyof typeof TYPES;

/** Recognises the image from its first bytes, whatever the browser claims. */
function imageExt(buf: Buffer): Ext | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "jpg";
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "png";
  if (buf.subarray(0, 4).toString("ascii") === "RIFF" && buf.subarray(8, 12).toString("ascii") === "WEBP") return "webp";
  return null;
}

// Stored names are generated here: <account id>-<timestamp>.<ext>.
const safeName = (name: string | null) => (name && /^[a-z0-9]+-\d+\.(jpg|png|webp)$/.test(name) ? name : null);

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, { params }: RouteParams) {
  await requireAuth();
  const { id } = await params;
  const account = await prisma.account.findUnique({ where: { id }, select: { photo: true } });
  const name = safeName(account?.photo ?? null);
  if (!name) return new NextResponse(null, { status: 404 });
  const buf = await fs.readFile(path.join(DIR, name)).catch(() => null);
  if (!buf) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": TYPES[name.split(".").pop() as Ext],
      // The URL carries the file name, so a new photo gets a new URL.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  await requireAuth();
  const { id } = await params;
  const account = await prisma.account.findUnique({ where: { id }, select: { id: true, photo: true } });
  if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });

  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return NextResponse.json({ error: "Aucune photo reçue." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Photo trop lourde (10 Mo maximum)." }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = imageExt(buf);
  if (!ext) return NextResponse.json({ error: "Format non pris en charge : JPEG, PNG ou WebP." }, { status: 400 });

  await fs.mkdir(DIR, { recursive: true });
  const name = `${account.id}-${Date.now()}.${ext}`;
  await fs.writeFile(path.join(DIR, name), buf);
  await prisma.account.update({ where: { id }, data: { photo: name } });
  const old = safeName(account.photo);
  if (old) await fs.unlink(path.join(DIR, old)).catch(() => undefined);
  return NextResponse.json({ photo: name });
}

export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  await requireAuth();
  const { id } = await params;
  const account = await prisma.account.findUnique({ where: { id }, select: { photo: true } });
  if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  const old = safeName(account.photo);
  await prisma.account.update({ where: { id }, data: { photo: null } });
  if (old) await fs.unlink(path.join(DIR, old)).catch(() => undefined);
  return NextResponse.json({ success: true });
}
