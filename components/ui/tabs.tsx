"use client";

import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/ui";

export const Tabs = TabsPrimitive.Root;
export const TabsContent = TabsPrimitive.Content;

export function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
  return <TabsPrimitive.List className={cn("flex items-center gap-1 overflow-x-auto border-b border-(--color-line) [scrollbar-width:none] [&::-webkit-scrollbar]:hidden", className)} {...props} />;
}

export function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        "-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm font-medium text-zinc-500 transition-colors hover:text-zinc-800",
        "data-[state=active]:border-(--color-brand) data-[state=active]:text-zinc-900 [&_svg]:size-4",
        className
      )}
      {...props}
    />
  );
}
