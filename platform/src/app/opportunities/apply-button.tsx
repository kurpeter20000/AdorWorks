import Link from "next/link";

export function ApplyButton({
  opportunityId,
  alreadyApplied,
}: {
  opportunityId: string;
  alreadyApplied: boolean;
}) {
  if (alreadyApplied) {
    return <span className="text-xs font-semibold text-slate">Applied</span>;
  }

  return (
    <Link
      href={`/opportunities/${opportunityId}/apply`}
      className="rounded-lg bg-teal px-3 py-1.5 text-sm font-bold text-midnight"
    >
      Apply
    </Link>
  );
}
