import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireAuthenticatedUser, UnauthorizedError } from "@/server/auth/session";
import { addPaymentMethod, listPaymentMethods } from "@/server/profile/repository";

const createSchema = z.object({
  token: z.string().min(1), // sandbox/tokenized reference from the payment provider's test mode — never a raw card number
  brand: z.string().optional(),
  last4: z.string().length(4).optional(),
  expMonth: z.number().int().min(1).max(12).optional(),
  expYear: z.number().int().optional(),
  isDefault: z.boolean().optional(),
});

export async function GET(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    return NextResponse.json({ paymentMethods: await listPaymentMethods(user.id) });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const user = await requireAuthenticatedUser(req);
    const parsed = createSchema.safeParse(await req.json());
    if (!parsed.success) return NextResponse.json({ error: parsed.error.message }, { status: 400 });
    const paymentMethod = await addPaymentMethod(user.id, parsed.data);
    return NextResponse.json({ paymentMethod }, { status: 201 });
  } catch (err) {
    if (err instanceof UnauthorizedError) return NextResponse.json({ error: err.message }, { status: 401 });
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
