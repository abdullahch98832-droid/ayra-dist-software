// One-time provisioning of the first Super Admin.
//
//   npm run admin:bootstrap -- --email owner@example.com
//
// Uses SUPABASE_SECRET_KEY from .env.local (server-side only). The user receives
// Supabase's invitation email and chooses their own password; no password is
// ever passed on the command line, stored in the repository or sent anywhere else.
// The database refuses to run this once an active Super Admin exists.
import { createClient } from "@supabase/supabase-js";

const args = process.argv.slice(2);
const emailIndex = args.indexOf("--email");
const email = (emailIndex >= 0 ? args[emailIndex + 1] : process.env.BOOTSTRAP_ADMIN_EMAIL)?.trim().toLowerCase();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const secret = process.env.SUPABASE_SECRET_KEY;
const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

function fail(message) {
  console.error(`✗ ${message}`);
  process.exit(1);
}

if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) fail("Pass the administrator email: npm run admin:bootstrap -- --email you@example.com");
if (!url || !secret) fail("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY must be set in .env.local");

const admin = createClient(url, secret, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUser(address) {
  for (let page = 1; ; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) fail(`Could not list users: ${error.message}`);
    const match = data.users.find((u) => u.email?.toLowerCase() === address);
    if (match || data.users.length < 200) return match ?? null;
  }
}

let user = await findUser(email);
if (!user) {
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo: `${siteUrl}/auth/confirm?next=/reset-password`,
  });
  if (error) fail(`Invitation failed: ${error.message}`);
  user = data.user;
  console.log(`✓ Invitation email sent to ${email}`);
} else {
  console.log(`• ${email} already has an account; granting the role only`);
}

const { error } = await admin.rpc("bootstrap_super_admin", { p_email: email });
if (error) fail(error.message);

console.log(`✓ ${email} is now the Super Admin.`);
console.log("  Open the invitation email, set a password, then sign in. Add all other users from Administration → Users.");
