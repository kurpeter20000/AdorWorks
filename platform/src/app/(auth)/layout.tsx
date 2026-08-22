export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-2xl border border-slate/15 bg-white p-8 shadow-sm">
        <div className="mb-6 flex items-center justify-center gap-2 font-extrabold text-midnight">
          <span className="text-lg">AdorWorks</span>
        </div>
        {children}
      </div>
    </div>
  );
}
