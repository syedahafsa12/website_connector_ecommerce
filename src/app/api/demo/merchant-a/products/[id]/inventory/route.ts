import { NORTHSTAR_CATALOG } from "@/demo-merchants/catalog";
import { subResource } from "@/demo-merchants/rest-handlers";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return subResource(NORTHSTAR_CATALOG, params.id, "inventory");
}
