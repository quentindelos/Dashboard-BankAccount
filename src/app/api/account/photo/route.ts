import { promises as fs } from "fs";
import path from "path";
import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { IMAGE_TYPES, imageExt, type ImageExt } from "@/lib/images";
import { loadProfile, safePhotoName, setProfilePhoto } from "@/lib/profile";

// Profile photo, stored in data/avatar next to the database.
const DIR = path.join(process.cwd(), "data", "avatar");
const MAX_BYTES = 5 * 1024 * 1024;

export async function GET() {
  await requireAuth();
  const name = (await loadProfile()).photo;
  if (!name) return new NextResponse(null, { status: 404 });
  const buf = await fs.readFile(path.join(DIR, name)).catch(() => null);
  if (!buf) return new NextResponse(null, { status: 404 });
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": IMAGE_TYPES[name.split(".").pop() as ImageExt],
      // The URL carries the file name (?v=), so a new photo gets a new URL.
      "Cache-Control": "private, max-age=31536000, immutable",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

export async function POST(request: NextRequest) {
  await requireAuth();
  const form = await request.formData().catch(() => null);
  const file = form?.get("photo");
  if (!(file instanceof File)) return NextResponse.json({ error: "Aucune photo reçue." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Photo trop lourde (5 Mo maximum)." }, { status: 400 });
  const buf = Buffer.from(await file.arrayBuffer());
  const ext = imageExt(buf);
  if (!ext) return NextResponse.json({ error: "Format non pris en charge : JPEG, PNG ou WebP." }, { status: 400 });

  await fs.mkdir(DIR, { recursive: true });
  const name = `avatar-${Date.now()}.${ext}`;
  await fs.writeFile(path.join(DIR, name), buf);
  const old = safePhotoName(await setProfilePhoto(name));
  if (old && old !== name) await fs.unlink(path.join(DIR, old)).catch(() => undefined);
  return NextResponse.json({ photo: name });
}

export async function DELETE() {
  await requireAuth();
  const old = safePhotoName(await setProfilePhoto(null));
  if (old) await fs.unlink(path.join(DIR, old)).catch(() => undefined);
  return NextResponse.json({ success: true });
}
