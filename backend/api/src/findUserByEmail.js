// Find an auth user by email across ALL pages of auth.admin.listUsers().
// A bare listUsers() returns only the first page (50 users by default), so
// once the platform passes 50 accounts, an existing user beyond page one
// looks "not found" and the caller's createUser() then fails with
// "already registered".
const PER_PAGE = 1000;

/**
 * @param {{ auth: { admin: { listUsers: Function } } }} admin service-role client
 * @param {string} email
 * @returns {Promise<{ user: object | null, error: string | null }>}
 */
export async function findUserByEmail(admin, email) {
  const target = email.trim().toLowerCase();
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) return { user: null, error: error.message };
    const users = data?.users ?? [];
    const match = users.find((u) => u.email?.toLowerCase() === target);
    if (match) return { user: match, error: null };
    if (users.length < PER_PAGE) return { user: null, error: null };
  }
}
