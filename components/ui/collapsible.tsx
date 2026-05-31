"use client"

import * as CollapsiblePrimitive from "@radix-ui/react-collapsible"

import { CollapsibleTrigger } from "@/components/ui/collapsible-trigger"
import { CollapsibleContent } from "@/components/ui/collapsible-content"

function Collapsible({
  ...props
}: React.ComponentProps<typeof CollapsiblePrimitive.Root>) {
  return <CollapsiblePrimitive.Root data-slot="collapsible" {...props} />
}

export { Collapsible, CollapsibleTrigger, CollapsibleContent }
