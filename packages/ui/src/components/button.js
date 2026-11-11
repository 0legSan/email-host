import { jsx as _jsx } from "react/jsx-runtime";
import * as React from "react";
import { Slot } from "radix-ui";
import { cn } from "@workspace/ui/lib/utils";
import { buttonVariants } from "./button-variants";
function Button({ className, variant = "default", size = "default", asChild = false, ...props }) {
    const Comp = asChild ? Slot.Root : "button";
    return (_jsx(Comp, { "data-slot": "button", "data-variant": variant, "data-size": size, className: cn(buttonVariants({ variant, size, className })), ...props }));
}
export { Button };
//# sourceMappingURL=button.js.map