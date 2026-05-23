import { success, toApiError } from "@/lib/http";
import { cleanupExpiredReservations } from "@/services/reservation-service";

export const dynamic = "force-dynamic";

async function runCleanup() {
  try {
    const data = await cleanupExpiredReservations();
    return success(data);
  } catch (error) {
    return toApiError(error);
  }
}

export async function GET() {
  return runCleanup();
}

export async function POST() {
  return runCleanup();
}