import { success, toApiError } from "@/lib/http";
import { confirmReservation } from "@/services/reservation-service";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function POST(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const data = await confirmReservation(id);
    return success(data);
  } catch (error) {
    return toApiError(error);
  }
}