import { promises as fs } from "fs";
import path from "path";
import { NextResponse, type NextRequest } from "next/server";
import { requireAuth } from "@/lib/auth";

// Downloads a logo once, then serves it from data/logos. Only fixed upstream
// hosts are contacted; the id is strictly validated before use.
const SOURCES: Record<string, { pattern: RegExp; url: (id: string) => string }> = {
  isin: {
    pattern: /^[A-Z]{2}[A-Z0-9]{9}[0-9]$/,
    url: (id) => `https://assets.parqet.com/logos/isin/${id}?format=png&size=128`,
  },
  crypto: {
    pattern: /^[A-Z0-9]{2,10}$/,
    url: (id) => `https://assets.parqet.com/logos/crypto/${id}?format=png&size=128`,
  },
  domain: {
    pattern: /^[a-z0-9-]+(\.[a-z0-9-]+)+$/,
    url: (id) => `https://www.google.com/s2/favicons?domain=${id}&sz=128`,
  },
};

const DIR = path.join(process.cwd(), "data", "logos");
const MISS_RETRY_MS = 7 * 24 * 3600 * 1000; // retry unknown logos once a week
const MAX_BYTES = 512 * 1024;

type RouteParams = { params: Promise<{ kind: string; id: string }> };

function image(buf: Buffer) {
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "private, max-age=604800",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

const notFound = () => new NextResponse(null, { status: 404, headers: { "Cache-Control": "private, max-age=3600" } });

export async function GET(_request: NextRequest, { params }: RouteParams) {
  try {
    await requireAuth();
  } catch {
    return new NextResponse(null, { status: 401 });
  }
  const { kind, id } = await params;
  const source = SOURCES[kind];
  if (!source || !source.pattern.test(id)) return notFound();

  const file = path.join(DIR, `${kind}-${id}.png`);
  const miss = `${file}.miss`;

  const cached = await fs.readFile(file).catch(() => null);
  if (cached) return image(cached);

  const missStat = await fs.stat(miss).catch(() => null);
  if (missStat && Date.now() - missStat.mtimeMs < MISS_RETRY_MS) return notFound();

  try {
    const res = await fetch(source.url(id), { signal: AbortSignal.timeout(6000), redirect: "follow" });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !type.startsWith("image/")) {
      if (res.status === 404 || res.ok) {
        await fs.mkdir(DIR, { recursive: true });
        await fs.writeFile(miss, "");
      }
      return notFound();
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0 || buf.length > MAX_BYTES) return notFound();
    await fs.mkdir(DIR, { recursive: true });
    await fs.writeFile(file, buf);
    return image(buf);
  } catch {
    // Offline or upstream down: no cache entry, try again next time.
    return notFound();
  }
}
