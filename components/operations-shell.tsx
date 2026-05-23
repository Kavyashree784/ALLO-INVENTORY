"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type OperationsMetric = {
  label: string;
  value: string;
  detail?: string;
  tone?: "neutral" | "success" | "warning" | "danger";
};

export type OperationsNavLink = {
  href: string;
  label: string;
  active?: boolean;
};

type OperationsShellProps = {
  title: string;
  description: string;
  statusLabel: string;
  statusTone?: "neutral" | "success" | "warning" | "danger";
  navLinks: OperationsNavLink[];
  metrics: OperationsMetric[];
  actions?: React.ReactNode;
  children: React.ReactNode;
};

const statusToneClasses: Record<NonNullable<OperationsShellProps["statusTone"]>, string> = {
  neutral: "border-stone-200 bg-stone-100 text-stone-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-200",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-200",
  warning: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200",
  danger: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-200",
};

const metricToneClasses: Record<NonNullable<OperationsMetric["tone"]>, string> = {
  neutral: "border-stone-200 bg-white/90 text-stone-950 dark:border-stone-800 dark:bg-stone-950/80 dark:text-stone-50",
  success: "border-emerald-200 bg-emerald-50 text-emerald-950 dark:border-emerald-900/50 dark:bg-emerald-950/30 dark:text-emerald-50",
  warning: "border-amber-200 bg-amber-50 text-amber-950 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-50",
  danger: "border-rose-200 bg-rose-50 text-rose-950 dark:border-rose-900/50 dark:bg-rose-950/30 dark:text-rose-50",
};

export function OperationsShell({
  title,
  description,
  statusLabel,
  statusTone = "success",
  navLinks,
  metrics,
  actions,
  children,
}: OperationsShellProps) {
  const pathname = usePathname();
  const defaultActiveHref = useMemo(() => navLinks.find((link) => link.active)?.href ?? navLinks[0]?.href ?? "", [navLinks]);
  const [currentHash, setCurrentHash] = useState(defaultActiveHref.startsWith("#") ? defaultActiveHref : "");

  useEffect(() => {
    const updateHash = () => {
      setCurrentHash(window.location.hash);
    };

    updateHash();
    window.addEventListener("hashchange", updateHash);

    return () => window.removeEventListener("hashchange", updateHash);
  }, []);

  const resolvedCurrentHash = currentHash || defaultActiveHref;
  const renderNavLink = (link: OperationsNavLink) => {
    const isPathLink = !link.href.startsWith("#");
    const isActive = link.active || (isPathLink ? pathname === link.href : resolvedCurrentHash === link.href);

    return (
      <Link
        key={link.href}
        href={link.href}
        className={cn(
          "rounded-md border px-3 py-2 text-xs font-medium uppercase tracking-[0.18em] transition-colors",
          isActive
            ? "border-stone-950 bg-stone-950 text-white dark:border-stone-50 dark:bg-stone-50 dark:text-stone-950"
            : "border-stone-200 bg-white text-stone-600 hover:border-stone-400 hover:text-stone-950 dark:border-stone-800 dark:bg-stone-950/60 dark:text-stone-300 dark:hover:border-stone-600 dark:hover:text-stone-50"
        )}
        aria-current={isActive ? "page" : undefined}
      >
        {link.label}
      </Link>
    );
  };

  return (
    <main className="min-h-screen bg-[linear-gradient(180deg,rgba(248,250,252,0.98),rgba(241,245,249,0.92))] text-stone-950 dark:bg-[linear-gradient(180deg,rgba(15,23,42,0.98),rgba(9,9,11,0.98))] dark:text-stone-50">
      <div className="mx-auto flex w-full max-w-7xl flex-col gap-5 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
        <header className="space-y-4 border-b border-stone-200/80 pb-4 dark:border-stone-800">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl border border-stone-300 bg-stone-950 text-sm font-semibold tracking-[0.24em] text-white dark:border-stone-700 dark:bg-stone-50 dark:text-stone-950">
                  AL
                </div>
                <div className="space-y-0.5">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.28em] text-stone-500 dark:text-stone-400">Allo Inventory</p>
                  <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
                </div>
              </div>
              <p className="max-w-3xl text-sm leading-6 text-stone-600 dark:text-stone-400">{description}</p>
            </div>
            <div className="flex flex-col items-start gap-2 lg:items-end">
              <Badge className={cn("rounded-md border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.22em]", statusToneClasses[statusTone])}>
                {statusLabel}
              </Badge>
              {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
            </div>
          </div>

          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <nav className="flex flex-wrap gap-2" aria-label="Sections">
              {navLinks.map(renderNavLink)}
            </nav>
            <div className="flex items-center gap-2 text-xs text-stone-500 dark:text-stone-400">
              <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 dark:border-stone-800 dark:bg-stone-950/70">Local API live</span>
              <span className="rounded-full border border-stone-200 bg-white px-2.5 py-1 dark:border-stone-800 dark:bg-stone-950/70">Refresh-safe queries</span>
            </div>
          </div>

          {metrics.length ? (
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Operational metrics">
              {metrics.map((metric) => (
                <div key={metric.label} className={cn("rounded-xl border px-4 py-3 shadow-sm", metricToneClasses[metric.tone ?? "neutral"])}>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-current/60">{metric.label}</p>
                  <div className="mt-2 flex items-end justify-between gap-3">
                    <p className="text-lg font-semibold leading-none tracking-tight">{metric.value}</p>
                  </div>
                  {metric.detail ? <p className="mt-2 text-xs leading-5 text-current/70">{metric.detail}</p> : null}
                </div>
              ))}
            </section>
          ) : null}
        </header>

        <div className="space-y-5">{children}</div>
      </div>
    </main>
  );
}

export function OperationsSectionHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 border-b border-stone-200/80 pb-3 sm:flex-row sm:items-end sm:justify-between dark:border-stone-800">
      <div className="space-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.24em] text-stone-500 dark:text-stone-400">{eyebrow}</p>
        <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-stone-900 dark:text-stone-50">{title}</h2>
        {description ? <p className="max-w-2xl text-sm leading-6 text-stone-600 dark:text-stone-400">{description}</p> : null}
      </div>
      {action ? <div className="flex items-center gap-2">{action}</div> : null}
    </div>
  );
}
