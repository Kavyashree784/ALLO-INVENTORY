import type { CatalogProductDTO, ReservationDTO, WarehouseDTO } from "@/lib/serializers";

type ApiSuccess<T> = {
  success: true;
  data: T;
};

type ApiError = {
  success: false;
  error: {
    code: string;
    message: string;
    issues?: unknown;
  };
};

export class ApiClientError extends Error {
  readonly status: number;
  readonly code: string;
  readonly issues?: unknown;

  constructor(status: number, code: string, message: string, issues?: unknown) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
    this.code = code;
    this.issues = issues;
  }
}

async function parseResponse<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as ApiSuccess<T> | ApiError;

  if (!response.ok || !payload.success) {
    const errorPayload = payload as ApiError;
    throw new ApiClientError(
      response.status,
      errorPayload.error.code,
      errorPayload.error.message,
      errorPayload.error.issues
    );
  }

  return payload.data;
}

export async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: "no-store" });
  return parseResponse<T>(response);
}

export async function postJson<T>(
  url: string,
  body?: unknown,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    ...init,
  });

  return parseResponse<T>(response);
}

export type CatalogResponse = {
  products: CatalogProductDTO[];
  warehouses: WarehouseDTO[];
};

export type WarehousesResponse = {
  warehouses: WarehouseDTO[];
};

export type ReservationResponse = ReservationDTO;

export type ReservationFeedResponse = {
  reservations: ReservationDTO[];
  summary: {
    totalCount: number;
    pendingCount: number;
    confirmedCount: number;
    releasedCount: number;
    expiredCount: number;
    expiringSoonCount: number;
  };
};