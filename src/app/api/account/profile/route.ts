import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { loadProfile, saveProfile } from "@/lib/profile";
import { userProfileSchema } from "@/lib/profileShared";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAuth();
  return NextResponse.json({ profile: await loadProfile() });
}

export async function PUT(request: NextRequest) {
  await requireAuth();
  const parsed = userProfileSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Profil invalide" }, { status: 400 });
  }
  return NextResponse.json({ profile: await saveProfile(parsed.data) });
}
