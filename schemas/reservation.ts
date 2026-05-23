import { z } from "zod";

export const createReservationInputSchema = z.object({
  productId: z.string().min(1),
  warehouseId: z.string().min(1),
  quantity: z.coerce.number().int().positive().max(9999),
});

export type CreateReservationInput = z.infer<typeof createReservationInputSchema>;

export const reservationIdParamSchema = z.object({
  id: z.string().min(1),
});