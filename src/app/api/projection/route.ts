import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { projectionSettingsSchema, saveProjectionSettings } from "@/lib/projectionSettings";

// Saves the projection assumptions (horizon, monthly deposit and expected
// return per account).
export async function PUT(request: NextRequest) {
  await requireAuth();
  const body = await request.json().catch(() => null);
  const parsed = projectionSettingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });
  }
  await saveProjectionSettings(parsed.data);
  return NextResponse.json({ success: true });
}
