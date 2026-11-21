# Password recovery email

The app accepts exactly eight ASCII digits. Leading zeros are preserved. It
requests a recovery email with `resetPasswordForEmail`, verifies the entered
token using `verifyOtp({ email, token, type: 'recovery' })`, then changes the
password using `updateUser`.

## Hosted project setup

1. In Supabase Authentication, open Sign In / Providers, then Email. Set **Email
   OTP length** to **8** and save. The corresponding Auth configuration field is
   `mailer_otp_length`. The template itself cannot change the generated length.
2. Open Authentication → Email Templates → Reset password.
3. Set the subject to `Reset your password — GTA 6 Interactive Map`.
4. Paste the complete contents of `templates/reset-password.html` into the email
   body and save. Keep `{{ .Token }}` unchanged; Supabase inserts the actual code.
5. Request a new recovery email from the app for a test account. Verify that it
   contains eight digits, enter the code and a new password, then verify sign-in
   with the new password.

This is the Reset password template, not Magic Link or Reauthentication. It uses
the numeric token rather than a redirect URL because recovery happens inside
the app. The template deliberately does not claim a fixed expiration duration;
the project's Email OTP Expiration setting controls validity.

Local files do not update hosted Supabase settings or templates. Deploy the
template and length setting in the intended project's dashboard.

References:
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/reference/javascript/auth-verifyotp
