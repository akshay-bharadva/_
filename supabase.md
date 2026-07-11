# Supabase Setup Guide

This guide provides the necessary steps to configure a Supabase project to serve as the backend for this portfolio application.

### Prerequisites

- A free [Supabase](https://supabase.com) account.

---

### Step 1: Create a New Project

1.  Log in to your Supabase account and click **New project**.
2.  Choose an organization, give your project a **Name**, and generate a secure **Database Password**.
3.  Choose the **Region** closest to your users.
4.  Click **Create project** and wait for it to be provisioned.

---

### Step 2: Configure Environment Variables

1.  In your Supabase project dashboard, navigate to **Project Settings** (the gear icon) > **API**.
2.  You will need the **Project URL** and the `anon` **Project API Key**.
3.  In your local project folder, create a new file named `.env.local` by copying `.env.example`.
4.  Update your `.env.local` file with these values:

    ```env
    NEXT_PUBLIC_SUPABASE_URL=YOUR_SUPABASE_PROJECT_URL
    NEXT_PUBLIC_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_PUBLIC_KEY
    NEXT_PUBLIC_BUCKET_NAME=assets
    NEXT_PUBLIC_SITE_URL=http://localhost:8889
    ```

---

### Step 3: Run the Database Setup Script

This single SQL script creates all necessary tables, security policies, server-side functions, and seed data for initial setup.

1.  In your Supabase project dashboard, navigate to the **SQL Editor** (the terminal icon).
2.  Click **+ New query**.
3.  Copy the entire contents of [`db/schema.sql`](db/schema.sql) and paste it into the editor.
4.  Click **Run**. The script is idempotent, meaning you can safely run it multiple times.

> **What the script creates:** 15+ tables with Row Level Security, 10+ RPC functions, storage bucket policies, and seed data for site identity, navigation, and security settings.

---

### Step 4: Configure Storage

The application uses Supabase Storage for image uploads. The SQL script automatically creates the `assets` bucket, but you should verify it:

1.  Navigate to **Storage** in your Supabase dashboard.
2.  Confirm the `assets` bucket exists and is set to **Public**.
3.  If it doesn't exist, create it manually: click **Create a new bucket**, name it `assets`, and toggle **Public bucket** to **ON**.

> The RLS policies from the SQL script secure access — public reads are allowed, but writes are restricted to the MFA-verified admin account.

---

### Step 5: Enable Two-Factor Authentication (MFA)

The admin panel requires MFA for security.

1.  Navigate to **Authentication** > **Providers** in your Supabase dashboard.
2.  Find **Multi-Factor Authentication** and click to configure.
3.  Enable **TOTP**.

---

### Step 6: Create Your Admin User

The admin panel does not have a public sign-up page. You must create your first user manually.

1.  Go to **Authentication** > **Users** in your Supabase dashboard.
2.  Click **Add user** and create your admin account via email.
3.  You will receive a confirmation email from Supabase. Click the link to verify your account.
4.  You can now proceed to `http://localhost:8889/admin/login` to log in for the first time and set up MFA.

---

### Step 7: Lock Down Signups (Important)

This is a **single-admin** application. The schema enforces this at the database level in three ways:

- A `block_additional_signups` trigger on `auth.users` rejects any account creation after the first user exists — including direct calls to the Supabase auth API. The `/admin/signup` page's "does an admin exist?" check is UX only; this trigger is the real enforcement.
- All write policies on shared content (site identity, blog posts, portfolio, navigation, security settings, storage) use the `public.is_admin()` helper, which only passes for the **first registered user**. A stray extra account — however created — cannot modify public content.
- Every admin-write policy also requires an **AAL2 session** (`public.is_aal2()`), meaning MFA/TOTP has been completed. A stolen password alone cannot write data, even through direct REST API calls that bypass the app's UI.

As defense in depth, also disable signups at the platform level:

1.  Navigate to **Authentication** > **Sign In / Up** (or **Providers** on older dashboards).
2.  Turn **off** "Allow new users to sign up" once your admin account exists.

> **Upgrading an existing project?** `db/schema.sql` is idempotent — re-run the whole script in the SQL Editor to replace the older, weaker policies (`auth.role() = 'authenticated'`) with the hardened ones. Re-running is **required** for this version: it also adds the `blog_posts.word_count` generated column that the public blog list now selects.

> **Webhook note:** `NEXT_PUBLIC_VISIT_NOTIFIER_URL` and `NEXT_PUBLIC_CONTACT_WEBHOOK_URL` are embedded in the public JS bundle — anyone can extract and abuse them. Prefer a **Database Webhook** (Dashboard > Database > Webhooks) on `contact_submissions` inserts, which keeps the Discord URL server-side.

---

### Troubleshooting

**Site settings not saving?**
If you previously ran an older version of the schema, the RLS policy for `site_identity` may be outdated (older versions used `auth.uid() = user_id`, which fails because the seed row has no `user_id`, or `auth.role() = 'authenticated'`, which is insecure). Re-run the full `db/schema.sql` (it is idempotent), or apply just this policy:

```sql
DROP POLICY IF EXISTS "Admin can manage site identity" ON site_identity;
DROP POLICY IF EXISTS "Admin manage site identity" ON site_identity;
CREATE POLICY "Admin manage site identity" ON site_identity
  FOR ALL USING (public.is_admin())
  WITH CHECK (public.is_admin());
```

**Locked out after applying the hardened policies?**
Admin writes now require an MFA-verified (AAL2) session. If you have enrolled TOTP but writes still fail, sign out and back in so your session upgrades to AAL2, and confirm TOTP is enabled under **Authentication** > **Multi-Factor Authentication**.
