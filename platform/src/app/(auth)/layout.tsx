import { MARKETING_SITE_URL } from "@/lib/domain/marketingSite";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
      <a href={MARKETING_SITE_URL} className="text-sm font-semibold text-slate hover:text-midnight">
        &larr; Back to the AdorWorks website
      </a>
      <div className="w-full max-w-sm rounded-2xl border border-slate/15 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-center gap-2 font-extrabold text-midnight">
          <a href={MARKETING_SITE_URL} className="text-lg">
            AdorWorks
          </a>
        </div>
        {children}
      </div>
    </div>
  );
}
