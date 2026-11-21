# Help & Feedback setup

The app uses the same private support conversations as Project Zomboid Map, with English copy only. It connects through the app's existing Supabase client; no extra environment variables or anonymous sign-in provider are needed.

## Database migration

Apply `migrations/202608310001-create-support.sql` to the **Peak Map** Supabase project (`svacqipcsbvjcbwycare`) using the SQL editor or the project's normal migration workflow. The migration is idempotent and installs the private tables, RPCs, ownership checks, rate limits, and support admin membership used by the PZ implementation.

The default support admin email matches PZ. Review `support_admin_emails()` in the migration if that account should change. Membership is seeded for existing accounts and added automatically when a matching account registers later.

Until the migration is applied, the UI can open but reports cannot be sent or loaded. App builds and the mocked tests do not deploy the migration.

## Verification

Run `npm run test:support` for prompt rotation, unread badges, draft preservation, conversation state, and failure handling.

After applying the migration:

1. Open Help & Feedback while signed out and send a disposable report.
2. Sign in with the support admin account and open Inbox. Reply to the report.
3. Reopen the original user session and verify the unread indicator and reply.
4. Verify message editing, closing/reopening, and deleting the disposable conversation.

Anonymous ownership is stored under `peak-map:support-token`. Reports bind to the signed-in account when available, following the PZ behavior. Never publish a device token.
