import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import * as React from "react";
import { Tooltip as TooltipPrimitive } from "radix-ui";
import { cn } from "@workspace/ui/lib/utils";
function TooltipProvider({ delayDuration = 350, ...props }) {
    return (_jsx(TooltipPrimitive.Provider, { "data-slot": "tooltip-provider", delayDuration: delayDuration, ...props }));
}
function Tooltip({ children, content, side = "top", sideOffset = 8, }) {
    return (_jsxs(TooltipPrimitive.Root, { children: [_jsx(TooltipPrimitive.Trigger, { asChild: true, children: children }), _jsx(TooltipPrimitive.Portal, { children: _jsx(TooltipPrimitive.Content, { className: cn("z-50 max-w-64 rounded-md border border-[#d8dee5] bg-white px-2.5 py-1.5 text-xs leading-tight font-semibold text-[#20252a] shadow-[0_8px_24px_rgba(16,24,32,0.16)]", "data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[side=bottom]:slide-in-from-top-1 data-[side=top]:slide-in-from-bottom-1", "dark:border-[#30353a] dark:bg-[#20252a] dark:text-[#eef2f4]"), side: side, sideOffset: sideOffset, children: content }) })] }));
}
export { Tooltip, TooltipProvider };
//# sourceMappingURL=tooltip.js.map