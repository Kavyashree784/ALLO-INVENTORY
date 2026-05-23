import * as React from "react";

import { cn } from "@/lib/utils";

function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium uppercase tracking-[0.18em]",
        "border-transparent bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-200",
        className
      )}
      {...props}
    />
  );
}

export { Badge };