# Voting and comments update — 2026-10-29

All Cases now uses wider reading cards modeled on the supplied reference: a green/red results bar, Upvote/Downvote buttons with selected states, a public comment box, two anonymous comment previews, expandable threads, and Open case at the bottom right. The detail page shares the same voting/discussion component. Upvotes highlight useful cases; they do not approve constitutional changes or classify model behavior.

Comments show Anonymous and relative timestamps. Signed-in users can post comments/replies, switch or remove a vote, and delete their own comments with confirmation. Deleting a parent preserves its replies. Replies to replies join the root thread. New replies appear immediately even when older reply pages remain unloaded. Comment/reply pagination is bounded in SQL with stable timestamp/ID cursors and client deduplication. Dynamic case links do not hover-prefetch stale discussions.

The additive migration `supabase/migrations/20261029155023_case_votes_and_comments.sql` creates public comments and private ballot/ownership tables with RLS and restricted transactional RPCs. It preserves existing accounts, cases, evidence and author anonymity. Prisma documents the same structure. Application requests use the existing Supabase SDK and verified SSR authentication. No new environment variables are required.

## Current verification

- Formatting and Git whitespace checks pass; Svelte/TypeScript reports zero errors/warnings; Prisma validation passes.
- 86 unit tests pass, including comment/vote validation, relative times, deduplication, same-origin/authentication checks, payload limits and API permissions.
- 17 isolated PostgreSQL tests pass, including the previous case/evidence suite plus voting, anonymous read responses, private ownership/ballot protection, idempotency, comment validation, cross-case/deep-thread rejection, author-only deletion, tombstones, tied-time root/reply pagination, hidden-case access and deletion cascades.
- All 68 browser scenarios pass in Chromium across desktop/mobile and light/dark, including existing authentication/chatbot/case management and new discussion workflows. Unlike the older run below, the standard Playwright runner was used successfully. It covers public previews, comment/reply expansion and pagination, vote switching/removal and persistence, safe text, failed-post recovery, cross-page freshness, confirmed deletion and immediate replies in long threads.
- Adapter-node and adapter-vercel production builds pass. Browser fixtures use a loopback-only SDK transport backed by real PostgreSQL; email delivery and file transport remain simulated.
- Visual inspection covered the case cards, comments and replies in mobile/desktop and light/dark. Physical phone keyboards and safe-area insets remain emulated.

## Remaining external setup

Apply the new discussion migration before deploying. Apply any earlier unapplied migration first; the conversation-only app requires the preceding `20261023000453_conversation_cases_and_email_codes.sql`. Full setup is in README. No hosted migrations, live votes/comments, emails or deployment were created during this work. No production fixtures were added.

