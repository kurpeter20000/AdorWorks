import Link from "next/link";
import { StatePanel } from "@/components/state-panel";

export default function NotFound() {
  return (
    <main className="mx-auto max-w-2xl p-8">
      <StatePanel title="Page not found">
        <p>The page may have moved, or your account may not have access to it.</p>
        <Link href="/dashboard" className="mt-4 inline-block font-semibold text-teal-ink underline">
          Return to your dashboard
        </Link>
      </StatePanel>
    </main>
  );
}
