# AI Constitutions

A mobile-first SvelteKit 3 / Svelte 5 / TypeScript app for collecting public chatbot evidence and concrete improvements to 11 **sample** constitutions. The working title and sample statements can be replaced. Citizen cases have four form fields: screenshots, description, proposed improvement, and one constitution. Screenshots are optional only when a read-only chat exchange is attached. No public profile or account identifier is published.

## Install and run

Use Node 22.12+ (Node 24 LTS recommended) and npm. Versions are pinned in `package.json` and `package-lock.json`.

```sh
npm ci
cp .env.example .env
# Apply the database migration and configure Auth below before browsing database pages.
npm run dev
```

Open the printed local URL (normally http://localhost:5173). `.env.example` includes the supplied URL and **publishable** key. Local `.env*` files are ignored. The app uses SvelteKit's validated runtime environment APIs (`src/env.ts`, `$app/env/public`, `$app/env/private`). No service credential is needed for regular case CRUD, uploads, public viewing, or authentication. Prisma is documentation/validation tooling; all app queries and Storage operations use the Supabase SDK.

## Simulated chatbot

The main navigation includes **Chatbot**, a signed-in page at `/chatbot`. The server load uses the existing `requireUser` gate after the Supabase cookie session has been verified with `getUser()` in the request hook. Signed-out visitors return to `/chatbot` after signing in.

`src/lib/chatbot.ts` contains exactly 50 predefined response rules plus a fallback. The matcher accepts only the latest message, normalizes Unicode, case, whitespace and curly apostrophes, and requires Unicode word boundaries. Matching phrases with more whitespace-separated words take precedence; equal specificity uses the rules' declared order, regardless of where the phrase occurs in the message. Replies intentionally include helpful, incorrect, overconfident, dismissive and mixed examples. The page clearly identifies the simulation; the replies are not factual guidance or adopted policy.

The typed page-local message objects have stable random IDs, roles, text, ISO timestamps and an internal matched-rule ID for assistant messages. The active conversation stays in page memory; it is not saved to Supabase, browser storage, cookies, URLs or application logs, and uses no external model/API. Navigating away, refreshing, signing out and leaving via browser history clears it. Returning starts empty. Messages have a 10,000-character limit, matching case-evidence validation.

**Hints** beside the Chatbot heading opens an accessible native dialog with 50 categories and natural-language clues, one for each rule (`src/lib/chatbot-hints.ts`). The list reveals no replies and has no clickable prompts. Escape or Close dismisses it and returns focus to Hints.

**Create a case** below every assistant reply carries exactly that reply and its immediately preceding user message to `/submit?source=chatbot`. This is a one-use in-memory transfer, with no message text in the URL or browser storage. The form shows two read-only evidence bubbles and reminds the author that the exchange will become public. Only these two text entries are stored, when the user submits the case; no rule IDs, message IDs, author IDs or other conversation messages are attached. Refreshing an unsaved form discards this transfer and shows an actionable notice; ordinary screenshot submission remains available.

The `20261015000000_chat_exchange_evidence.sql` migration adds nullable `chat_prompt` and `chat_response` case columns. A paired-value constraint and immutable-column trigger protect the evidence; authenticated RPCs retain owner binding, and `commit_case` permits zero screenshots only for a complete attached exchange. Existing screenshot cases still require 1–5 images. The save endpoint also verifies new responses against the local simulation and rejects exchange changes during edits. SQL permissions remain the authority for direct API requests: attached citizen evidence is not a cryptographically certified transcript. Owners can edit descriptions, proposals, constitution references and screenshots, while the two evidence texts remain unchanged. The same bubbles appear on public detail and owner edit pages. Prisma documents the columns; its comments identify constraints and triggers represented only in SQL.

Desktop Enter sends, Shift+Enter inserts a newline, and touch devices retain multiline Enter with a Send button. The conversation follows new messages only while near the bottom. A Visual Viewport resize handler keeps the composer within the available height when the on-screen keyboard resizes the viewport. Actual keyboard behavior still depends on the mobile browser; automated tests emulate touch and reduced viewport height rather than a physical phone keyboard.

Run `npm test` for all rule, precedence and authentication unit tests. Run `npm run test:e2e -- --grep chatbot` with the isolated test database setup below for navigation, submissions, safe rendering, scrolling, mobile input, session gates and conversation lifecycle checks. Existing deployment setup applies; no new environment variables are needed.

## Database and Storage setup

**An administrator must apply migrations. The publishable key cannot do this.** SQL migrations in `supabase/migrations/` are authoritative. Apply them once in filename order: `20261012000000_initial.sql` sets up tables, constraints, indexes, RLS, private ownership, RPCs, screenshot Storage and 11 seed statements; `20261015000000_chat_exchange_evidence.sql` adds chat evidence and updates case RPCs. Existing installations that already applied the initial migration must apply only the new chat-evidence migration before deploying the updated app.

Option A: paste each unapplied migration into the project's Supabase SQL Editor, preceded by `BEGIN;` and followed by `COMMIT;`, in filename order.

Option B: install the Supabase CLI, authenticate, link the project and push:

```sh
supabase login
supabase link --project-ref sfccsrznnxivtmcixlwd
supabase db push
```

Option C: use an administrator database connection with `psql`:

```sh
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20261012000000_initial.sql
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20261015000000_chat_exchange_evidence.sql
```

Keep `private` and `storage` out of PostgREST's exposed schemas. The normal exposed schemas are `public` and `graphql_public`. The migration intentionally revokes application table writes; users mutate their records through restricted, transactional RPCs. On an existing project, audit pre-existing permissive policies for the same bucket: PostgreSQL policies combine with OR. This migration assumes a new bucket named `screenshots` and fails visibly if it already exists.

For a complete local Supabase stack, install the CLI and Docker, then run:

```sh
supabase start
supabase db reset
supabase status
```

Replace the two PUBLIC values in your ignored `.env` with the local URL and anon/publishable key from `supabase status`. `supabase/config.toml` configures local ports and Auth. Test fixtures are not seeded into the production migration.

## Supabase Auth configuration

### Google sign-in and sign-up

Both `/signin` and `/signup` offer **Continue with Google**. This is one Supabase OAuth flow: a first-time visitor gets a Supabase account when signup is allowed, and an existing user signs in. The native form POSTs to `/auth/google`, checks the request origin, validates the intended return path, and calls `signInWithOAuth({ provider: 'google' })` on the existing server-rendering client. The SDK stores a PKCE verifier in cookies. The server redirects only to the configured Supabase origin; Supabase handles Google consent and returns an authorization code to `/auth/callback`. `exchangeCodeForSession` establishes the Supabase cookie session before redirecting to the intended page. Protected requests still verify the user with `getUser()`.

Canceled consent and failed/expired exchanges return a generic retry message without reflecting provider error details. Google does not expose profile names or emails in case responses: the existing private ownership model and Anonymous labels apply to Google accounts too. This app requests no Google API access beyond authentication and does not save Google access/refresh tokens in application tables.

**Required hosted setup:**

1. In [Google Auth Platform](https://console.cloud.google.com/auth/overview), select/create a project and configure Branding, Audience and the consent screen. Use basic authentication scopes: `openid`, email and profile. While the app is in Testing, add the Google accounts you will test with under Test users; publish the audience when ready for general access.
2. Create an OAuth client of type **Web application**. Add your production origin (for example `https://YOUR_APP.vercel.app`) to Authorized JavaScript origins. Add `http://localhost:5173` and/or `http://127.0.0.1:5173` for development.
3. Add this exact **Authorized redirect URI** in Google:

   ```text
   https://sfccsrznnxivtmcixlwd.supabase.co/auth/v1/callback
   ```

   This is Google's return address to Supabase. It is different from the app's `/auth/callback`. If you configure a custom Supabase Auth domain, use the callback shown on that project's Google provider page instead.

4. In [Supabase → Authentication → Sign In / Providers → Google](https://supabase.com/dashboard/project/sfccsrznnxivtmcixlwd/auth/providers), enable Google and paste the **Client ID** and **Client Secret** from Google. Save. Keep new-user signup enabled if Google sign-up should work. Credentials belong in Supabase, not in a `PUBLIC_` variable or Vercel's app environment.
5. In Supabase → Authentication → URL Configuration, set **Site URL** to the actual production origin. Add these Redirect URLs, replacing the production placeholder:

   ```text
   https://YOUR_APP.vercel.app/auth/callback
   https://YOUR_APP.vercel.app/auth/callback?**
   http://localhost:5173/auth/callback
   http://localhost:5173/auth/callback?**
   http://127.0.0.1:5173/auth/callback
   http://127.0.0.1:5173/auth/callback?**
   ```

   The query pattern allows the validated `next` destination and `provider=google` marker. Add only the preview origins you intend to use. Configure `APP_ORIGIN` per the deployment instructions; it must not force production URLs onto a different preview origin.

6. Deploy the updated app, then test Continue with Google from both sign-in and signup, including a signed-out visit to `/chatbot` or `/submit`. The app needs no new environment variables, packages or SQL migrations for OAuth; the existing Supabase URL and publishable key are sufficient after provider setup.

For a **local Supabase stack** (rather than the supplied hosted project), additionally register `http://127.0.0.1:54321/auth/v1/callback` with Google. Enable `[auth.external.google]` in `supabase/config.toml`, set its `client_id`, and use `secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_SECRET)"` with that secret supplied to the Supabase CLI. Keep `skip_nonce_check = false`. This optional CLI secret is not an app environment variable. The checked-in stack keeps Google disabled until you configure credentials. See [Supabase's Google setup guide](https://supabase.com/docs/guides/auth/social-login/auth-google).

Verification uses a loopback-only OAuth fixture that checks the real SDK's PKCE challenge/verifier, one-time codes, cookie persistence and protected redirects, without contacting Google or sending emails. A real Google consent flow cannot be tested until the provider credentials are configured. On 2026-10-15, the hosted project's public `/auth/v1/settings` reported Google disabled, email enabled, signup allowed and email auto-confirm disabled; no hosted settings were changed.

### Email/password and email confirmation

Enable the Email provider, email/password signup, and choose whether email confirmation is required. Set **Site URL** to the actual app origin. Add redirect URLs for each development/production origin:

- `http://localhost:5173/auth/callback` and `http://localhost:5173/auth/callback?next=**`
- `http://localhost:5173/auth/confirm` and `http://localhost:5173/auth/confirm?**`
- `http://localhost:5173/reset-password`
- Equivalent HTTPS production URLs; include the exact origin and port used in development.

In the confirmation email template, use the token-hash route so confirmation works even on another device. Replace `APP_ORIGIN` below with the literal correct origin (localhost during local testing):

```html
<a
  href="APP_ORIGIN/auth/confirm?token_hash={{ .TokenHash }}&type=email&next=/submit"
  >Confirm your email</a
>
```

In the recovery template:

```html
<a
  href="APP_ORIGIN/auth/confirm?token_hash={{ .TokenHash }}&type=recovery&next=/reset-password"
  >Reset your password</a
>
```

Alternatively the standard `{{ .ConfirmationURL }}` template uses the PKCE `/auth/callback` route and requires the originating browser's verifier cookie. Both routes are implemented; token-hash templates avoid that same-browser limitation. Expired links give an actionable signin/reset message. Return destinations are validated as local URLs. Configure production email delivery/SMTP and Supabase Auth rate limits in the dashboard. Passwords require at least 8 characters, with Supabase's configured policy enforced in addition. Sessions refresh through SSR cookies; `getUser()` verifies authentication for every request. Only a `signedIn` boolean reaches layout data, never an email or owner ID.

The app's current email flow is:

1. `/signup` calls Supabase `auth.signUp` with the email, password and an `/auth/callback?next=...` redirect. Supabase manages the password, confirmation token and email delivery; this app has no separate mail server or email-verification table.
2. With **Confirm email** enabled, Supabase returns no authenticated session. The form tells the user to check their inbox. After the valid confirmation link is opened, either the token-hash route verifies it with `verifyOtp`, or the default Supabase link returns a PKCE code that the callback exchanges for a cookie session. The user is then signed in. The sample token-hash template above always lands on `/submit`; the default `ConfirmationURL` flow preserves the original validated destination and requires the same originating browser.
3. With **Confirm email** disabled, Supabase may return a session immediately and the app redirects directly to the intended destination. The local `supabase/config.toml` enables confirmations, and the hosted public settings checked on 2026-10-15 also require confirmation (`mailer_autoconfirm=false`).
4. Expired, already-used or invalid links show an actionable authentication error. Supabase controls token lifetime, delivery limits and SMTP. Check Authentication → Email Templates, Email settings and SMTP in the hosted dashboard; these administrative values are not readable through the supplied publishable key.

For public email signup, configure [custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp) in Supabase with your sender/provider credentials. The default Supabase sender is intended for testing, limits recipients to project-team addresses and has restrictive rate limits. Public settings do not reveal whether custom SMTP or the recommended email template is already configured, and no real emails were sent during verification. Google authentication is a separate provider flow and normally does not need the app's email/password confirmation link.

## Evidence lifecycle and housekeeping

Screenshots are 1–5 PNG/JPEG/WebP files, at most 10 MiB each. The form displays previews, removal, and per-file transfer progress. The SvelteKit upload endpoint checks file size, MIME and magic bytes; the Storage bucket independently enforces allowed MIME/size for direct requests. Original filenames and user IDs never form part of storage paths: `random-case-uuid/random-image-uuid.ext`.

A private draft is created under the verified account, with the selected chat evidence if present. Screenshot paths are reserved and files are uploaded when provided. `commit_case` requires 1–5 distinct images for ordinary cases, or 0–5 for cases with a complete attached exchange. It checks stored image byte sizes/types and case ownership, then publishes case text and screenshot references atomically. Retry IDs prevent duplicate creation; versions reject stale concurrent edits, while exact commit retries (including empty image arrays) are idempotent. Edits upload replacements to new immutable paths. Failed saves keep form text, retained evidence and successfully uploaded pending images so the user can retry. Only completed submissions are public. Citizen text is rendered as escaped text.

Successful edits attempt immediate cleanup of removed/pending evidence. Failures are explicitly reported while the saved public content remains valid. Deletion first hides the case, deletes images via Storage's API, then deletes the case and its screenshot/ownership/upload records. Failed deletion is visible in My Cases and can be retried. Storage objects are **never** deleted by manipulating their SQL metadata directly in application code.

Configure **scheduled housekeeping before production** to remove uploads abandoned for more than 24 hours and retry incomplete deletion/old-image cleanup:

1. Add server-only `SUPABASE_SERVICE_ROLE_KEY` and a random `CLEANUP_SECRET` (at least 32 random bytes) to your deployment environment.
2. Schedule an hourly POST to `https://YOUR_APP/api/cleanup` with header `Authorization: Bearer YOUR_CLEANUP_SECRET`. Use your host's scheduler or a Supabase Cron job with pg_net and secrets in Vault. Do not put the credentials in a public URL or source code.
3. Alert/retry on non-2xx responses. The route processes up to 40 cases per invocation; invoke more often if a backlog develops. Candidate rows remain retryable on failure.

For a manual run from a shell with the secret already exported:

```sh
curl --fail --request POST --header "Authorization: Bearer $CLEANUP_SECRET" https://YOUR_APP/api/cleanup
```

The cleanup RPC locks cases and claims old paths before deleting files, preventing them from being committed concurrently. The cleanup RPCs are executable only by `service_role`; secrets never enter browser bundles. Without the scheduler, immediate cleanup and owner retry still work, but unattended abandoned files remain until housekeeping is configured.

## Database decisions and Prisma

`Constitution` maps to `public.constitutions`; `Case` maps to `public.cases`; `CaseScreenshot` maps to `public.case_screenshots`. Private `CaseOwner` and `Upload` models capture ownership and file reservations. No public table has a user/email column. Anonymous visitors can read only published cases and their evidence. The owner can see private draft/deleting states; My Cases excludes drafts. Owners cannot transfer ownership, mutate constitutions, directly insert records, or overwrite committed screenshots.

The Prisma 7 config at `prisma.config.ts` uses `DATABASE_URL` solely for schema tooling. Validate without a running database:

```sh
npm run prisma:validate
```

SQL is authoritative. **Do not run `prisma db push` or Prisma migrations.** Prisma cannot represent the RLS/grants, security-definer functions, custom checks, private helper functions, bucket policies, partial browsing indexes, or trigram expression search index. The Auth-managed `user_id -> auth.users.id` FK (ON DELETE RESTRICT) is documented in the schema; Prisma intentionally does not manage Supabase's Auth schema. Creation/update timestamps are managed by the commit RPC, rather than Prisma `@updatedAt`.

Browsing uses an indexed, literal substring search across description plus improvement, optional constitution filter, `(created_at, id)` keyset pagination, and 13-row lookahead to display 12 rows. The client appends without duplicates and resets on query change. Search/filter/sort use URL query parameters. A newly published case may appear on a later page of oldest-first browsing; a refresh includes new cases in newest-first browsing. Community reviews can later reference case IDs without changing the privacy boundary.

## Testing

```sh
npm run format:check
npm run check
npm run prisma:validate
npm test
npm run build
```

There are three distinct verification levels. Skipped integration suites are explicitly labeled; a skip is not a successful permission check.

### Isolated PostgreSQL migration/RLS tests

Use a disposable PostgreSQL instance with `pg_trgm`. The bootstrap imitates only Supabase-owned Auth/Storage schemas, **never apply it to Supabase or an existing database**. For example with PostgreSQL installed locally:

```sh
initdb -D /tmp/ai-constitutions-test -A trust -E UTF8
pg_ctl -D /tmp/ai-constitutions-test -l /tmp/ai-constitutions-test.log -o '-p 55439 -h 127.0.0.1' start
psql -h 127.0.0.1 -p 55439 -d postgres -v ON_ERROR_STOP=1 -f tests/postgres-bootstrap.sql -f supabase/migrations/20261012000000_initial.sql -f supabase/migrations/20261015000000_chat_exchange_evidence.sql
export TEST_DATABASE_URL="postgresql://$USER@127.0.0.1:55439/postgres"
npm run test:integration
```

These tests run against real PostgreSQL grants, constraints, functions and RLS with separate anon/owner/other roles; fixtures live in a rolled-back transaction. They verify creation, editing, deletion, required evidence/text, public anonymity, private ownership, SQL browsing and direct object-policy enforcement. They do not prove Supabase Auth delivery or the hosted Storage HTTP implementation.

### Browser tests and visual QA

With that disposable PostgreSQL instance running:

```sh
npx playwright install chromium
TEST_DATABASE_URL="postgresql://$USER@127.0.0.1:55439/postgres" npm run test:e2e
# Or use an installed Chrome:
CHROME_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  TEST_DATABASE_URL="postgresql://$USER@127.0.0.1:55439/postgres" npm run test:e2e
```

Playwright starts the app and a **loopback-only fixture adapter**, overriding Supabase configuration only for those processes. The adapter exercises real SQL/RLS through the actual Supabase SDK, with simulated Auth and file transport. This is isolated from the supplied hosted project. It resets only disposable fixture data. Screenshots are saved in ignored `test-results/`. Tests cover navigation and keyboard access, themes, account gates/return destinations, public browsing, filters/sorting/load more, input validation, creation/edit/deletion, evidence dialogs and safe text. Run on a database dedicated exclusively to tests.

### Real Supabase direct-request tests

Apply both migrations to an **isolated Supabase test project** or the local Supabase stack. Set `TEST_SUPABASE_URL`, `TEST_SUPABASE_PUBLISHABLE_KEY`, and server-only `TEST_SUPABASE_SERVICE_ROLE_KEY` in your shell. For a dedicated remote test project, also set `TEST_ISOLATED_PROJECT=1` to explicitly attest it is isolated. Then run `npm run test:integration`. Tests create temporary verified accounts, use separate owner/other/anon SDK clients to test direct PostgREST and Storage calls, and delete their cases/users afterward. This suite is skipped unless all three test credentials are present; application `.env` credentials never implicitly enable it.

Stop the disposable server after tests:

```sh
pg_ctl -D /tmp/ai-constitutions-test stop
```

## Production deployment

### Vercel

The build selects `@sveltejs/adapter-vercel` when Vercel sets `VERCEL=1`. It generates `.vercel/output/`, including server functions and static assets, using Node.js 24. The checked-in `vercel.json` selects the SvelteKit framework and build command and resets the output-directory override to the framework default.

In Vercel Project Settings → Build and Deployment:

1. Set **Framework Preset** to **SvelteKit**.
2. Set **Root Directory** to the directory containing this `package.json` and `vercel.json`.
3. Use **Build Command** `npm run build` and **Node.js Version** `24.x`.
4. Turn **Output Directory → Override** **off**. Remove any saved `public` override; let the SvelteKit adapter supply deployment output.
5. Add `PUBLIC_SUPABASE_URL` and `PUBLIC_SUPABASE_PUBLISHABLE_KEY` to each environment you deploy (Production and/or Preview). Add the server-only cleanup variables when enabling scheduled cleanup. A gitignored local `.env` is not uploaded by Git deployments.
6. Leave `APP_ORIGIN` unset for Vercel's per-deployment origin, or set it to the exact canonical deployment origin for that environment. Add your production URL and allowed preview callback URLs to Supabase Auth's redirect allow list as described above.
7. Redeploy after changing settings or environment variables. Existing deployments do not pick up those changes.

The error **No Output Directory named "public" found** means Vercel expected static output in `public/`. This app needs a SvelteKit server adapter for authentication, server-rendered pages and API routes. The original standalone Node adapter generated `dist/`, which does not match that static configuration. Creating an empty `public/` folder would hide the configuration problem without deploying the server.

To verify Vercel output locally without deploying:

```sh
VERCEL=1 npm run build
```

This validates packaging, but does not deploy or check your remote Vercel settings. See the [SvelteKit Vercel adapter documentation](https://svelte.dev/docs/kit/adapter-vercel) and [Vercel build settings](https://vercel.com/docs/builds/configure-a-build).

Vercel Functions have a [4.5 MB request-body limit](https://vercel.com/docs/functions/limitations#request-body-size). The current screenshot endpoint proxies each image through the server, so larger images will be rejected by Vercel before reaching application validation. The full 10 MB upload allowance requires a Node host with the request limits below, or a future change to direct-to-Supabase uploads. `BODY_SIZE_LIMIT` cannot raise Vercel's platform limit.

### Standalone Node host

Deploy the generated adapter-node app in `dist/` on a Node host. Precompression is disabled; the host or reverse proxy can compress responses. Build and run:

```sh
npm ci
npm run build
npm start
```

Set the two PUBLIC Supabase values at runtime, `BODY_SIZE_LIMIT=12M`, your server-only cleanup variables, and `APP_ORIGIN=https://YOUR_APP` **at build time** when behind a proxy. `paths.origin` in SvelteKit 3 supplies the canonical origin for CSRF and redirect generation; do not use the removed SvelteKit 2 `ORIGIN` setting. Configure HTTPS, the appropriate `PORT`, request limits of at least 12 MB, and hourly cleanup. `npm start` loads an ignored `.env` if present; real hosting environment variables take precedence. A static-only host cannot serve this app. The publishable key stays public; RLS and Storage policies are the authorization boundary.

## Scope and verification status

This version implements collection, browsing, accounts, and owner case management. Reviews, votes, comments, moderation, notifications, OCR, redaction, AI analysis and model training are deliberately deferred. See `VERIFICATION.md` for completed checks and the external setup that remains. No administrator migration or deployment has been performed on the supplied hosted project.

Reference patterns: [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/creating-a-client?queryGroups=framework&framework=sveltekit), [RLS](https://supabase.com/docs/guides/database/postgres/row-level-security), [Storage access control](https://supabase.com/docs/guides/storage/security/access-control), [SvelteKit 3 environment variables](https://svelte.dev/docs/kit/environment-variables).
