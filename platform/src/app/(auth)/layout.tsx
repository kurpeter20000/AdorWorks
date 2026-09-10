import { MARKETING_SITE_URL } from "@/lib/domain/marketingSite";
import { HeroVideoBackground } from "@/components/hero-video-background";

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
    <div className="relative isolate flex flex-1 flex-col overflow-hidden">
      {/* One shared background across the whole page — video on wider,
          motion-safe, non-Data-Saver connections (see hero-video-
          background.tsx), the poster frame everywhere else — with the
          same dark scrim the marketing site uses over its own hero photo
          (css/styles.css .hero-photo) so white text stays legible over
          any frame of the footage. */}
      <HeroVideoBackground className="absolute inset-0 -z-20 h-full w-full object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-midnight/80 to-midnight/90" />

      <div className="relative z-0 flex items-center justify-between px-6 py-4 text-white lg:hidden">
        <a href={MARKETING_SITE_URL} className="text-sm font-semibold text-white/85 hover:text-white">
          &larr; Back
        </a>
        <span className="text-lg font-extrabold">AdorWorks</span>
      </div>

      <div className="relative z-0 flex flex-1 flex-col lg:flex-row">
        <div className="hidden flex-col justify-between py-16 text-white lg:flex lg:w-1/2 lg:px-16 xl:px-24">
          <a href={MARKETING_SITE_URL} className="text-lg font-extrabold">
            AdorWorks
          </a>

          <div>
            <p className="text-4xl leading-snug font-extrabold">
              Talent found.
              <br />
              Work delivered.
            </p>
            <ul className="mt-8 max-w-md space-y-6">
              {VALUE_PROPS.map((item) => (
                <li key={item.title}>
                  <p className="font-bold text-teal">{item.title}</p>
                  <p className="mt-1 text-sm text-white/75">{item.body}</p>
                </li>
              ))}
            </ul>
          </div>

          <a href={MARKETING_SITE_URL} className="text-sm font-semibold text-white/70 hover:text-white">
            &larr; Back to the AdorWorks website
          </a>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10 sm:px-10 lg:w-1/2 lg:px-16 lg:py-16">
          <div className="w-full max-w-md rounded-2xl bg-white p-8 shadow-xl">{children}</div>
        </div>
      </div>
    </div>
  );
}
