const STEPS = [
  { href: "/onboarding/basics", label: "Basics" },
  { href: "/onboarding/verification", label: "Verification" },
  { href: "/onboarding/review", label: "Review & publish" },
];

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl p-6 sm:p-8">
      <nav aria-label="Onboarding steps" className="mb-6 flex gap-2 text-xs font-semibold text-slate">
        {STEPS.map((step, i) => (
          <span key={step.href} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden="true">&rarr;</span>}
            {step.label}
          </span>
        ))}
      </nav>
      {children}
    </div>
  );
}
