# AI Constitution

A responsive SvelteKit/TypeScript app for contributing chatbot behavior examples and proposed changes to 11 sample constitutional principles. Blue/white and blue/black themes respect the system preference and remember a manual selection. The working title and all sample statements are replaceable. Behavior votes and anonymous reason threads help people discuss what the AI should keep or change. Formal review and model training remain future work.

## Install and run locally

Use Node 22.12+ (Node 24 LTS recommended) and npm. Dependencies and the lockfile are pinned.

```sh
npm ci
cp .env.example .env
# Apply migrations and configure email codes as described below.
npm run dev
```

Open http://localhost:5173. The supplied Supabase URL and publishable key are in `.env.example`; `.env*` files are ignored. SvelteKit’s environment APIs read the values declared in `src/env.ts`. The app uses the Supabase SDK for queries, authentication and historical Storage access. No admin key is required for ordinary requests.

## How the app works

The fixed bottom tabs are **Home**, **Chatbot**, and **All Issues**, on desktop and mobile. Account and signout are in the header; **My Issues** is an account destination.

1. Sign in or join at `/signin` with an emailed six-digit code.
2. Open Chatbot and send messages. Hints opens a keyboard-accessible dialog with one clue for each of the 50 predefined behaviors. This is a simulation; some replies are intentionally flawed.
3. Choose **Submit an issue** in Chatbot. Set the first and last exchange to select a continuous section. The latest exchange is selected initially; **Select all** includes the whole chat. Choose **Continue to issue** to attach only the highlighted messages.
4. Review the read-only message bubbles, describe the issue, choose bad / unwanted (new-issue default) or good / wanted behavior, propose an improvement, and select exactly one principle. **Back to chat** restores the full conversation and its highlighted range; form text and selections are retained when returning to the issue form.
5. Submit to publish. Anyone can find the issue in All Issues, search both text fields, filter by principle, and load more in order of wanted votes. Owners can edit issue fields and classification, or delete their issue.

Active chats stay in browser memory, without saved history, local/session storage, message URLs or application logs. Only one unsaved issue flow is retained while navigating between Chatbot and the form. **Back to chat** restores all messages, the selected range and any unsent chat draft. A temporary copy of the form fields also survives this round trip. No unselected messages are sent to the issue API or database. Leaving this two-page workflow, signing out, refreshing, or successfully submitting clears this return context. `/submit` without a handoff redirects into Chatbot. A query parameter alone cannot supply evidence. JavaScript is required for the simulation and its form.

Selections use inclusive first/last exchange boundaries and one contiguous array slice; an exchange is one user message plus its chatbot reply. Boundary controls adjust together to prevent inverted ranges. A single exchange, a longer section, or the entire conversation is allowed, with no gaps or orphaned replies. Evidence is frozen before navigation and remains read-only. An unchanged retry keeps its submission ID; changing the attachment resets the ID while retaining the written form fields.

Messages contain only `role` and `text` when attached; message IDs, timestamps and internal matched rules are omitted. Evidence preserves line breaks and renders as escaped text. The app validates 2–100 alternating user/assistant messages, complete pairs, 1–10,000 characters per message and at most 100,000 characters total. JSON request bodies are limited to 512,000 bytes. The server checks simulated replies against the local matcher. SQL independently validates structure/size and makes persisted transcripts immutable. This is contributed evidence, not a cryptographically certified record of chat origin; a direct authenticated API caller can supply structurally valid text.

No new screenshot inputs, image uploads or screenshot requirements remain. Historical screenshots and older prompt/reply evidence stay visible. Historical unclassified rows remain `NULL`; an owner must explicitly choose a classification when editing them. Editing retains historical images unchanged. Deletion still removes associated evidence using the Storage API before removing records; failed cleanup is visible and retryable.

## Issue terminology and compatible links

The public interface, navigation, validation messages and page titles use **issues**. Canonical pages are `/issues`, `/issues/[id]`, `/issues/[id]/edit` and `/my-issues`; the read/discussion API uses `/api/issues`. Existing `/cases` and `/my-cases` links redirect with their query strings intact, and legacy `/api/cases` endpoints remain compatible. Database table names, RPCs, Prisma model names and existing evidence are intentionally unchanged, so this rename and selection update requires **no new migration**. Apply the existing migrations for the underlying app if they have not already been installed.

## Database and Storage setup

