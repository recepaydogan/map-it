# Help & Feedback

The support page uses the existing Supabase client and the same private conversation workflow as the reference apps. Only English copy is included. Colors come from the app theme.

## Database setup

Apply `migrations/202609100001-create-support.sql` to the Supabase project configured by `VITE_SUPABASE_URL`. The migration is idempotent and includes private tables, ownership checks, staff membership, and rate-limited RPCs. The staff email list matches the reference implementation; see `support_admin_emails()`.

After the initial setup, apply `migrations/202609100002-support-account-isolation.sql`. This follow-up migration restricts device-token ownership to unclaimed reports. Account-bound reports require the owning account; staff can still access them in the inbox without being treated as their author. The follow-up has been tested locally but has not been deployed by this workspace. It does not rewrite existing authors, emails, or messages. No additional environment variables or anonymous auth provider are needed.

Device ownership is stored under `${GAME_CONFIG.appSlug}:support-token`; signing in claims unclaimed device reports for the account. Sign-out or switching away from a signed-in account rotates that identity and clears private support state. Late requests from an earlier account cannot repopulate the new account's store.

## Verification

Run `npm run test:support` for prompt rotation, unread badges, draft preservation, conversation state, and a local PostgreSQL migration/ownership/conversation test, including same-device account isolation, auth transitions and late-response invalidation. TypeScript and production bundling were also checked.

After deployment, verify anonymous report creation, staff inbox/reply, unread notification, editing, closing/reopening, and deletion using a disposable conversation. Browser visual verification could not complete because the available in-app browser could not reach the local preview.
