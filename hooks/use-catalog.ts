import { useQuery } from "@tanstack/react-query";

import { getJson, type CatalogResponse, type WarehousesResponse } from "@/lib/api-client";

export function useCatalog() {
  return useQuery({
    queryKey: ["catalog"],
    queryFn: async () => getJson<CatalogResponse>("/api/products"),
  });
}

export function useWarehouses() {
  return useQuery({
    queryKey: ["warehouses"],
    queryFn: async () => getJson<WarehousesResponse>("/api/warehouses"),
  });
}