import { OnboardingNav } from "./onboarding-nav";

export default function OnboardingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl p-6 sm:p-8">
      <OnboardingNav />
      {children}
    </div>
  );
}
