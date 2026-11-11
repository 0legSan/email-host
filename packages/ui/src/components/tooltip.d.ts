import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
declare function TooltipProvider({ delayDuration, ...props }: React.ComponentProps<typeof TooltipPrimitive.Provider>): React.JSX.Element;
declare function Tooltip({ children, content, side, sideOffset, }: {
    children: React.ReactElement;
    content: React.ReactNode;
    side?: React.ComponentProps<typeof TooltipPrimitive.Content>["side"];
    sideOffset?: number;
}): React.JSX.Element;
export { Tooltip, TooltipProvider };
//# sourceMappingURL=tooltip.d.ts.map