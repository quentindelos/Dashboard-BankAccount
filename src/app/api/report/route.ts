import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth";
import { buildReport } from "@/lib/report";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

// Downloads the "Relevé de patrimoine" PDF.
export async function GET() {
  const { username } = await requireAuth();
  try {
    const { pdf, fileName } = await buildReport(username);
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        // Personal financial data: never kept by the browser or a proxy.
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("report:", err);
    return NextResponse.json({ error: "Impossible de générer le PDF." }, { status: 500 });
  }
}
