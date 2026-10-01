"use client";

export function PrintButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="rounded-lg border border-slate/25 bg-white px-3 py-1.5 text-sm font-semibold text-midnight hover:border-teal"
    >
      Print or save as PDF
    </button>
  );
}
