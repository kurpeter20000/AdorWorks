import { Compass } from "lucide-react";
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

      {/* One clean, standard way back to the marketing site — same
          "Explore" language and icon as Explore Mode in the authenticated
          app's mode switcher (see mode-switcher.tsx), so a signed-out
          visitor and a signed-in user leaving the app both reach for the
          same affordance. Fixed in the corner rather than buried at the
          end of the value-prop list, and shared by mobile and desktop
          instead of two different back links. */}
      <a
        href={MARKETING_SITE_URL}
        className="absolute top-4 right-4 z-10 inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20 sm:top-6 sm:right-6"
      >
        <Compass className="size-4" aria-hidden="true" />
        Explore AdorWorks
      </a>

      <div className="relative z-0 flex items-center px-6 py-4 text-white lg:hidden">
        <span className="text-lg font-extrabold">AdorWorks</span>
      </div>

      <div className="relative z-0 flex flex-1 flex-col lg:flex-row">
        <div className="hidden flex-col justify-center py-16 text-white lg:flex lg:w-1/2 lg:px-16 xl:px-24">
          <span className="text-lg font-extrabold">AdorWorks</span>

          <div className="mt-10">
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
        </div>

        <div className="flex flex-1 flex-col items-center justify-center px-6 pb-10 sm:px-10 lg:w-1/2 lg:px-16 lg:py-16">
          <div className="w-full max-w-lg rounded-2xl bg-white p-10 shadow-xl">{children}</div>
        </div>
      </div>
    </div>
  );
}
