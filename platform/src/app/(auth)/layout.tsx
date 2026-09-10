import { MARKETING_SITE_URL } from "@/lib/domain/marketingSite";

// Same three value props on both sides of the marketplace — the auth
// pages are the one place login/signup for talent and employers share a
// single shell, so the copy here stays intentionally role-neutral rather
// than picking a side.
const VALUE_PROPS = [
  {
    title: "Fair-ranked matching",
    body: "Opportunities and candidates surfaced by skill overlap — never by who pays more.",
  },
  {
    title: "Built-in escrow",
    body: "Milestone payments held safely until work is approved, both sides protected.",
  },
  {
    title: "Verified from day one",
    body: "Every profile carries a visible trust tier, so credibility is never just a claim.",
  },
];

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col lg:flex-row">
      <aside className="relative hidden overflow-hidden bg-midnight px-10 py-12 text-white lg:flex lg:w-[44%] lg:flex-col lg:justify-between xl:w-2/5">
        <div aria-hidden className="pointer-events-none absolute -top-24 -left-24 size-72 rounded-full bg-teal/25 blur-3xl" />
        <div aria-hidden className="pointer-events-none absolute -right-16 -bottom-32 size-80 rounded-full bg-violet/30 blur-3xl" />

        <a href={MARKETING_SITE_URL} className="relative text-lg font-extrabold">
          AdorWorks
        </a>

        <div className="relative">
          <p className="text-2xl leading-snug font-extrabold">
            Talent found.
            <br />
            Work delivered.
          </p>
          <ul className="mt-8 space-y-6">
            {VALUE_PROPS.map((item) => (
              <li key={item.title}>
                <p className="font-bold text-teal">{item.title}</p>
                <p className="mt-1 text-sm text-white/70">{item.body}</p>
              </li>
            ))}
          </ul>
        </div>

        <a href={MARKETING_SITE_URL} className="relative text-sm font-semibold text-white/70 hover:text-white">
          &larr; Back to the AdorWorks website
        </a>
      </aside>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 p-6">
        <div className="flex w-full max-w-sm items-center justify-between lg:hidden">
          <a href={MARKETING_SITE_URL} className="text-sm font-semibold text-slate hover:text-midnight">
            &larr; Back
          </a>
          <span className="text-lg font-extrabold text-midnight">AdorWorks</span>
        </div>

        <div className="w-full max-w-sm rounded-2xl border border-slate/15 bg-white p-8 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
