import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";

export async function GET() {
  const { username } = await requireAuth();
  return NextResponse.json({ username });
}
