import { NextResponse } from "next/server";
import { runAgent } from "@/server/connect/agent";
import { approvePurchase, authorize, getConn, listViews, rediscover, recordVisit, resetAll, startConnection, verifyOwnership, view, warmPreview } from "@/server/connect/service";
import { SCOPES } from "@/server/connect/types";

export const dynamic = "force-dynamic";

// Failures of the *tested website* are normal results (status FAILED etc.), not HTTP errors.
// HTTP 400 is reserved for misuse of this API (unknown id, wrong order of steps).
export async function POST(req: Request, { params }: { params: { action: string } }) {
  const body = await req.json().catch(() => ({}));
  const id = String(body.id ?? "");
  try {
    switch (params.action) {
      case "start":
        return NextResponse.json({ connection: view(await startConnection(String(body.url ?? ""), new URL(req.url).origin)) });
      case "rediscover": {
        const c = await rediscover(id);
        await warmPreview(id);
        return NextResponse.json({ connection: view(c) });
      }
      case "verify":
        return NextResponse.json({ connection: view(await verifyOwnership(id)) });
      case "authorize": {
        const c = authorize(id, Array.isArray(body.scopes) ? body.scopes : []);
        await warmPreview(id);
        return NextResponse.json({ connection: view(c) });
      }
      case "agent": {
        const r = await runAgent(id, String(body.message ?? "").slice(0, 600));
        return NextResponse.json({ ...r, connection: view(getConn(id)) });
      }
      // The shopper pressed "Confirm purchase": the only path that can place an order.
      case "confirm": {
        const r = await approvePurchase(id, String(body.checkoutId ?? ""));
        return NextResponse.json({ ok: r.ok, order: r.result && "order" in r.result ? r.result.order : null, error: r.error ?? null, connection: view(getConn(id)) });
      }
      case "visit":
        recordVisit(id, String(body.url ?? "").slice(0, 300));
        return NextResponse.json({ ok: true, connection: view(getConn(id)) });
      case "list":
        return NextResponse.json({ connections: listViews(), scopes: Object.fromEntries(Object.entries(SCOPES).map(([k, v]) => [k, v.label])) });
      case "reset":
        resetAll();
        return NextResponse.json({ ok: true });
      default:
        return NextResponse.json({ error: "unknown action" }, { status: 404 });
    }
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 400 });
  }
}
