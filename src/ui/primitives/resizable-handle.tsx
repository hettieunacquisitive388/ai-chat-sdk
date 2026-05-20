"use client";

import React from "react";
import * as ResizablePrimitive from "react-resizable-panels";
import { GripVertical } from "lucide-react";

export const ResizablePanelGroup = ResizablePrimitive.Group;
export const ResizablePanel = ResizablePrimitive.Panel;

export function ResizableHandle({
  className = "",
  withHandle = false,
  ...props
}: React.ComponentProps<typeof ResizablePrimitive.Separator> & {
  withHandle?: boolean;
}) {
  return (
    <ResizablePrimitive.Separator className={`ais-resizable-handle ${className}`} {...props}>
      {withHandle && (
        <div className="ais-resizable-handle-icon">
          <GripVertical size={12} />
        </div>
      )}
    </ResizablePrimitive.Separator>
  );
}
