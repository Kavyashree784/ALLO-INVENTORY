import type { ReservationStatus } from "@prisma/client";

export type ReservationLifecycleState = ReservationStatus | "EXPIRED";

export function getReservationLifecycleState(
  status: ReservationStatus,
  expiresAt: Date,
  now = new Date()
): ReservationLifecycleState {
  if (status === "PENDING" && expiresAt.getTime() <= now.getTime()) {
    return "EXPIRED";
  }

  return status;
}

export function isReservationExpired(status: ReservationStatus, expiresAt: Date, now = new Date()) {
  return status === "PENDING" && expiresAt.getTime() <= now.getTime();
}