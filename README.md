# AI Constitutions

A mobile-first SvelteKit 3 / Svelte 5 / TypeScript app for collecting public chatbot evidence and concrete improvements to 11 **sample** constitutions. The working title and sample statements can be replaced. Citizen cases have exactly four fields: screenshots, description, proposed improvement, and one constitution. No public profile or account identifier is published.

## Install and run

Use Node 22.12+ (Node 24 LTS recommended) and npm. Versions are pinned in `package.json` and `package-lock.json`.

```sh
npm ci
cp .env.example .env
# Apply the database migration and configure Auth below before browsing database pages.
npm run dev
```

Open the printed local URL (normally http://localhost:5173). `.env.example` includes the supplied URL and **publishable** key. Local `.env*` files are ignored. The app uses SvelteKit's validated runtime environment APIs (`src/env.ts`, `$app/env/public`, `$app/env/private`). No service credential is needed for regular case CRUD, uploads, public viewing, or authentication. Prisma is documentation/validation tooling; all app queries and Storage operations use the Supabase SDK.

## Database and Storage setup

**An administrator must apply the migration. The publishable key cannot do this.** The authoritative migration is `supabase/migrations/20261012000000_initial.sql`; it includes tables, constraints, indexes, RLS, private ownership, restricted RPCs, a private `screenshots` bucket, Storage policies, and exactly 11 seed statements. Apply it once to a new/dedicated project, in a transaction.

Option A: paste the migration into the project's Supabase SQL Editor, preceded by `BEGIN;` and followed by `COMMIT;`.

Option B: install the Supabase CLI, authenticate, link the project and push:

```sh
supabase login
supabase link --project-ref sfccsrznnxivtmcixlwd
supabase db push
```

Option C: use an administrator database connection with `psql`:

```sh
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/migrations/20261012000000_initial.sql
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

## Evidence lifecycle and housekeeping

Screenshots are 1–5 PNG/JPEG/WebP files, at most 10 MiB each. The form displays previews, removal, and per-file transfer progress. The SvelteKit upload endpoint checks file size, MIME and magic bytes; the Storage bucket independently enforces allowed MIME/size for direct requests. Original filenames and user IDs never form part of storage paths: `random-case-uuid/random-image-uuid.ext`.

A private draft is created under the verified account, paths are reserved, and files are uploaded. `commit_case` checks one to five distinct objects, their stored byte sizes/types and case ownership, then publishes case text and screenshot references atomically. Retry IDs prevent duplicate creation; versions reject stale concurrent edits, while exact commit retries are idempotent. Edits upload replacements to new immutable paths. Failed saves keep form text, retained evidence and successfully uploaded pending images so the user can retry. Only completed submissions are public. Citizen text is rendered as escaped text.

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
psql -h 127.0.0.1 -p 55439 -d postgres -v ON_ERROR_STOP=1 -f tests/postgres-bootstrap.sql -f supabase/migrations/20261012000000_initial.sql
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

Apply the migration to an **isolated Supabase test project** or the local Supabase stack. Set `TEST_SUPABASE_URL`, `TEST_SUPABASE_PUBLISHABLE_KEY`, and server-only `TEST_SUPABASE_SERVICE_ROLE_KEY` in your shell. For a dedicated remote test project, also set `TEST_ISOLATED_PROJECT=1` to explicitly attest it is isolated. Then run `npm run test:integration`. Tests create temporary verified accounts, use separate owner/other/anon SDK clients to test direct PostgREST and Storage calls, and delete their cases/users afterward. This suite is skipped unless all three test credentials are present; application `.env` credentials never implicitly enable it.

Stop the disposable server after tests:

```sh
pg_ctl -D /tmp/ai-constitutions-test stop
```

## Production deployment

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
