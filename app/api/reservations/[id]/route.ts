import { success, toApiError } from "@/lib/http";
import { getReservationDetails } from "@/services/reservation-service";

export const dynamic = "force-dynamic";

type Params = {
  params: Promise<{
    id: string;
  }>;
};

export async function GET(_request: Request, { params }: Params) {
  try {
    const { id } = await params;
    const data = await getReservationDetails(id);
    return success(data);
  } catch (error) {
    return toApiError(error);
  }
}