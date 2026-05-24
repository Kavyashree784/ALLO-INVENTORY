"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiClientError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Separator } from "@/components/ui/separator";
import { OperationsSectionHeader, OperationsShell, type OperationsMetric } from "@/components/operations-shell";
import { useToast } from "@/app/providers";
import { useCatalog } from "@/hooks/use-catalog";
import { useCreateReservation } from "@/hooks/use-create-reservation";
import { useReservationsFeed } from "@/hooks/use-reservation";

function formatMoney(value: string) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(Number(value));
}

function formatStock(available: number, total: number) {
  return `${available.toLocaleString()} / ${total.toLocaleString()}`;
}

function formatSku(id: string) {
  return `SKU-${id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase()}`;
}

function calculatePercent(numerator: number, denominator: number) {
  if (denominator <= 0) {
    return 0;
  }

  return Math.min(100, Math.round((numerator / denominator) * 100));
}

function toneForAvailability(available: number, total: number) {
  if (available <= 0) {
    return "danger" as const;
  }

  if (total > 0 && available / total <= 0.15) {
    return "warning" as const;
  }

  return "success" as const;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function getReservationTone(state: string) {
  if (state === "CONFIRMED") {
    return "success" as const;
  }

  if (state === "RELEASED" || state === "EXPIRED") {
    return "danger" as const;
  }

  return "warning" as const;
}

export function InventoryDashboard() {
  const router = useRouter();
  const { data, isLoading, error, refetch } = useCatalog();
  const { showToast } = useToast();
  const createReservationMutation = useCreateReservation();
  const reservationsFeed = useReservationsFeed(10);
  const [selectedQuantities, setSelectedQuantities] = useState<Record<string, number>>({});
  const [selectedWarehouseByProduct, setSelectedWarehouseByProduct] = useState<Record<string, string>>({});
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const createLockRef = useRef(false);

  const firstWarehouseByProduct = useMemo(() => {
    const map = new Map<string, string>();

    data?.products.forEach((product) => {
      if (product.inventory[0]) {
        map.set(product.id, product.inventory[0].warehouse.id);
      }
    });

    return map;
  }, [data?.products]);

  const products = data?.products ?? [];
  const warehouses = data?.warehouses ?? [];

  const totalUnits = products.reduce(
    (sum, product) => sum + product.inventory.reduce((inventorySum, inventory) => inventorySum + inventory.totalQuantity, 0),
    0
  );
  const reservedUnits = products.reduce(
    (sum, product) => sum + product.inventory.reduce((inventorySum, inventory) => inventorySum + inventory.reservedQuantity, 0),
    0
  );
  const lowStockSkus = products.filter((product) =>
    product.inventory.some((inventory) => inventory.availableQuantity > 0 && inventory.availableQuantity <= Math.max(3, Math.ceil(inventory.totalQuantity * 0.15)))
  ).length;
  const outOfStockSkus = products.filter((product) => product.inventory.every((inventory) => inventory.availableQuantity <= 0)).length;
  const activeReservations = reservationsFeed.data
    ? reservationsFeed.data.summary.pendingCount + reservationsFeed.data.summary.confirmedCount
    : 0;
  const expiringSoonReservations = reservationsFeed.data?.summary.expiringSoonCount ?? 0;
  const warehouseHealth = warehouses.length
    ? warehouses.filter((warehouse) => {
        const inventoryRows = products.flatMap((product) => product.inventory.filter((inventory) => inventory.warehouse.id === warehouse.id));
        if (inventoryRows.length === 0) {
          return false;
        }

        return inventoryRows.every((inventory) => inventory.availableQuantity > 0 || inventory.totalQuantity === 0 || inventory.availableQuantity / inventory.totalQuantity > 0.15);
      }).length
    : 0;

  const metrics: OperationsMetric[] = [
    { label: "Products", value: `${products.length}`, detail: `${warehouses.length} warehouses online` },
    { label: "Active reservations", value: `${activeReservations.toLocaleString()}`, detail: "Pending and confirmed holds", tone: activeReservations > 0 ? "warning" : "neutral" },
    { label: "Expiring soon", value: `${expiringSoonReservations.toLocaleString()}`, detail: "Pending holds near expiry", tone: expiringSoonReservations > 0 ? "danger" : "success" },
    { label: "Warehouse health", value: `${warehouseHealth.toLocaleString()}/${warehouses.length.toLocaleString()}`, detail: `${reservedUnits.toLocaleString()} units reserved · ${outOfStockSkus.toLocaleString()} out-of-stock SKUs`, tone: warehouseHealth < warehouses.length ? "warning" : "success" },
  ];

  if (isLoading) {
    return (
      <OperationsShell
        title="Inventory overview"
        description="Loading products, warehouses, and availability from the live catalog."
        statusLabel="Loading catalog"
        statusTone="neutral"
        navLinks={[
          { href: "#overview", label: "Overview", active: true },
          { href: "#inventory", label: "Inventory" },
          { href: "#operations", label: "Operations" },
        ]}
        metrics={[]}
      >
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, index) => (
              <div key={index} className="h-24 animate-pulse rounded-xl border border-stone-200 bg-white/80 dark:border-stone-800 dark:bg-stone-900/80" />
            ))}
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="h-52 animate-pulse rounded-xl border border-stone-200 bg-white/85 dark:border-stone-800 dark:bg-stone-900/80" />
            ))}
          </div>
        </div>
      </OperationsShell>
    );
  }

  if (error) {
    return (
      <OperationsShell
        title="Inventory overview"
        description="We could not load the live catalog. Check the API connection and try again."
        statusLabel="Catalog error"
        statusTone="danger"
        navLinks={[
          { href: "#overview", label: "Overview", active: true },
          { href: "#inventory", label: "Inventory" },
          { href: "#operations", label: "Operations" },
        ]}
        metrics={[]}
      >
        <Card className="border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100">
          <CardHeader>
            <CardTitle>Unable to load inventory</CardTitle>
            <CardDescription className="text-rose-900/80 dark:text-rose-100/80">
              {error instanceof ApiClientError ? error.message : "Unexpected error while fetching catalog data."}
            </CardDescription>
          </CardHeader>
          <CardFooter>
            <Button onClick={() => refetch()}>Retry</Button>
          </CardFooter>
        </Card>
      </OperationsShell>
    );
  }

  return (
    <OperationsShell
      title="Inventory overview"
      description="Operational stock control for a single warehouse-backed reservation flow. Monitor availability, lock stock, and confirm holds without overselling the last unit."
      statusLabel="Connected to live catalog"
      statusTone="success"
      navLinks={[
        { href: "#overview", label: "Overview", active: true },
        { href: "#inventory", label: "Inventory" },
        { href: "#operations", label: "Operations" },
      ]}
      metrics={metrics}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Refresh inventory
          </Button>
          <Button variant="secondary" size="sm" onClick={() => router.refresh()}>
            Sync view
          </Button>
        </>
      }
    >
      <section className="grid gap-5 lg:grid-cols-[1.4fr_0.6fr]" id="overview">
        <Card>
          <CardHeader>
            <CardTitle>Operating model</CardTitle>
            <CardDescription>
              Each hold maps to one product in one warehouse. The transaction stays small, the lock is explicit, and the inventory counters stay readable.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-3">
            <StateBlock label="Lock scope" value="Inventory row" tone="neutral" />
            <StateBlock label="Expiry mode" value="Lazy + cleanup" tone="warning" />
            <StateBlock label="Default TTL" value="10 minutes" tone="neutral" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Inventory posture</CardTitle>
            <CardDescription>Compact view of the current stock health across the seeded catalog.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <ProgressLine
              label="Active reservations"
              value={activeReservations.toString()}
              percent={calculatePercent(activeReservations, Math.max(reservationsFeed.data?.summary.totalCount ?? 1, 1))}
              tone={activeReservations > 0 ? "warning" : "success"}
            />
            <ProgressLine
              label="Reserved stock"
              value={reservedUnits.toString()}
              percent={calculatePercent(reservedUnits, Math.max(totalUnits, 1))}
              tone="warning"
            />
            <ProgressLine
              label="Low-stock SKUs"
              value={lowStockSkus.toString()}
              percent={products.length ? Math.min(100, Math.round((lowStockSkus / products.length) * 100)) : 0}
              tone={lowStockSkus > 0 ? "danger" : "success"}
            />
          </CardContent>
        </Card>
      </section>

      {products.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle>No inventory loaded</CardTitle>
            <CardDescription>
              Seed the catalog or connect a warehouse-backed data source to begin reserving stock.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <section className="space-y-4" id="inventory">
        <OperationsSectionHeader
          eyebrow="Stock table"
          title="Products by warehouse"
          description="Inventory is grouped by product, then by warehouse. Select the fulfillment site, adjust quantity, and reserve from the row that still has stock."
        />

        <div className="space-y-3">
          {products.map((product) => {
            const selectedWarehouseId = selectedWarehouseByProduct[product.id] ?? firstWarehouseByProduct.get(product.id) ?? product.inventory[0]?.warehouse.id ?? "";
            const selectedWarehouse = product.inventory.find((inventory) => inventory.warehouse.id === selectedWarehouseId) ?? product.inventory[0];
            const quantity = selectedQuantities[product.id] ?? 1;
            const displayQuantity = Number.isFinite(quantity) && quantity >= 1 ? quantity : 1;
            const maxQuantity = selectedWarehouse?.availableQuantity ?? 0;
            const isOutOfStock = product.inventory.every((inventory) => inventory.availableQuantity <= 0);
            const hasLowStock = product.inventory.some((inventory) => inventory.availableQuantity > 0 && inventory.availableQuantity <= Math.max(3, Math.ceil(inventory.totalQuantity * 0.15)));
            const isSubmitting = createReservationMutation.isPending && activeProductId === product.id;
            const quantityInputId = `quantity-${product.id}`;

            return (
              <Card key={product.id} id={`product-${product.id}`} className="overflow-hidden">
                <CardHeader>
                  <div className="flex flex-col gap-3 border-b border-stone-200/80 pb-3 sm:flex-row sm:items-start sm:justify-between dark:border-stone-800">
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <CardTitle>{product.name}</CardTitle>
                        <Badge className="bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200">{formatSku(product.id)}</Badge>
                        <Badge
                          className={cn(
                            "border",
                            isOutOfStock
                              ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"
                              : hasLowStock
                                ? "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                                : "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"
                          )}
                        >
                          {isOutOfStock ? "Out of stock" : hasLowStock ? "Low stock" : "Healthy"}
                        </Badge>
                      </div>
                      <CardDescription>{product.description ?? "High-demand inventory item"}</CardDescription>
                    </div>
                    <div className="grid grid-cols-2 gap-2 text-right sm:grid-cols-1">
                      <div>
                        <p className="text-sm font-semibold text-stone-600 dark:text-stone-400">Price</p>
                        <p className="mt-1 text-lg font-semibold tracking-tight">{formatMoney(product.price)}</p>
                      </div>
                      <div>
                        <p className="text-sm font-semibold text-stone-600 dark:text-stone-400">Warehouse rows</p>
                        <p className="mt-1 text-lg font-semibold tracking-tight">{product.inventory.length}</p>
                      </div>
                    </div>
                  </div>
                </CardHeader>

                <CardContent className="grid gap-4 xl:grid-cols-[1.15fr_0.85fr]">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-3 text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                      <span>Warehouse allocation</span>
                      <span>Available / total</span>
                    </div>
                    <div className="space-y-2">
                      {product.inventory.map((inventory) => {
                        const isSelected = inventory.warehouse.id === selectedWarehouseId;
                        const isZero = inventory.availableQuantity <= 0;
                        const isLimited = inventory.availableQuantity > 0 && inventory.availableQuantity <= Math.max(3, Math.ceil(inventory.totalQuantity * 0.15));

                        return (
                          <button
                            key={inventory.id}
                            type="button"
                            onClick={() =>
                              setSelectedWarehouseByProduct((current) => ({
                                ...current,
                                [product.id]: inventory.warehouse.id,
                              }))
                            }
                            aria-pressed={isSelected}
                            className={cn(
                                "flex w-full items-center justify-between gap-3 rounded-md border px-3 py-2 text-left text-sm transition-colors",
                                isSelected
                                  ? "border-stone-900 bg-stone-900 text-white dark:border-stone-50 dark:bg-stone-50 dark:text-stone-950"
                                  : "border-stone-100 bg-transparent hover:border-stone-200 hover:bg-white/60 dark:border-stone-800 dark:bg-transparent dark:hover:border-stone-700",
                              )}
                          >
                            <span className="min-w-0 space-y-0.5">
                              <span className="block font-medium">{inventory.warehouse.name}</span>
                              <span className="block text-xs text-current/60">{inventory.warehouse.location}</span>
                            </span>
                            <span className="flex items-center gap-2 text-sm font-semibold tabular-nums">
                              <span>{formatStock(inventory.availableQuantity, inventory.totalQuantity)}</span>
                              {isZero ? (
                                <Badge className="border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200">Out</Badge>
                              ) : isLimited ? (
                                <Badge className="border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">Low</Badge>
                              ) : null}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-xl border border-stone-200 bg-stone-50 p-4 dark:border-stone-800 dark:bg-stone-900/50">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <StateBlock label="Selected warehouse" value={selectedWarehouse?.warehouse.name ?? "Unavailable"} tone={isOutOfStock ? "danger" : "neutral"} compact />
                      <StateBlock label="Availability" value={selectedWarehouse ? formatStock(selectedWarehouse.availableQuantity, selectedWarehouse.totalQuantity) : "No stock"} tone={toneForAvailability(maxQuantity, selectedWarehouse?.totalQuantity ?? 0)} compact />
                    </div>

                    <div className="grid gap-2">
                      <label htmlFor={quantityInputId} className="text-xs font-semibold uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">
                        Reserve quantity
                      </label>
                      <Input
                        id={quantityInputId}
                        type="number"
                        min={1}
                        max={Math.max(maxQuantity, 1)}
                        value={displayQuantity}
                        onChange={(event) =>
                          setSelectedQuantities((current) => ({
                            ...current,
                            [product.id]: event.target.value === "" ? 1 : Number(event.target.value),
                          }))
                        }
                        aria-describedby={`${quantityInputId}-help`}
                      />
                      <p id={`${quantityInputId}-help`} className={cn("text-xs leading-5", isOutOfStock ? "text-rose-700 dark:text-rose-300" : "text-stone-500 dark:text-stone-400")}>
                        {selectedWarehouse
                          ? `Selected warehouse availability: ${formatStock(selectedWarehouse.availableQuantity, selectedWarehouse.totalQuantity)}`
                          : "No warehouse selected"}
                      </p>
                    </div>

                    <Separator />

                    <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch">
                      <Button
                        onClick={async () => {
                          if (createLockRef.current || !selectedWarehouse || displayQuantity < 1) {
                            return;
                          }

                          createLockRef.current = true;
                          setActiveProductId(product.id);

                          try {
                            const reservation = await createReservationMutation.mutateAsync({
                              productId: product.id,
                              warehouseId: selectedWarehouse.warehouse.id,
                              quantity: displayQuantity,
                            });

                            showToast({
                              tone: "success",
                              title: "Reservation created",
                              description: `Reserved ${displayQuantity} unit${displayQuantity > 1 ? "s" : ""} from ${selectedWarehouse.warehouse.name}.`,
                            });

                            router.push(`/reservations/${reservation.id}`);
                          } catch (mutationError) {
                            showToast({
                              tone: "error",
                              title: "Unable to create reservation",
                              description: mutationError instanceof ApiClientError ? mutationError.message : "Try again in a moment.",
                            });
                          } finally {
                            createLockRef.current = false;
                            setActiveProductId(null);
                          }
                        }}
                        aria-busy={isSubmitting}
                        disabled={createReservationMutation.isPending || !selectedWarehouse || displayQuantity < 1 || displayQuantity > maxQuantity}
                        className="w-full min-w-0"
                      >
                        {isSubmitting ? "Reserving..." : isOutOfStock ? "Out of stock" : "Reserve Inventory"}
                      </Button>
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectedQuantities((current) => ({
                            ...current,
                            [product.id]: 1,
                          }));
                          if (product.inventory[0]) {
                            setSelectedWarehouseByProduct((current) => ({
                              ...current,
                              [product.id]: product.inventory[0].warehouse.id,
                            }));
                          }
                        }}
                        className="w-full sm:w-auto"
                      >
                        Reset row
                      </Button>
                    </div>

                    {createReservationMutation.error && activeProductId === product.id ? (
                      <div role="alert" className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100">
                        {createReservationMutation.error instanceof ApiClientError
                          ? createReservationMutation.error.message
                          : "Failed to create reservation."}
                      </div>
                    ) : null}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2" id="operations">
        <Card>
          <CardHeader>
            <CardTitle>Recent reservation activity</CardTitle>
            <CardDescription>Live operational events from the reservation feed.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {reservationsFeed.isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, index) => (
                  <div key={index} className="h-16 animate-pulse rounded-lg border border-stone-200 bg-stone-50 dark:border-stone-800 dark:bg-stone-900/50" />
                ))}
              </div>
            ) : reservationsFeed.error ? (
              <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100">
                Unable to load reservation activity.
              </div>
            ) : reservationsFeed.data?.reservations.length ? (
              <div className="space-y-2">
                {reservationsFeed.data.reservations.map((reservation) => (
                  <div key={reservation.id} className="flex items-start justify-between gap-3 rounded-md border border-stone-100 px-3 py-1.5 dark:border-stone-800">
                    <div className="min-w-0 space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-medium text-stone-900 dark:text-stone-50">{reservation.inventory.product.name}</p>
                        <Badge className={cn(getReservationTone(reservation.lifecycleState) === "success" ? "bg-emerald-100 text-emerald-800" : getReservationTone(reservation.lifecycleState) === "danger" ? "bg-rose-100 text-rose-800" : "bg-amber-100 text-amber-800")}>
                          {reservation.lifecycleState}
                        </Badge>
                      </div>
                      <p className="text-sm text-stone-600 dark:text-stone-400">
                        {reservation.inventory.warehouse.name} · {reservation.quantity} unit{reservation.quantity > 1 ? "s" : ""} · {formatTimestamp(reservation.updatedAt)}
                      </p>
                    </div>
                    <div className="text-right text-sm text-stone-600 dark:text-stone-400">
                      <p className="font-mono text-xs">{formatSku(reservation.id)}</p>
                      <p className="mt-0.5">{reservation.status === "CONFIRMED" ? "Confirmed" : reservation.status === "RELEASED" ? "Released" : reservation.lifecycleState === "EXPIRED" ? "Expired" : "Pending"}</p>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm text-stone-600 dark:border-stone-800 dark:bg-stone-900/50 dark:text-stone-300">
                No reservation activity yet.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Warehouse summary</CardTitle>
            <CardDescription>Compact allocation view across the active fulfillment sites.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {warehouses.map((warehouse) => {
              const warehouseUnits = products.reduce((sum, product) => {
                const inventory = product.inventory.find((entry) => entry.warehouse.id === warehouse.id);
                return sum + (inventory?.totalQuantity ?? 0);
              }, 0);

              const warehouseReserved = products.reduce((sum, product) => {
                const inventory = product.inventory.find((entry) => entry.warehouse.id === warehouse.id);
                return sum + (inventory?.reservedQuantity ?? 0);
              }, 0);

              return (
                <div key={warehouse.id} className="flex items-center justify-between gap-4 rounded-lg border border-stone-200 bg-stone-50 px-3 py-2 text-sm dark:border-stone-800 dark:bg-stone-900/50">
                  <div>
                    <p className="font-medium text-stone-950 dark:text-stone-50">{warehouse.name}</p>
                    <p className="text-xs text-stone-500 dark:text-stone-400">{warehouse.location}</p>
                  </div>
                  <div className="text-right text-xs text-stone-500 dark:text-stone-400">
                    <p>{warehouseUnits.toLocaleString()} units</p>
                    <p>{warehouseReserved.toLocaleString()} reserved</p>
                  </div>
                </div>
              );
            })}
            <div className="rounded-lg border border-stone-200 bg-white/80 px-3 py-2 text-sm dark:border-stone-800 dark:bg-stone-950/50">
              <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-stone-500 dark:text-stone-400">Operational check</p>
              <p className="mt-1 text-sm leading-6 text-stone-700 dark:text-stone-300">{warehouseHealth.toLocaleString()} of {warehouses.length.toLocaleString()} warehouses are currently healthy.</p>
            </div>
          </CardContent>
        </Card>
      </section>
    </OperationsShell>
  );
}

function StateBlock({
  label,
  value,
  tone = "neutral",
  compact = false,
}: {
  label: string;
  value: string;
  tone?: "neutral" | "success" | "warning" | "danger";
  compact?: boolean;
}) {
  const toneClasses = {
    neutral: "border-stone-200 bg-white text-stone-950 dark:border-stone-800 dark:bg-stone-950/80 dark:text-stone-50",
    success: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-50",
    warning: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-50",
    danger: "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-50",
  } as const;

  return (
    <div className={cn("rounded-lg border px-3 py-2", toneClasses[tone], compact ? "min-h-16" : "min-h-20")}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.22em] text-current/60">{label}</p>
      <p className={cn("mt-1 font-medium leading-5", compact ? "text-sm" : "text-base")}>{value}</p>
    </div>
  );
}

function ProgressLine({
  label,
  value,
  percent,
  tone,
}: {
  label: string;
  value: string;
  percent: number;
  tone: "warning" | "danger" | "success";
}) {
  const fillClass = {
    warning: "bg-amber-500",
    danger: "bg-rose-500",
    success: "bg-emerald-500",
  }[tone];
  const widthClass =
    percent <= 0
      ? "w-0"
      : percent <= 10
        ? "w-[10%]"
        : percent <= 20
          ? "w-[20%]"
          : percent <= 30
            ? "w-[30%]"
            : percent <= 40
              ? "w-[40%]"
              : percent <= 50
                ? "w-1/2"
                : percent <= 60
                  ? "w-[60%]"
                  : percent <= 70
                    ? "w-[70%]"
                    : percent <= 80
                      ? "w-[80%]"
                      : percent <= 90
                        ? "w-[90%]"
                        : "w-full";

  return (
    <div className="space-y-2 rounded-lg border border-stone-200 bg-white/80 p-3 dark:border-stone-800 dark:bg-stone-950/50">
      <div className="flex items-center justify-between gap-3 text-sm">
        <span className="font-medium text-stone-950 dark:text-stone-50">{label}</span>
        <span className="tabular-nums text-stone-500 dark:text-stone-400">{value}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
        <div className={cn("h-full rounded-full", fillClass, widthClass)} />
      </div>
    </div>
  );
}