SQL migrations are authoritative. Do not use `prisma db push` or Prisma migrations. `prisma/schema.prisma` documents public constitutions/issues/screenshots and private ownership/uploads, with comments for SQL-only checks, triggers, policies, RPCs and indexes. Prisma 7 uses `prisma.config.ts`; `npm run prisma:validate` needs no running database.

An administrator must apply unapplied migrations in filename order:

- `20261012000000_initial.sql`: schema, private owner mapping, RLS, Storage, search/browsing indexes and exactly 11 sample principles.
- `20261015000000_chat_exchange_evidence.sql`: historical prompt/reply support.
- `20261023000453_conversation_cases_and_email_codes.sql`: nullable transcript/classification columns, bounded transcript checks, immutable evidence, atomic `save_case`, retired creation/upload RPC access, and a restricted password rejection hook.
- `20261029155023_case_votes_and_comments.sql`: public comments, private comment ownership and ballots, bounded discussion reads, authenticated vote/comment mutations, and comment deletion with reply-preserving tombstones.
- `20261104213249_trending_issues_and_live_overview.sql`: transactional vote counters, indexed ten-row trending pages, public-only aggregates and an identity-free Realtime revision signal.
- `20261106052146_behavior_votes_and_reason_threads.sql`: behavior votes, separate reason threads, archived usefulness ballots, and support for labeled samples.
- `20261106163043_issue_topics.sql` adds the topic catalog, assignments and public feed filter.
- `20261110160000_issue_sorting.sql` adds time-based trending, discussion and controversy rankings and invalidation for ballots and comments.

Existing installations apply **only the unapplied migration(s)**. These additive upgrades do not relabel historical issues, alter Auth identities/password hashes, or delete evidence. The conversation migration (`20261023000453`) retires `begin_case` / `commit_case` and revokes `reserve_upload` from app users: deploy the matching app immediately after the migration, because old app versions use those RPCs. Existing incomplete legacy drafts are kept private and can be removed by housekeeping rather than published through the retired flow.

Using the authenticated Supabase CLI 3 (explicit hosted target):

```sh
supabase login
supabase migration up --remote=sfccsrznnxivtmcixlwd
```

If earlier files were applied manually and are not in CLI migration history, use SQL Editor again for the new file instead of rerunning the older files. Paste each unapplied file into Supabase SQL Editor inside `BEGIN;` / `COMMIT;`. For an existing installation, apply each unapplied migration in order. For example, if all earlier migrations are already applied:

```sh
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -1 \
  -f supabase/migrations/20261106163043_issue_topics.sql
```

Keep `private` and `storage` out of the Data API exposed schemas. Public rows contain no owner IDs/emails; ownership is in `private.case_owners`. New creation binds `auth.uid()` without accepting an owner parameter. Restricted security-definer RPCs enforce ownership/version checks because ordinary clients have no direct table-write grants. `save_case` inserts a complete public issue and private owner atomically; UUID retries and a transaction lock prevent duplicate creation. Exact retried saves are idempotent. Older evidence is immutable. Existing screenshot bucket/policies remain intact. Review pre-existing policies when installing into a shared project.

All Issues uses literal substring search with a GIN trigram index and principle filtering. The sort dropdown defaults to **Trending**, using total wanted plus unwanted votes divided by `(age in hours + 2)^1.5`. **Widely discussed** sorts by the number of non-deleted comments, including replies across all threads. **Controversial** sorts by the smallest proportional vote margin, `abs(wanted - unwanted) / total votes`, excluding zero-vote issues. Sample vote baselines count toward these scores. All orders break ties by creation time and issue ID, newest first. Database pagination uses an offset, a fixed ranking timestamp, and a revision guard. Ballot, comment, issue, and topic changes require a refresh before appending another page. Each SQL query returns ten rows plus one look-ahead, and the app displays ten before **Load more** appends the next ten. My Issues retains its existing date sorting and 12-row pages. Pagination is in SQL, query state is in the URL, and appended results are deduplicated. Browse responses omit full transcripts; cards include descriptions and proposed improvements, and detail pages retrieve the evidence separately so long conversations do not inflate every feed page.

For local Supabase with Docker:

```sh
supabase start
supabase db reset
supabase status
```

Set the local URL and publishable key from `supabase status` in the ignored `.env`. Local Auth settings and email templates are checked in. Restart the stack after changing `supabase/config.toml`.

## Email-code authentication: required hosted setup

