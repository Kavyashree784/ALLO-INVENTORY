import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getJson,
  postJson,
  type ReservationFeedResponse,
  type ReservationResponse,
} from "@/lib/api-client";

export function useReservation(reservationId: string | undefined) {
  return useQuery({
    queryKey: ["reservation", reservationId],
    enabled: Boolean(reservationId),
    queryFn: async () => getJson<ReservationResponse>(`/api/reservations/${reservationId}`),
  });
}

export function useConfirmReservation(reservationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!reservationId) {
        throw new Error("Missing reservation id");
      }

      return postJson<ReservationResponse>(`/api/reservations/${reservationId}/confirm`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reservation", reservationId] });
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
}

export function useReleaseReservation(reservationId: string | undefined) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      if (!reservationId) {
        throw new Error("Missing reservation id");
      }

      return postJson<ReservationResponse>(`/api/reservations/${reservationId}/release`);
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["reservation", reservationId] });
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
}

export function useReservationsFeed(limit = 12) {
  return useQuery({
    queryKey: ["reservations-feed", limit],
    queryFn: async () => getJson<ReservationFeedResponse>(`/api/reservations?limit=${limit}`),
  });
}