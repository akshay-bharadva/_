import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

/**
 * v3 controls.
 *
 * Changes from v2: the control radius token instead of `rounded-lg` (so shape
 * stays distinct from surfaces), the shared 220ms enter curve instead of a
 * 300ms all-property transition, and elevation rather than a border to lift
 * the outline variant off the ground.
 *
 * `overflow-hidden` is dropped — it clipped focus rings on buttons that sit
 * flush against a container edge.
 */
const buttonVariants = cva(
  "relative inline-flex items-center justify-center whitespace-nowrap rounded-control text-sm font-medium ring-offset-background transition-[background-color,box-shadow,transform,color] duration-200 ease-enter focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 motion-reduce:transition-none",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground shadow-e1 hover:shadow-e2 hover:-translate-y-0.5 motion-reduce:hover:translate-y-0",
        destructive:
          "bg-destructive text-destructive-foreground shadow-e1 hover:bg-destructive/90 hover:shadow-e2",
        outline:
          "bg-card text-foreground shadow-e1 hover:-translate-y-0.5 hover:text-primary hover:shadow-e2 motion-reduce:hover:translate-y-0",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/70",
        ghost: "hover:bg-secondary hover:text-secondary-foreground",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-12 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
