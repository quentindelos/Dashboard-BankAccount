import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { requireAuth } from "@/lib/auth";
import { goldDetailsSchema, parseVehicleDetails, vehicleDetailsSchema } from "@/lib/physicalAssets";
import { estimateVehicle, resetGold, valueGold } from "@/lib/valuations";

type RouteParams = { params: Promise<{ id: string }> };

const message = (err: unknown) => (err instanceof Error ? err.message : "Erreur inconnue");

// Saves the description of a physical asset (coins and bars of gold, or a
// vehicle) and values it right away.
export async function PUT(request: NextRequest, { params }: RouteParams) {
  await requireAuth();
  const { id } = await params;
  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  const body = await request.json().catch(() => null);

  if (account.type === "OR") {
    const parsed = goldDetailsSchema.safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Description invalide" }, { status: 400 });
    await prisma.account.update({ where: { id }, data: { details: JSON.stringify(parsed.data) } });
    try {
      return NextResponse.json({ details: parsed.data, valuation: await resetGold(id) });
    } catch (err) {
      return NextResponse.json({ details: parsed.data, warning: message(err) });
    }
  }

  if (account.type === "VEHICULE") {
    const parsed = vehicleDetailsSchema.omit({ estimate: true }).safeParse(body);
    if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Description invalide" }, { status: 400 });
    // The previous estimate stays shown until the new one arrives.
    const previous = parseVehicleDetails(account.details)?.estimate;
    const details = { ...parsed.data, ...(previous && { estimate: previous }) };
    await prisma.account.update({ where: { id }, data: { details: JSON.stringify(details) } });
    return NextResponse.json({ details });
  }

  return NextResponse.json({ error: "Ce type de compte n'a pas de description." }, { status: 400 });
}

// Values the asset now: the day's gold price, or a new market estimate for a vehicle.
export async function POST(_request: NextRequest, { params }: RouteParams) {
  await requireAuth();
  const { id } = await params;
  const account = await prisma.account.findUnique({ where: { id } });
  if (!account) return NextResponse.json({ error: "Compte introuvable" }, { status: 404 });
  try {
    if (account.type === "OR") return NextResponse.json({ valuation: await valueGold(id) });
    if (account.type === "VEHICULE") return NextResponse.json({ estimate: await estimateVehicle(id) });
  } catch (err) {
    return NextResponse.json({ error: message(err) }, { status: 502 });
  }
  return NextResponse.json({ error: "Ce type de compte ne se valorise pas automatiquement." }, { status: 400 });
}
