import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";
import { getSettings, saveCushionMonths } from "@/lib/settings";
import { settingsSchema } from "@/lib/validation";

export async function GET() {
  await requireAuth();
  return NextResponse.json(await getSettings());
}

export async function PUT(request: NextRequest) {
  await requireAuth();
  const body = await request.json().catch(() => null);
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Requête invalide" }, { status: 400 });
  }
  await saveCushionMonths(parsed.data.cushionMonths);
  return NextResponse.json(await getSettings());
}
