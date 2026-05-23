import { success, toApiError } from "@/lib/http";
import { getWarehouses } from "@/services/catalog-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getWarehouses();
    return success(data);
  } catch (error) {
    return toApiError(error);
  }
}