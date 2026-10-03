import { CADENCE_CATALOG } from "@/demo-merchants/cadence-catalog";
import { subResource } from "@/demo-merchants/rest-handlers";

export async function GET(_req: Request, { params }: { params: { id: string } }) {
  return subResource(CADENCE_CATALOG, params.id, "warranty");
}