The single sign-in/signup UI uses `signInWithOtp({ email, options: { shouldCreateUser: true } })`, followed by `verifyOtp({ email, token, type: 'email' })`. A new address is registered by Supabase during the request, but cannot authenticate or own issues until verification succeeds. Existing users authenticate into their existing ID and retain ownership; no account recreation or data migration occurs.

The existing SSR client writes session cookies and refreshes them; `hooks.server.ts` verifies `auth.getUser()` before protected operations. The app validates return paths, supports string codes with leading zeros, pasting, numeric keyboards and one-time-code autofill. Incorrect/expired codes, sending failures and rate limits have actionable messages. A short-lived HttpOnly challenge cookie remembers the email/step and a 60-second resend cooldown; it contains no verification code. Supabase independently enforces its actual send/verification limits. Signout uses Supabase Auth.

**Do these in the hosted Supabase project before deploying:**

1. Authentication → Sign In / Providers → Email: keep Email and new-user signup enabled; keep email confirmation enabled. Set **OTP length to 6**, **OTP expiry to 600 seconds**, and minimum email resend interval to **60 seconds**. The current CLI equivalents are checked in as `otp_length`, `otp_expiry`, and `max_frequency`. Dashboard labels may vary.
2. Authentication → Email Templates: replace **Magic Link** and **Confirm signup** bodies with `supabase/templates/email-code.html`, and use the corresponding code subject. It uses `{{ .Token }}`, with no confirmation/magic link. Both templates matter: first-time and existing users can follow different mail paths.
3. Configure custom SMTP for actual citizen delivery, set a verified sender, and review Auth rate limits for your expected traffic. Supabase’s default mail service is limited and is not a production mailing setup. Test delivery to both a new email and an existing account, including spam folders.
4. Authentication → URL Configuration: set Site URL to your production origin. The code flow verifies on `/signin` and needs no email-link callback. Retain allow-listed `/auth/callback` and `/auth/confirm` URLs only if you still support already-issued confirmation links or the legacy Google OAuth endpoint. `/signup`, `/forgot-password`, and `/reset-password` now redirect to the one code flow and accept no password actions.
5. **Password login control:** the new migration provides `public.reject_password_login(jsonb)`. On a supported **Teams or Enterprise** plan, Authentication → Hooks → Password Verification Attempt: select that Postgres function and enable it. It rejects password attempts with `should_logout_user=false`, preserving existing code sessions. Local config enables this hook. Verify a known existing password is rejected via the direct Auth API while OTP still works.

**Platform limitation:** removing password UI does not disable Supabase’s password endpoints. The current hosted Password Verification Attempt hook is limited to Teams/Enterprise. On Free/Pro, existing passwords can still authenticate through the direct Auth API; there is no separate email-password provider toggle that safely leaves email OTP enabled. Direct signup/recovery/password-setting APIs are also controlled by Supabase rather than SvelteKit. The verification hook blocks password sign-in where available, but does not remove stored credentials or disable every password-management endpoint. Do not disable Email entirely (that also breaks OTP), delete users, or manually rewrite `auth.users` password hashes. A fully enforced code-only policy requires the supported hook/plan or a separately configured compatible Auth deployment. The app makes no claim that old passwords are unusable until this control is activated and tested.

Google buttons have been removed to present the requested single email-code experience. Existing Google identities and the older OAuth callback/start endpoints remain intact for compatibility; no Google credentials are required for the new flow.

