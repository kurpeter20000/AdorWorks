import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface CardProps extends HTMLAttributes<HTMLDivElement> {
  icon?: ReactNode;
}

export function Card({ icon, className, children, ...props }: CardProps) {
  return (
    <div
      className={cn("rounded-xl border border-slate/15 bg-white p-5 sm:p-6", className)}
      {...props}
    >
      {icon && <div className="mb-3 text-teal">{icon}</div>}
      {children}
    </div>
  );
}
