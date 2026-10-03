import { LUNA_CATALOG } from "@/demo-merchants/luna-catalog";
import { subResource } from "@/demo-merchants/rest-handlers";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return subResource(LUNA_CATALOG, params.id, "warranty");
}
