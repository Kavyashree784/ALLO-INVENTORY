import * as React from "react";

import { cn } from "@/lib/utils";

function Separator({ className, ...props }: React.ComponentProps<"div">) {
  return <div className={cn("h-px w-full bg-stone-200/90 dark:bg-stone-800/90", className)} {...props} />;
}

export { Separator };