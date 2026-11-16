import type { User } from "@supabase/supabase-js";

// Find an auth user by email across ALL pages of auth.admin.listUsers().
// A bare listUsers() returns only the first page (50 users by default), so
// once the platform passes 50 accounts, an existing user beyond page one
// looks "not found" — invites then fail with "already registered" and
// vouch requests say the person has no account.
const PER_PAGE = 1000;

type ListUsers = (params: { page: number; perPage: number }) => Promise<{
  data: { users: Pick<User, "id" | "email">[] } | null;
  error: { message: string } | null;
}>;

export async function findUserByEmail<U extends Pick<User, "id" | "email">>(
  admin: { auth: { admin: { listUsers: ListUsers } } },
  email: string
): Promise<{ user: U | null; error: string | null }> {
  const target = email.trim().toLowerCase();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) return { user: null, error: error.message };
    const users = data?.users ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === target);
    if (match) return { user: match as U, error: null };
    if (users.length < PER_PAGE) return { user: null, error: null };
  }
}
