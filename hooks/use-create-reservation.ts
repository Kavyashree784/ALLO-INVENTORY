import { useMutation, useQueryClient } from "@tanstack/react-query";

import { postJson, type ReservationResponse } from "@/lib/api-client";

type CreateReservationInput = {
  productId: string;
  warehouseId: string;
  quantity: number;
};

function createIdempotencyKey() {
  return crypto.randomUUID();
}

export function useCreateReservation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: CreateReservationInput) => {
      const idempotencyKey = createIdempotencyKey();

      return postJson<ReservationResponse>(
        "/api/reservations",
        input,
        {
          headers: {
            "Idempotency-Key": idempotencyKey,
          },
        }
      );
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["catalog"] });
    },
  });
}