The optional real Supabase Auth/PostgREST/Storage tests remain skipped (4 tests; no isolated-project administrator credentials). SQL/RLS checks ran against a fresh local database with all four migrations. A read-only hosted advisory scan still reports pre-existing private deny-all tables and intentionally exposed restricted security-definer RPCs; this is not a post-deployment certification. Relevant guidance: [RLS with no policy](https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy), [security-definer functions](https://supabase.com/docs/guides/database/database-linter?lint=0028_anon_security_definer_function_executable).

The earlier email-provider setup and password-login limitations documented below still apply. Formal moderation/review workflows, notifications and model training remain outside this update.

---

# Verification and delivery — 2026-10-22

Implemented in the existing workspace without changing accounts or hosted citizen data:

- One email-code sign-in/signup UI, six-digit string input, cooldown/change-email/error states, SSR cookies and verified protected operations. Password form actions are removed; old password/signup URLs redirect to the code flow.
- Home / Chatbot / All Cases bottom tabs at every width, with icons, active states, keyboard focus and mobile safe-area spacing. Separate account controls and retained sun/moon toggle.
- New case entry only from Chatbot. Full conversation snapshot freezes before navigation, is read-only on the form/detail/edit pages, and is saved atomically with required good/bad classification. No new screenshot creation/upload flow. Historical evidence and unclassified rows are preserved.
- Updated homepage, authoritative SQL migration, consistent Prisma schema, code-email templates and local Auth configuration. Browse responses omit large transcript/proposal bodies.

## Completed checks

| Check                                         | Result                                                                           |
| --------------------------------------------- | -------------------------------------------------------------------------------- |
| Prettier formatting and Git whitespace checks | Passed                                                                           |
| Svelte / TypeScript checks                    | Zero errors or warnings                                                          |
| Prisma schema validation                      | Passed                                                                           |
| Unit tests                                    | 78 passed                                                                        |
| Fresh database installation                   | Bootstrap plus all 3 migrations applied successfully to isolated PostgreSQL 18.6 |
| Direct SQL permissions/integration tests      | 10 passed; real roles, constraints, RPCs, ownership and Storage RLS              |
| Browser scenarios                             | 48 passed: 12 scenarios × desktop/mobile × light/dark                            |
| Production adapter-node build                 | Passed                                                                           |
| Production adapter-vercel build               | Passed; `.vercel/output` generated                                               |

The PostgreSQL tests use rolled-back fixtures and separate anonymous/owner/other roles. They exercise required transcript/classification/text boundaries; old RPC retirement; atomic creation/idempotent retries; public anonymity; immutable evidence; versioned edits; historical screenshots/classifications; search/filter/order/keyset pagination; case and screenshot mutation rejection; full deletion cleanup; and restricted password-hook execution.

Browser scenarios exercised existing-user and new-user OTP sessions, leading zeros and code-input attributes, wrong/expired-code messages, delivery errors, resend cooldown, changing email, session persistence/signout, intended-page returns, retired routes, keyboard tabs/account/dialogs, theme persistence, desktop/mobile overflow and compact keyboard viewport, 50 hints, full multi-turn capture, safe text/read-only rendering, failed-save preservation/retry, screenshot-free publication, classification display/editing, public detail, historical evidence enlargement, another user’s denied edit, deletion, search/filter/sort/load-more and retry states. Extra compact-layout checks were run after spacing adjustments.

**Browser execution caveat:** the standard Playwright runner stalled during worker teardown in this environment after a failed scenario. The final passing run executed the checked-in Playwright scenario bodies and assertions through a standalone harness against the same local app and SDK fixture, using matching Chromium 156. It did not use hosted citizen data. Browser artifacts are in ignored `test-results/otp-standalone-*` folders. The normal `npm run test:e2e` configuration remains supplied for standard environments.

Visual inspection covered the homepage, chat, compact chat, code entry, case form and detail screens. Physical mobile keyboards and actual safe-area insets were emulated rather than tested on a phone.

## External configuration and unverified hosted checks

No deployment, hosted migration application or Auth configuration change was performed. The new migration retires RPCs used by older app versions, so apply it together with deploying this version. Exact instructions are in `README.md`.

1. Apply `supabase/migrations/20261023000453_conversation_cases_and_email_codes.sql` to an existing installation that already has the previous two migrations.
2. Configure hosted Email OTP length 6, expiry 600 seconds, send interval 60 seconds, signup/confirmations enabled, and install `supabase/templates/email-code.html` in both Magic Link and Confirm signup templates. Configure production SMTP and rate limits.
3. On Teams/Enterprise, activate the supplied Password Verification Attempt hook and verify that a known old password is rejected while emailed codes still work. On Free/Pro, existing passwords remain usable through the direct Auth API; the email provider has no separate supported password-off switch preserving OTP. Removing the UI does not disable those credentials or password-management endpoints.
4. Deploy with the existing public environment variables and verify real email delivery for an existing and a new address. Preserve historical Storage housekeeping configuration as needed.

The optional real Supabase Auth/PostgREST/Storage suite has **4 skipped tests**, because isolated-project administrator credentials were not supplied. Actual hosted SMTP/code delivery, hosted hook activation/password rejection, and full local Supabase Docker-stack startup were not verified. The checked-in local configuration follows current official documentation, but still requires a running stack to exercise actual Auth transport.

A read-only hosted security advisory scan was performed before migration delivery. It flagged the existing private tables with RLS/no policies (intentional deny-all access), public/owner RPCs using security-definer functions (intentional private-owner/Storage access with explicit auth checks, fixed search paths and restricted grants), and disabled leaked-password protection. These are not a post-migration hosted security certification. The new RPC and hook grants/denials were verified in the isolated SQL suite.
