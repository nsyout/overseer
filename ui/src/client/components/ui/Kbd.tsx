import { tv, type VariantProps } from "tailwind-variants";
import { forwardRef, type HTMLAttributes } from "react";

const kbd = tv({
  base: [
    "inline-flex items-center justify-center",
    "font-mono text-xs",
    "bg-surface-secondary text-text-muted",
    "border border-border rounded",
    "px-1.5 py-0.5 min-w-[1.5rem]",
    "shadow-[0_1px_0_0_var(--color-border)]",
  ],
  variants: {
    size: {
      sm: "text-[10px] px-1 py-0 min-w-[1.25rem]",
      md: "text-xs px-1.5 py-0.5 min-w-[1.5rem]",
      lg: "text-sm px-2 py-1 min-w-[2rem]",
    },
  },
  defaultVariants: {
    size: "md",
  },
});

type KbdVariants = VariantProps<typeof kbd>;

interface KbdProps extends HTMLAttributes<HTMLElement>, KbdVariants {}

export const Kbd = forwardRef<HTMLElement, KbdProps>(
  ({ className, size, ...props }, ref) => {
    return <kbd ref={ref} className={kbd({ size, className })} {...props} />;
  }
);

Kbd.displayName = "Kbd";
