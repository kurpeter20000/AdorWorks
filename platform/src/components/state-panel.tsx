import type { ReactNode } from "react";

const TONE_CLASS = {
  neutral: "border-slate/20 bg-white text-slate",
  info: "border-violet/25 bg-violet/5 text-slate",
  success: "border-teal/25 bg-teal/5 text-slate",
  danger: "border-coral/30 bg-coral/5 text-slate",
} as const;

export function StatePanel({
  title,
  children,
  tone = "neutral",
  role = "status",
}: {
  title: string;
  children: ReactNode;
  tone?: keyof typeof TONE_CLASS;
  role?: "status" | "alert";
}) {
  return (
    <section role={role} className={`rounded-xl border p-5 ${TONE_CLASS[tone]}`}>
      <h2 className="font-bold text-midnight">{title}</h2>
      <div className="mt-1 text-sm">{children}</div>
    </section>
  );
}
