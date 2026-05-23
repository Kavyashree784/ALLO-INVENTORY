import { success, toApiError } from "@/lib/http";
import { getCatalogProducts } from "@/services/catalog-service";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const data = await getCatalogProducts();
    return success(data);
  } catch (error) {
    return toApiError(error);
  }
}