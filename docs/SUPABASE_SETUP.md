# Supabase Setup (manual steps)

These steps need your Supabase account, so they cannot be automated from the repository. **Never paste keys or passwords into chat, code or commits** — they belong only in `.env.local` (git-ignored) and the Supabase/Vercel dashboards.

## 1. Create an account and project

1. Go to https://supabase.com and sign up (GitHub or email). The Free plan is enough for development.
2. **New project** →
   - Name: `ayra-dms` (any name works)
   - Database password: generate a strong one and store it in a password manager. You need it once, for `supabase link`.
   - Region: the closest to Pakistan offered (e.g. Mumbai `ap-south-1` or Singapore).
3. Wait until the project finishes provisioning.

## 2. Get the URL and publishable key

Dashboard → **Project Settings → API Keys** (and **Data API** for the URL):
- **Project URL** — `https://<project-ref>.supabase.co`
- **Publishable key** — starts with `sb_publishable_…` (safe for the browser)
- **Secret key** — starts with `sb_secret_…` (server only; needed for user administration and the first-admin script)

If your project only shows legacy keys, the `anon` key works in place of the publishable key and `service_role` in place of the secret key.

## 3. Configure environment variables

```bash
cp .env.example .env.local
```
Edit `.env.local` on your computer (never in chat):
```
NEXT_PUBLIC_SUPABASE_URL=https://<project-ref>.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
NEXT_PUBLIC_SITE_URL=http://localhost:3000
SUPABASE_SECRET_KEY=sb_secret_...
```
On Vercel, add the same variables in Project Settings → Environment Variables, with `NEXT_PUBLIC_SITE_URL` set to the production URL.

## 4. Secure Auth settings

Dashboard → **Authentication**:
- **Sign In / Providers:** disable "Allow new users to sign up" (admins invite users). Keep Email enabled. Set minimum password length 10 and require letters and digits. Enable "Secure password change".
- **URL Configuration:** Site URL = your app URL (`http://localhost:3000` for development, the production URL later). Add `<site URL>/auth/confirm` to Redirect URLs.
- **Emails → Templates:** replace the **Invite user** and **Reset password** templates with the contents of `supabase/templates/invite.html` and `supabase/templates/recovery.html`. These send links to `/auth/confirm` (required for invitations and password resets to work).
- **Emails → SMTP:** the built-in sender is rate-limited (a few emails per hour) and meant for testing. Configure your own SMTP provider before inviting real staff.

## 5. Apply the migrations

```bash
npx supabase login          # opens a browser
npx supabase link --project-ref <project-ref>   # asks for the database password
npm run db:push             # applies supabase/migrations
npm run db:check            # verifies URL, key, Auth and migrations
```

If you apply migrations in the dashboard's SQL Editor instead, run every file in `supabase/migrations` in name order. `npm run db:check` only proves the tables exist; if sign-in succeeds but "This page could not be loaded" appears, `20261124110000_explicit_grants.sql` has not been applied.

## 6. Create the first administrator (Super Admin)

```bash
npm run admin:bootstrap -- --email <owner email>
```
This sends an invitation email; open it, choose your password (at least 10 characters), and sign in. The command works only while no Super Admin exists and never handles a password. All other users are then invited from **Administration → Users**. Managers are limited to two active users (changeable in `app_settings.role_user_limits`).

## 7. Optional: API tests on a separate test project

Create a second Supabase project for testing only, push the migrations to it, and put its keys in `.env.test.local` as `API_TEST_SUPABASE_URL`, `API_TEST_PUBLISHABLE_KEY`, `API_TEST_SECRET_KEY`. Then `npm run test:api` signs in as each role and calls the REST API directly. The suite refuses to run against the application's own project.

## Rules from now on

- Change the database only by adding a new file in `supabase/migrations/` and running `npm run db:push`. Never edit tables in the dashboard on production.
- Run `npm run test:db` before pushing a migration.
- Use a separate Supabase project (or branch) for testing; never test against production data.

## Checking the database

`supabase/verify-schema.sql` is read-only. Run it in the SQL Editor: `ok` means the database matches the migrations; otherwise it lists what differs or is missing.

## Clearing all entered data

By hand, only when a fresh start is wanted; it cannot be undone. Take a backup, run `supabase/maintenance/clear-all-data-preview.sql` (reads only), then `clear-all-data.sql` with `CLEAR` written in `v_confirm`. Only the active Super Admin login stays. Uploaded files are not in the database: empty the buckets `employee-photos`, `product-images` and `attachments` under Storage. A new table must be added to `v_stay`, `v_clear` or `v_delete` in the script; `supabase/tests/clear-data.test.ts` fails until it is.
