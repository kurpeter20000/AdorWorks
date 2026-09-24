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

// Same "Explore" language and icon as Explore Mode in the authenticated
// app's mode switcher (see mode-switcher.tsx), so a signed-out visitor and
// a signed-in user leaving the app both reach for the same affordance.
// A plain inline link now, not an absolutely-positioned pill — it used to
// be fixed to the viewport's top-right corner regardless of where the
// card ended up underneath it, which is exactly why it read as
// "misplaced" sitting right on top of the card at most viewport sizes.
// Paired with the brand wordmark like a real header instead, in normal
// document flow on both the desktop panel and the mobile top bar.
function ExploreLink({ className }: { className?: string }) {
  return (
    <a
      href={MARKETING_SITE_URL}
      className={`inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/10 px-4 py-2 text-sm font-semibold text-white backdrop-blur-sm transition-colors hover:bg-white/20 ${className ?? ""}`}
    >
      <Compass className="size-4" aria-hidden="true" />
      Explore AdorWorks
    </a>
  );
}

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex flex-1 flex-col overflow-hidden">
      {/* CI's Lighthouse run flagged LCP >2500ms on /login and /signup —
          the video's poster frame is the LCP element (and, under 768px,
          the PERMANENT background, since hero-video-background.tsx never
          starts playback there), but as a <video poster> rather than an
          <img>/next/image it got no priority hint and no early discovery.
          React 19 hoists any <link> rendered in the tree up into <head>,
          so this preload gets the browser fetching it before it would
          otherwise notice the <video> tag at all. */}
      <link rel="preload" as="image" href="/hero/hero-poster.jpg" fetchPriority="high" />
      {/* One shared background across the whole page — video on wider,
          motion-safe, non-Data-Saver connections (see hero-video-
          background.tsx), the poster frame everywhere else — with the
          same dark scrim the marketing site uses over its own hero photo
          (css/styles.css .hero-photo) so white text stays legible over
          any frame of the footage. */}
      <HeroVideoBackground className="absolute inset-0 -z-20 h-full w-full object-cover" />
      <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-b from-midnight/80 to-midnight/90" />

      <div className="relative z-0 flex items-center justify-between gap-3 px-6 py-4 text-white lg:hidden">
        <span className="text-lg font-extrabold">AdorWorks</span>
        <ExploreLink className="px-3 py-1.5 text-xs" />
      </div>

      <div className="relative z-0 flex flex-1 flex-col lg:flex-row">
        <div className="hidden flex-col justify-center py-16 text-white lg:flex lg:w-1/2 lg:px-16 xl:px-24">
          <div className="flex items-center justify-between">
            <span className="text-lg font-extrabold">AdorWorks</span>
            <ExploreLink />
          </div>

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
          <div className="w-full max-w-lg rounded-2xl bg-white p-10 shadow-2xl ring-1 ring-black/5">{children}</div>
        </div>
      </div>
    </div>
  );
}
