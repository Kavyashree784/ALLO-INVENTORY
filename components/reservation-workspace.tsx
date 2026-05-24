"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import { ApiClientError } from "@/lib/api-client";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { OperationsShell, type OperationsMetric } from "@/components/operations-shell";
import { useToast } from "@/app/providers";
import { useConfirmReservation, useReleaseReservation, useReservation } from "@/hooks/use-reservation";

function formatRemaining(ms: number) {
  const safeMs = Math.max(0, ms);
  const totalSeconds = Math.ceil(safeMs / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, "0")}:${seconds.toString().padStart(2, "0")}`;
}

function formatSku(id: string) {
  return `SKU-${id.replace(/[^a-zA-Z0-9]/g, "").slice(0, 8).toUpperCase()}`;
}

function formatTimestamp(value: string) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

type TimelineTone = "complete" | "current" | "pending" | "problem";

export function ReservationWorkspace({ reservationId }: { reservationId: string }) {
  const router = useRouter();
  const reservationQuery = useReservation(reservationId);
  const confirmMutation = useConfirmReservation(reservationId);
  const releaseMutation = useReleaseReservation(reservationId);
  const { showToast } = useToast();
  const [now, setNow] = useState(() => Date.now());
  const actionLockRef = useRef(false);

  useEffect(() => {
    const interval = window.setInterval(() => {
      setNow(Date.now());
    }, 1000);

    return () => window.clearInterval(interval);
  }, []);

  const reservation = reservationQuery.data;

  const expiresAtMs = reservation ? new Date(reservation.expiresAt).getTime() : 0;
  const createdAtMs = reservation ? new Date(reservation.createdAt).getTime() : 0;
  const remainingMs = useMemo(() => Math.max(0, expiresAtMs - now), [expiresAtMs, now]);
  const totalLifetimeMs = Math.max(1, expiresAtMs - createdAtMs);
  const elapsedLifetimeMs = Math.min(totalLifetimeMs, Math.max(0, now - createdAtMs));
  const progressPercent = Math.min(100, Math.max(0, Math.round((elapsedLifetimeMs / totalLifetimeMs) * 100)));
  const isExpiredByTimer = remainingMs <= 0;
  const isExpired = Boolean(reservation && (reservation.lifecycleState === "EXPIRED" || isExpiredByTimer));
  const isActionPending = confirmMutation.isPending || releaseMutation.isPending;

  useEffect(() => {
    if (!reservation || reservation.lifecycleState !== "PENDING") {
      return;
    }

    if (remainingMs > 0) {
      return;
    }

    void reservationQuery.refetch();
  }, [remainingMs, reservation, reservationQuery]);

  if (reservationQuery.isLoading) {
    return <ReservationSkeleton />;
  }

  if (reservationQuery.error) {
    return <ReservationErrorState error={reservationQuery.error} onRetry={() => reservationQuery.refetch()} onBack={() => router.push("/")} />;
  }

  if (!reservation) {
    return <ReservationErrorState error={new Error("Reservation not found.")} onRetry={() => reservationQuery.refetch()} onBack={() => router.push("/")} />;
  }

  const metrics: OperationsMetric[] = [
    { label: "State", value: reservation.lifecycleState, detail: reservation.status === "CONFIRMED" ? "Payment captured" : "Hold still active", tone: reservation.lifecycleState === "EXPIRED" ? "danger" : reservation.status === "CONFIRMED" ? "success" : "warning" },
    { label: "Stock held", value: reservation.quantity.toString(), detail: `${reservation.inventory.product.name}` },
    { label: "Availability", value: reservation.inventory.availableQuantity.toString(), detail: `${reservation.inventory.reservedQuantity.toString()} reserved in this inventory row` },
    { label: "Expiry", value: isExpired ? "Expired" : formatRemaining(remainingMs), detail: `Ends at ${new Date(reservation.expiresAt).toLocaleTimeString()}`, tone: isExpired ? "danger" : "neutral" },
  ];

  const timeline = buildTimeline(reservation);

  return (
    <OperationsShell
      title="Reservation workspace"
      description="Review a live hold, watch the countdown, confirm payment, or release stock back to inventory."
      statusLabel={reservation.lifecycleState === "EXPIRED" ? "Hold expired" : reservation.status === "CONFIRMED" ? "Payment captured" : "Hold pending"}
      statusTone={reservation.lifecycleState === "EXPIRED" ? "danger" : reservation.status === "CONFIRMED" ? "success" : "warning"}
      navLinks={[
        { href: "/", label: "Inventory" },
        { href: "#summary", label: "Summary", active: true },
        { href: "#timeline", label: "Timeline" },
        { href: "#inventory", label: "Inventory" },
      ]}
      metrics={metrics}
      actions={
        <>
          <Button variant="outline" size="sm" onClick={() => reservationQuery.refetch()}>
            Refresh status
          </Button>
          <Button variant="secondary" size="sm" onClick={() => router.push("/")}>
            Back to inventory
          </Button>
        </>
      }
    >
      <section className="grid gap-5 lg:grid-cols-[1fr_0.82fr]" id="summary">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center gap-2">
              <CardTitle>Reservation {formatSku(reservation.id)}</CardTitle>
              <Badge className="bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200">{reservation.inventory.warehouse.name}</Badge>
              <Badge
                className={cn(
                  "border",
                  reservation.lifecycleState === "EXPIRED"
                    ? "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200"
                    : reservation.status === "CONFIRMED"
                      ? "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200"
                      : "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200"
                )}
              >
                {reservation.lifecycleState}
              </Badge>
            </div>
            <CardDescription>Review the hold, payment state, and inventory mutation before taking action.</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 sm:grid-cols-2">
            <StateBlock label="Product" value={reservation.inventory.product.name} />
            <StateBlock label="Warehouse" value={`${reservation.inventory.warehouse.name} · ${reservation.inventory.warehouse.location}`} />
            <StateBlock label="Quantity" value={reservation.quantity.toString()} />
            <StateBlock label="Payment state" value={reservation.status === "CONFIRMED" ? "Captured" : isExpired ? "Expired" : "Pending authorization"} tone={reservation.status === "CONFIRMED" ? "success" : isExpired ? "danger" : "warning"} />
            <StateBlock label="Reservation ID" value={reservation.id} />
            <StateBlock label="Expiry time" value={formatTimestamp(reservation.expiresAt)} tone={isExpired ? "danger" : "neutral"} />
          </CardContent>
          <CardFooter className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-stretch">
            <Button
              className="w-full min-w-0"
              onClick={async () => {
                if (actionLockRef.current) {
                  return;
                }

                actionLockRef.current = true;

                try {
                  await confirmMutation.mutateAsync();
                  showToast({ tone: "success", title: "Reservation confirmed" });
                } catch (mutationError) {
                  showToast({
                    tone: "error",
                    title: "Unable to confirm reservation",
                    description: mutationError instanceof ApiClientError ? mutationError.message : "Try again in a moment.",
                  });
                } finally {
                  actionLockRef.current = false;
                }
              }}
              aria-busy={confirmMutation.isPending}
              disabled={isActionPending || isExpired || reservation.status === "CONFIRMED"}
            >
              {confirmMutation.isPending ? "Confirming..." : reservation.status === "CONFIRMED" ? "Confirmed" : "Confirm Purchase"}
            </Button>
            <Button
              variant="outline"
              className="w-full sm:w-auto"
              onClick={async () => {
                if (actionLockRef.current) {
                  return;
                }

                actionLockRef.current = true;

                try {
                  await releaseMutation.mutateAsync();
                  showToast({ tone: "info", title: "Reservation released" });
                } catch (mutationError) {
                  showToast({
                    tone: "error",
                    title: "Unable to release reservation",
                    description: mutationError instanceof ApiClientError ? mutationError.message : "Try again in a moment.",
                  });
                } finally {
                  actionLockRef.current = false;
                }
              }}
              aria-busy={releaseMutation.isPending}
              disabled={isActionPending || reservation.status === "CONFIRMED"}
            >
              {releaseMutation.isPending ? "Releasing..." : reservation.status === "RELEASED" ? "Released" : "Release Reservation"}
            </Button>
          </CardFooter>
          {confirmMutation.error || releaseMutation.error ? (
            <div role="alert" className="mx-4 mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100 sm:mx-5 sm:mb-5">
              {(confirmMutation.error ?? releaseMutation.error) instanceof ApiClientError
                ? (confirmMutation.error ?? releaseMutation.error)?.message
                : "Unable to update reservation."}
            </div>
          ) : null}
          <Separator />
          <CardContent id="inventory">
            <div className="grid gap-3 sm:grid-cols-3">
              <StateBlock label="Inventory total" value={reservation.inventory.totalQuantity.toString()} tone="neutral" compact />
              <StateBlock label="Reserved" value={reservation.inventory.reservedQuantity.toString()} tone="warning" compact />
              <StateBlock label="Available" value={reservation.inventory.availableQuantity.toString()} tone="success" compact />
            </div>
            <div className="mt-4 space-y-2 rounded-lg border border-stone-200 bg-stone-50 p-3 dark:border-stone-800 dark:bg-stone-900/50">
                  <div className="flex items-center justify-between gap-3 text-sm text-stone-600 dark:text-stone-400">
                    <span className="font-medium">Lifecycle progress</span>
                    <span className="font-medium">{progressPercent}%</span>
                  </div>
              <div className="h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800">
                <div className={cn("h-full rounded-full", isExpired ? "bg-rose-500" : reservation.status === "CONFIRMED" ? "bg-emerald-500" : "bg-amber-500")} style={{ width: `${progressPercent}%` }} />
              </div>
                  <p className="text-sm leading-5 text-stone-600 dark:text-stone-300">
                    Created {formatTimestamp(reservation.createdAt)} · Expires {formatTimestamp(reservation.expiresAt)}
                  </p>
            </div>
          </CardContent>
        </Card>

        <div className="space-y-5">
          <Card id="timeline">
            <CardHeader>
              <CardTitle>Lifecycle timeline</CardTitle>
              <CardDescription>Compact state history for the hold and payment path.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {timeline.map((step, index) => (
                <TimelineRow key={step.label} step={step} index={index} last={index === timeline.length - 1} />
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Countdown</CardTitle>
              <CardDescription>Expires at {new Date(reservation.expiresAt).toLocaleTimeString()}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className={cn("rounded-xl border px-4 py-4", isExpired ? "border-rose-200 bg-rose-50 dark:border-rose-900/50 dark:bg-rose-950/30" : "border-emerald-200 bg-emerald-50 dark:border-emerald-900/50 dark:bg-emerald-950/30")}>
                <p className="text-sm font-semibold text-stone-600 dark:text-stone-400">Time remaining</p>
                <div className={cn("mt-2 text-4xl font-semibold tracking-tight tabular-nums", isExpired ? "text-rose-700 dark:text-rose-200" : "text-emerald-700 dark:text-emerald-200")}>
                  {isExpired ? "00:00" : formatRemaining(remainingMs)}
                </div>
                <p className="mt-2 text-sm leading-6 text-stone-600 dark:text-stone-300">
                  {isExpired ? "The hold has expired and can no longer be confirmed." : "The timer is derived from the server-issued expiry timestamp and updates every second."}
                </p>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      {reservation.lifecycleState === "EXPIRED" ? (
        <Card className="border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-100">
          <CardHeader>
            <CardTitle>Reservation expired</CardTitle>
            <CardDescription className="text-amber-900/80 dark:text-amber-100/80">
              The hold is no longer confirmable. Cleanup can reclaim the inventory row if it has not already been released.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}
    </OperationsShell>
  );
}

function ReservationSkeleton() {
  return (
    <OperationsShell
      title="Reservation workspace"
      description="Loading the reservation and inventory snapshot."
      statusLabel="Loading reservation"
      statusTone="neutral"
      navLinks={[
        { href: "/", label: "Inventory" },
        { href: "#summary", label: "Summary", active: true },
        { href: "#timeline", label: "Timeline" },
        { href: "#inventory", label: "Inventory" },
      ]}
      metrics={[]}
    >
      <div className="grid gap-5 lg:grid-cols-[1fr_0.82fr]">
        <div className="h-96 animate-pulse rounded-xl border border-stone-200 bg-white/80 dark:border-stone-800 dark:bg-stone-900/80" />
        <div className="space-y-5">
          <div className="h-60 animate-pulse rounded-xl border border-stone-200 bg-white/80 dark:border-stone-800 dark:bg-stone-900/80" />
          <div className="h-44 animate-pulse rounded-xl border border-stone-200 bg-white/80 dark:border-stone-800 dark:bg-stone-900/80" />
        </div>
      </div>
    </OperationsShell>
  );
}

function ReservationErrorState({ error, onRetry, onBack }: { error: Error; onRetry: () => void; onBack: () => void }) {
  return (
    <OperationsShell
      title="Reservation workspace"
      description="We could not load the reservation record."
      statusLabel="Reservation error"
      statusTone="danger"
      navLinks={[
        { href: "/", label: "Inventory", active: true },
        { href: "#summary", label: "Summary" },
        { href: "#timeline", label: "Timeline" },
      ]}
      metrics={[]}
    >
      <Card className="border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/40 dark:bg-rose-950/30 dark:text-rose-100">
        <CardHeader>
          <CardTitle>Unable to load reservation</CardTitle>
          <CardDescription className="text-rose-900/80 dark:text-rose-100/80">{error.message}</CardDescription>
        </CardHeader>
        <CardFooter className="flex flex-col gap-3 sm:flex-row">
          <Button onClick={onRetry}>Retry Reservation</Button>
          <Button onClick={onBack}>Return to inventory</Button>
        </CardFooter>
      </Card>
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
    <div className={cn("rounded-md border px-3 py-2", toneClasses[tone], compact ? "min-h-14" : "min-h-18")}>
      <p className="text-sm font-semibold text-current/70">{label}</p>
      <p className={cn("mt-1 font-medium leading-5", compact ? "text-sm" : "text-base")}>{value}</p>
    </div>
  );
}

function TimelineRow({
  step,
  index,
  last,
}: {
  step: { label: string; description: string; tone: TimelineTone; timestamp: string; detail: string };
  index: number;
  last: boolean;
}) {
  const toneClasses = {
    complete: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-100",
    current: "border-stone-900 bg-stone-950 text-white dark:border-stone-50 dark:bg-stone-50 dark:text-stone-950",
    pending: "border-stone-200 bg-stone-50 text-stone-700 dark:border-stone-800 dark:bg-stone-900/50 dark:text-stone-300",
    problem: "border-rose-200 bg-rose-50 text-rose-900 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-100",
  } as const;

  return (
    <div className="flex gap-3">
      <div className="flex flex-col items-center pt-1">
        <div className={cn("flex h-6 w-6 items-center justify-center rounded-full border text-[10px] font-semibold", toneClasses[step.tone])}>{index + 1}</div>
        {!last ? <div className="mt-2 h-full w-px bg-stone-200 dark:bg-stone-800" /> : null}
      </div>
      <div className={cn("flex-1 rounded-lg border px-3 py-2", toneClasses[step.tone])}>
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold">{step.label}</p>
          <Badge className="text-xs bg-transparent px-2 py-0.5 text-current/75">{step.timestamp}</Badge>
        </div>
        <p className="mt-1 text-sm leading-6 text-current/80">{step.description}</p>
        <p className="mt-1 text-xs uppercase tracking-[0.18em] text-current/65">{step.detail}</p>
      </div>
    </div>
  );
}

function buildTimeline(reservation: {
  lifecycleState: string;
  status: string;
  createdAt: string;
  confirmedAt: string | null;
  releasedAt: string | null;
  expiresAt: string;
}) {
  const isExpired = reservation.lifecycleState === "EXPIRED";
  const isConfirmed = reservation.status === "CONFIRMED";

  return [
    {
      label: "Reservation created",
      description: "Stock is locked in the selected warehouse row.",
      tone: "complete" as const,
      timestamp: formatTimestamp(reservation.createdAt),
      detail: "hold opened",
    },
    {
      label: "Payment review",
      description: "The hold is waiting for confirm or release.",
      tone: isExpired ? ("problem" as const) : isConfirmed ? ("complete" as const) : ("current" as const),
      timestamp: reservation.confirmedAt ? formatTimestamp(reservation.confirmedAt) : isExpired ? formatTimestamp(reservation.expiresAt) : formatTimestamp(reservation.createdAt),
      detail: isExpired ? "expired" : isConfirmed ? "payment captured" : "active hold",
    },
    {
      label: "Payment captured",
      description: "Reservation is fully confirmed and no longer releasable.",
      tone: isConfirmed ? ("complete" as const) : isExpired ? ("pending" as const) : ("current" as const),
      timestamp: reservation.confirmedAt ? formatTimestamp(reservation.confirmedAt) : "Pending",
      detail: isConfirmed ? "confirmed" : "awaiting purchase",
    },
    {
      label: "Cleanup / release",
      description: "Expired holds are reclaimed automatically or released manually.",
      tone: isExpired || reservation.lifecycleState === "RELEASED" ? ("problem" as const) : ("pending" as const),
      timestamp: reservation.releasedAt ? formatTimestamp(reservation.releasedAt) : formatTimestamp(reservation.expiresAt),
      detail: reservation.releasedAt ? "released" : isExpired ? "expired hold" : "scheduled",
    },
  ];
}
