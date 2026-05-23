import { success, toApiError } from "@/lib/http";
import { createReservation, getRecentReservations } from "@/services/reservation-service";
import { createReservationInputSchema } from "@/schemas/reservation";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = createReservationInputSchema.parse(await request.json());
    const idempotencyKey = request.headers.get("Idempotency-Key");
    const data = await createReservation(body, idempotencyKey);
    return success(data, { status: 201 });
  } catch (error) {
    return toApiError(error);
  }
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const limit = Number(url.searchParams.get("limit") ?? "12");
    const data = await getRecentReservations(limit);
    return success(data);
  } catch (error) {
    return toApiError(error);
  }
}