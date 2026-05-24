import { useQuery } from "@tanstack/react-query";

import { getJson, type CatalogResponse } from "@/lib/api-client";

export function useCatalog() {
  return useQuery({
    queryKey: ["catalog"],
    queryFn: async () => getJson<CatalogResponse>("/api/products"),
  });
}