Reference: [Supabase email OTP](https://supabase.com/docs/guides/auth/auth-email-passwordless), [Auth hook availability](https://supabase.com/docs/guides/auth/auth-hooks), [Password verification hook](https://supabase.com/docs/guides/auth/auth-hooks/password-verification-hook), [CLI email configuration](https://supabase.com/docs/guides/local-development/cli/config).

### Receiving a link instead of a code

Running `npm run dev` starts the website locally; it does not start or configure Supabase. The supplied `.env.example` points at the hosted project `sfccsrznnxivtmcixlwd`, so its dashboard templates control the emails even on localhost. The templates in `supabase/config.toml` apply only to a local Supabase stack.

In [the hosted project's Auth email templates](https://supabase.com/dashboard/project/sfccsrznnxivtmcixlwd/auth/templates), save `supabase/templates/email-code.html` as the body for **both Confirm signup and Magic Link**. It must display `{{ .Token }}` instead of a `{{ .ConfirmationURL }}` link. `signInWithOtp` supports both formats and does not override the email template. Also configure the hosted Email provider's OTP length to 6 and expiry to 600 seconds to match the form.

After saving, request a **new** code from the app and check the newest email. Already-delivered emails do not change; changing hosted templates does not require rebuilding the website. These settings affect every app using that Supabase project. For a truly local backend, start the local Supabase stack, use its URL/key in `.env`, and restart the app; restart that stack after template/config changes.

## Voting and anonymous discussions

All Issues uses wider reading cards with an issue description, proposed improvement, voting bar, comments and an **Open issue** link. Issue detail pages share the same discussion component and data. Choose **Wanted behavior** or **Unwanted behavior** to vote on the chatbot response. A vote opens its matching reason thread. Readers can switch threads independently, and replies stay on the side where the thread began. The constitution is the collection of all 11 numbered principles.

Anyone can read vote totals, the two newest top-level comment previews and expanded threads. Signing in is required to vote, comment or reply. An account has one ballot per issue; choosing the other vote switches it, and selecting the current vote removes it. Vote buttons retain the reference design’s green/red selected states and use explicit text/pressed states. Empty vote totals have an unfilled bar.

All commenters are **Anonymous**. No display-name/profile table is added. `public.case_comments` contains message IDs and thread references, never Auth identifiers or emails. Ballots live in `private.case_votes`; ownership lives in `private.comment_owners`. Public read RPCs return aggregates and a current-request `my_vote` / `can_delete` boolean, not linkable account identities. Existing no-store response headers prevent personalized state from being shared by caches.

Comments are escaped plain text, 1–2,000 characters, with relative timestamps. Top-level comments load newest first; **Show all comments** expands them and fetches 10 per page. Replies load chronologically in pages of 10. Every comment has Reply; replies to replies join that top-level thread, like a YouTube discussion. Cursor ordering includes the unique message ID to prevent ties from skipping rows. Authors can delete their own comments after confirmation; a deleted parent becomes a tombstone while its replies remain. Deleting an issue cascades its comments, private ownership and votes.

Authenticated SDK calls invoke restricted transactional RPCs; ordinary users cannot write the public table directly or read/forge ballots and ownership. Blank/oversized comments, cross-issue parents, deeper nesting through direct RPCs, hidden issues, and another author’s deletion are rejected by SQL. Client-generated comment IDs make network retries idempotent. Failed requests retain typed text. Feed summaries fetch counts and at most two previews for up to 12 issues in one batch. A discussion outage leaves the issue readable and offers Retry discussion.

Apply `20261106052146_behavior_votes_and_reason_threads.sql` before deploying this version. Existing installations must also apply earlier migrations if they have not already done so. No new environment variables or third-party service is needed. Earlier usefulness ballots are archived privately. Earlier comments are available under **Earlier discussion**, and behavior totals start with the new ballots.

## Historical Storage housekeeping

Owner deletion still hides an issue, removes its images using the Supabase SDK, then deletes issue/screenshot/ownership/upload rows. Cleanup failures can be retried from My Issues. Existing abandoned files and failed deletions can use the preserved `/api/cleanup` endpoint:

- Set server-only `SUPABASE_SERVICE_ROLE_KEY` and random `CLEANUP_SECRET` (at least 32 random bytes).
- Schedule an hourly POST to `/api/cleanup` with `Authorization: Bearer YOUR_CLEANUP_SECRET`; alert/retry on non-2xx. Use a hosting scheduler or Supabase Cron with pg_net/Vault.
- The route processes up to 40 issues per run. No service credential is sent to browsers. New conversation-only issues create no abandoned image files.

```sh
curl --fail --request POST --header "Authorization: Bearer $CLEANUP_SECRET" https://YOUR_APP/api/cleanup
```

## Optional sample issues

The seed includes 50 fictional issue reports across all 11 principles. Each has an example conversation, an observation, a proposed change, and sample wanted and unwanted vote counts. The app labels the records as sample issues and discloses the sample tallies. Real ballots cast on a sample add to its displayed totals.

After applying the behavior-votes migration, load the seed into a development or demo database with administrative access.

```sh
psql "$ADMIN_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f supabase/examples/sample_issues.sql
```

You can also run the seed in that project's SQL Editor. Stable issue IDs make repeat imports safe and preserve subsequent votes and comments.

## Trending and live graphics

Above the public feed, a bubble chart shows all 11 principle totals and a ring chart shows the behavior labels supplied by issue authors. Counts include **all published issues**, independent of search/filter settings and loaded pages; drafts and pending deletions are excluded. Circles also act as keyboard-accessible principle filters. Empty and update-failure states retain clear labels rather than invented data.

`issue_overview()` computes bounded aggregate output in Postgres, and `browse_trending_issues()` returns a safe projection with ten results plus one look-ahead. Neither returns owner IDs, emails or individual ballots. Private ballot triggers maintain `cases.upvotes` transactionally, including vote switches/removal and account-deletion cascades. Counter writes leave issue edit versions and update dates unchanged. SQL denies direct counter and revision writes to app roles.

The browser subscribes only to `public.issue_feed_state`, a singleton containing a global revision and update time. The migration adds **only this table** to the existing `supabase_realtime` publication. Private ballots, ownership and conversation content are never replicated by this feature. Confirm that **Database → Publications → supabase_realtime → issue_feed_state** is enabled after installation. The local-only test harness has no hosted Realtime server; browser tests simulate its WebSocket protocol while all aggregate reads and fixture mutations use real PostgreSQL.

Charts refresh on that signal, when the tab regains focus/visibility or connectivity, and every ten seconds as a recovery fallback. Hidden tabs skip refreshes. Requests are debounced, bounded by a timeout and cancelled on navigation. A failed update keeps the last counts and offers Retry. No new environment variables are needed.

Ranking pages carry a complete `(upvotes, time, cursor, revision)` cursor, returned as `nextCursor` by `/api/issues`. Clients should send those four fields unchanged alongside search/filter settings. If a vote or published issue changes between pages, SQL returns HTTP 409 through the app API. The feed preserves current cards and typed comments, offers **Refresh issues**, and starts a fresh ten-item ranking on request; it does not silently skip or duplicate entries. Changing only unwanted votes leaves the ranking valid. Legacy `/api/cases` routes remain aliases, but paginating clients must use the new cursor.

## Topic synthesis

Apply the topic migration before deploying the new feed. The job uses the project’s existing `DATABASE_URL` on a trusted development or operations machine. Set it to an administrative PostgreSQL connection for the Supabase database where you want the topics published. The sample `DATABASE_URL` targets local development. Use a direct connection or a session pooler so the job can hold its advisory lock on one connection. Install the repository dependencies with `npm ci`. Set `OPENROUTER_API_KEY` in that machine's environment or ignored `.env` file for publishing. The web app never calls OpenRouter and needs neither job credential.

Prepare a review file for all published issues.

```sh
npm run topics -- prepare reviewed.topic-approval.json
```

This creates a private review file populated from the current database, including the description, proposed improvement, principle text, behavior label and conversation evidence where present. Treat the file as sensitive. Review the prefilled text and edit or redact any fields that need sanitizing. You can clear optional evidence if it contains sensitive details. Preserve each `issueId` and `fingerprint`, then set `approved` to `true` for each safe entry. The behavior label used at publication comes from the database.

Exclude names, contact information, identifying context, account or record identifiers, credentials, private links and confidential details from every text field. The command checks for common sensitive patterns, while the human reviewer decides whether a summary is safe to share and still represents the issue. Leave an issue unapproved if it cannot be summarized safely. The entire run then stops before making any model calls. Keep the approval file out of source control. [NVIDIA free endpoint data terms](https://openrouter.ai/nvidia/nemotron-3-ultra-550b-a55b:free)

Publish explicitly after review.

```sh
npm run topics -- publish reviewed.topic-approval.json
```

The command checks all approvals against one complete database snapshot. It calls the specified free Nemotron model with temporary references. The model invents its catalog from the approved evidence on every run. Larger corpora use batches and a reconciliation pass across provisional groups from that same run. Free endpoint failures, invalid responses and stale reviews exit nonzero. If issues or referenced principle text change during the job, prepare and review an updated file. Existing published topics stay visible throughout the job. One transaction replaces the entire catalog and advances the feed revision after the final snapshot check. A successful command prints the number of topics and issues plus the published revision.

All Issues starts at **All topics**. **Unclassified** includes published issues without an assignment, including issues added after synthesis. Topic selection combines with search, the principle filter and ranked pagination.

The topic integration test requires a fresh disposable database with the migrations applied. Set `TEST_TOPIC_DATABASE_URL` to that database and run `npm run test:integration`. It uses synthetic rows and a mocked provider.

## Verification

```sh
npm run format:check
npm run check
npm run prisma:validate
npm test
npm run build
```

Permission tests use a **disposable database only**. The bootstrap imitates Supabase-owned Auth/Storage schemas and must never be applied to an existing or hosted Supabase database.

```sh
initdb -D /tmp/ai-constitutions-test -A trust --locale=C -E UTF8
pg_ctl -D /tmp/ai-constitutions-test -l /tmp/ai-constitutions-test.log -o '-p 55439 -h 127.0.0.1' start
export TEST_DATABASE_URL="postgresql://$USER@127.0.0.1:55439/postgres"
psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f tests/postgres-bootstrap.sql
for migration_file in supabase/migrations/*.sql; do
  psql "$TEST_DATABASE_URL" -v ON_ERROR_STOP=1 -1 -f "$migration_file"
done
npm run test:integration
npx playwright install chromium
npm run test:e2e
```

The PostgreSQL suite exercises real constraints, grants, ownership and Storage RLS using anon, owner and other users, with rolled-back fixture data. The browser suite starts the app and a loopback-only Supabase SDK transport fixture backed by real PostgreSQL. Email delivery/code issuance and file HTTP transport are simulated; fixture code `012345` intentionally tests leading zeros. Tests cover existing/new accounts, code errors, cooldown, change email, protected access/signout, keyboard tabs, light/dark desktop/mobile layouts, transcript capture/read-only display, screenshot-free saves, classifications, historical evidence, browsing and owner management. Artifacts go to ignored `test-results/`.

For actual Supabase Auth/PostgREST/Storage tests, apply all migrations and configure the password hook in an **isolated** local stack or dedicated test project. Set `TEST_SUPABASE_URL`, `TEST_SUPABASE_PUBLISHABLE_KEY`, and `TEST_SUPABASE_SERVICE_ROLE_KEY`; a remote project also requires `TEST_ISOLATED_PROJECT=1`. The optional suite uses administrator-generated email OTPs for temporary fixture accounts, avoiding real email delivery, and cleans up its records. It is skipped without those credentials. Actual SMTP delivery and physical mobile keyboards still need deployment checks.

Stop the disposable database with `pg_ctl -D /tmp/ai-constitutions-test stop`. See `VERIFICATION.md` for results from this implementation.

## Deploy

Apply the new migration, configure hosted Auth, and deploy the matching app together. No new public environment variables are needed.

**Vercel:** use Framework Preset SvelteKit, this package’s folder as Root Directory, Build Command `npm run build`, Node 24.x, and turn Output Directory Override **off**. `vercel.json` clears a stale `public` override; adapter-vercel generates `.vercel/output/` when `VERCEL=1`. Add the two `PUBLIC_SUPABASE_*` values to each deployed environment (Production/Preview), then redeploy. A gitignored local `.env` is not uploaded by Git. Leave `APP_ORIGIN` unset for per-deployment origins or set the canonical origin at build time. `VERCEL=1 npm run build` verifies packaging locally without deploying.

**Node host:** `npm ci && npm run build && npm start` serves adapter-node output in `dist/`. Set the public Supabase values at runtime, optional cleanup secrets, a suitable `PORT`, and `APP_ORIGIN=https://YOUR_APP` at build time behind a proxy. `npm start` loads a local `.env` if present; hosting variables take precedence. Use HTTPS and allow request bodies of at least 512,000 bytes (`BODY_SIZE_LIMIT=512K` is in the example). A static-only host cannot serve SSR/Auth/API routes.

## Issue sorting and voting visibility

Apply `supabase/migrations/20261110160000_issue_sorting.sql` to the target Supabase project before deploying this update. It adds a restricted, bounded `browse_ranked_issues` RPC and ranking invalidation triggers. No tables, Prisma models, or environment variables change.

Before a viewer votes on an issue, the cards and detail page show only total vote and comment counts alongside the two voting buttons. Voting reveals the breakdown and discussion threads. Undoing a vote hides them again, including after reload. Signed-out viewers follow the existing sign-in flow. The SvelteKit discussion responses omit previews and breakdowns before a vote, and the comment-page endpoint requires an existing vote. This is a presentation rule for the website. Published comments and voting aggregates retain their existing public database read permissions.

Sort selection is saved in the URL alongside search, principle, and topic filters. Applying changed filters starts at page one. Refreshing uses a new ranking timestamp, allowing trending order to change as issues age. Issue synthesis remains explicitly triggered and is independent of sorting.
