import * as React from "react";

import { cn } from "@/lib/utils";

function Input({ className, type = "text", ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      className={cn(
        "flex h-8 w-full rounded-md border border-stone-200 bg-white px-2.5 text-sm text-stone-950 outline-none transition focus-visible:border-stone-500 focus-visible:ring-2 focus-visible:ring-stone-500/10 disabled:cursor-not-allowed disabled:opacity-60 dark:border-stone-700 dark:bg-stone-950 dark:text-stone-50",
        className
      )}
      {...props}
    />
  );
}

export { Input };