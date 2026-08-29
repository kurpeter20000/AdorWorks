import type { StateDefinition, StatusTone } from "@/lib/domain/states";

const TONE_CLASS: Record<StatusTone, string> = {
  neutral: "bg-slate/10 text-slate",
  info: "bg-violet/10 text-violet",
  warning: "bg-coral/10 text-coral-ink",
  success: "bg-teal/10 text-teal-ink",
  danger: "bg-coral/10 text-coral-ink",
};

export function StatusBadge({
  state,
  className = "",
}: {
  state: StateDefinition;
  className?: string;
}) {
  return (
    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${TONE_CLASS[state.tone]} ${className}`.trim()}>
      {state.label}
    </span>
  );
}
