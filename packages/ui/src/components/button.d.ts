import * as React from "react";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "./button-variants";
declare function Button({ className, variant, size, asChild, ...props }: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
}): React.JSX.Element;
export { Button };
//# sourceMappingURL=button.d.ts.map