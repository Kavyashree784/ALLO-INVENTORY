"use client";

type ToastTone = "success" | "error" | "info";

export type ToastMessage = {
  id: number;
  title: string;
  description?: string;
  tone?: ToastTone;
};

const toneClasses: Record<ToastTone, string> = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/40 dark:bg-emerald-950/30 dark:text-emerald-100",
  error: "border-red-200 bg-red-50 text-red-900 dark:border-red-900/40 dark:bg-red-950/30 dark:text-red-100",
  info: "border-stone-200 bg-white text-stone-900 dark:border-stone-800 dark:bg-stone-900 dark:text-stone-100",
};

export function ToastRegion({ toasts }: { toasts: ToastMessage[] }) {
  if (toasts.length === 0) {
    return null;
  }

  return (
    <div
      aria-live="polite"
      aria-atomic="true"
      className="pointer-events-none fixed inset-x-4 top-4 z-50 flex flex-col gap-2 sm:left-auto sm:right-4 sm:w-[22rem]"
    >
      {toasts.map((toast) => (
        <div
          key={toast.id}
          role="status"
          className={`rounded-xl border px-4 py-3 shadow-sm ${toneClasses[toast.tone ?? "info"]}`}
        >
          <p className="text-sm font-semibold">{toast.title}</p>
          {toast.description ? <p className="mt-1 text-xs opacity-90">{toast.description}</p> : null}
        </div>
      ))}
    </div>
  );
}