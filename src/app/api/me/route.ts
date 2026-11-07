import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { loadProfile } from "@/lib/profile";
import { profilePhotoUrl } from "@/lib/profileShared";

export const dynamic = "force-dynamic";

export async function GET() {
  const { username } = await requireAuth();
  const profile = await loadProfile();
  return NextResponse.json({
    username,
    firstName: profile.firstName || null,
    photoUrl: profile.photo ? profilePhotoUrl(profile.photo) : null,
  });
}
