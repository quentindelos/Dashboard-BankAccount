import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { buildChecklist, dueCount } from "@/lib/checklist";

export const dynamic = "force-dynamic";

export async function GET() {
  await requireAuth();
  const items = await buildChecklist();
  return NextResponse.json({ items, due: dueCount(items) });
}
