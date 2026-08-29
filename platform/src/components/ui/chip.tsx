import type { AnchorHTMLAttributes } from "react";
import { ArrowRight } from "lucide-react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const chipVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-colors",
  {
    variants: {
      variant: {
        // For use over a photo/hero background.
        onPhoto: "bg-midnight/50 text-white backdrop-blur-sm hover:bg-midnight/65",
        // For use on a plain white/cloud surface.
        plain: "bg-cloud text-midnight hover:bg-slate/15",
      },
    },
    defaultVariants: { variant: "plain" },
  }
);

export interface ChipProps
  extends AnchorHTMLAttributes<HTMLAnchorElement>,
    VariantProps<typeof chipVariants> {
  arrow?: boolean;
}

export function Chip({ variant, arrow = true, className, children, ...props }: ChipProps) {
  return (
    <a className={cn(chipVariants({ variant }), className)} {...props}>
      {children}
      {arrow && <ArrowRight className="size-3.5" aria-hidden="true" />}
    </a>
  );
}
