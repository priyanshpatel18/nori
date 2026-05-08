import { NextResponse } from "next/server";

import { getShare } from "@/lib/cloak/share-store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID_RE = /^[0-9a-zA-Z]{4,32}$/;

export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) {
    return NextResponse.json({ error: "Invalid id." }, { status: 400 });
  }

  const row = getShare(id);
  if (!row) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json({
    payload: row.payload,
    createdAt: new Date(row.createdAt).toISOString(),
  });
}
