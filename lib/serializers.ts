import type { Prisma, ReservationStatus } from "@prisma/client";

import { getReservationLifecycleState } from "@/lib/reservation-state";

type ProductRecord = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: Prisma.Decimal;
  createdAt: Date;
  updatedAt: Date;
};

type WarehouseRecord = {
  id: string;
  name: string;
  location: string;
  createdAt: Date;
  updatedAt: Date;
};

export type CatalogProductDTO = {
  id: string;
  name: string;
  description: string | null;
  imageUrl: string | null;
  price: string;
  createdAt: string;
  updatedAt: string;
  inventory: Array<{
    id: string;
    totalQuantity: number;
    reservedQuantity: number;
    availableQuantity: number;
    warehouse: {
      id: string;
      name: string;
      location: string;
    };
  }>;
};

export type WarehouseDTO = {
  id: string;
  name: string;
  location: string;
  createdAt: string;
  updatedAt: string;
};

export type ReservationDTO = {
  id: string;
  quantity: number;
  status: ReservationStatus;
  lifecycleState: ReservationStatus | "EXPIRED";
  expiresAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  createdAt: string;
  updatedAt: string;
  inventory: {
    id: string;
    totalQuantity: number;
    reservedQuantity: number;
    availableQuantity: number;
    product: {
      id: string;
      name: string;
      description: string | null;
      imageUrl: string | null;
      price: string;
    };
    warehouse: {
      id: string;
      name: string;
      location: string;
    };
  };
};

export type ReservationWithInventory = Prisma.ReservationGetPayload<{
  include: {
    inventory: {
      include: {
        product: true;
        warehouse: true;
      };
    };
  };
}>;

export function serializeCatalogProduct(
  product: ProductRecord,
  inventoryRows: Array<{
    id: string;
    totalQuantity: number;
    reservedQuantity: number;
    warehouse: {
      id: string;
      name: string;
      location: string;
    };
  }>
): CatalogProductDTO {
  return {
    id: product.id,
    name: product.name,
    description: product.description,
    imageUrl: product.imageUrl,
    price: product.price.toString(),
    createdAt: product.createdAt.toISOString(),
    updatedAt: product.updatedAt.toISOString(),
    inventory: inventoryRows.map((inventory) => ({
      id: inventory.id,
      totalQuantity: inventory.totalQuantity,
      reservedQuantity: inventory.reservedQuantity,
      availableQuantity: inventory.totalQuantity - inventory.reservedQuantity,
      warehouse: inventory.warehouse,
    })),
  };
}

export function serializeWarehouse(warehouse: WarehouseRecord): WarehouseDTO {
  return {
    id: warehouse.id,
    name: warehouse.name,
    location: warehouse.location,
    createdAt: warehouse.createdAt.toISOString(),
    updatedAt: warehouse.updatedAt.toISOString(),
  };
}

export function serializeReservation(reservation: ReservationWithInventory): ReservationDTO {
  return {
    id: reservation.id,
    quantity: reservation.quantity,
    status: reservation.status,
    lifecycleState: getReservationLifecycleState(reservation.status, reservation.expiresAt),
    expiresAt: reservation.expiresAt.toISOString(),
    confirmedAt: reservation.confirmedAt?.toISOString() ?? null,
    releasedAt: reservation.releasedAt?.toISOString() ?? null,
    createdAt: reservation.createdAt.toISOString(),
    updatedAt: reservation.updatedAt.toISOString(),
    inventory: {
      id: reservation.inventory.id,
      totalQuantity: reservation.inventory.totalQuantity,
      reservedQuantity: reservation.inventory.reservedQuantity,
      availableQuantity: reservation.inventory.totalQuantity - reservation.inventory.reservedQuantity,
      product: {
        id: reservation.inventory.product.id,
        name: reservation.inventory.product.name,
        description: reservation.inventory.product.description,
        imageUrl: reservation.inventory.product.imageUrl,
        price: reservation.inventory.product.price.toString(),
      },
      warehouse: {
        id: reservation.inventory.warehouse.id,
        name: reservation.inventory.warehouse.name,
        location: reservation.inventory.warehouse.location,
      },
    },
  };
}