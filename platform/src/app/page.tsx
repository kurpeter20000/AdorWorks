import Link from "next/link";
import { redirect } from "next/navigation";
import { verifySession } from "@/lib/dal/session";

export default async function Home() {
  const session = await verifySession();
  if (session && session.status === "active") {
    redirect("/dashboard");
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center p-8 text-center">
      <h1 className="text-3xl font-extrabold text-midnight">AdorWorks Platform</h1>
      <p className="mt-2 max-w-md text-slate">
        Talent found. Work delivered. Sign in to your account or create a new
        one to get started.
      </p>
      <div className="mt-6 flex gap-3">
        <Link
          href="/login"
          className="rounded-lg bg-teal px-5 py-2.5 text-sm font-bold text-midnight"
        >
          Sign in
        </Link>
        <Link
          href="/signup"
          className="rounded-lg border border-slate/30 px-5 py-2.5 text-sm font-bold text-midnight"
        >
          Create an account
        </Link>
      </div>
    </main>
  );
}
