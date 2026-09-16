# Firebase authentication setup

1. Create or select a Firebase project.
2. Enable **Authentication > Sign-in method > Email/Password**.
3. Create a Web App and copy its config into `.env` using `.env.example`.
4. Create a service account in **Project settings > Service accounts**, then either:
   - set `GOOGLE_APPLICATION_CREDENTIALS` to the downloaded JSON file, or
   - set `FIREBASE_SERVICE_ACCOUNT_JSON` to the JSON string.
5. Set `FIREBASE_PROJECT_ID` to the Firebase project ID and restart the server.
6. Deploy `firestore.rules` with the Firebase CLI or paste it into the Firestore Rules editor.
7. Register the first account. The server creates `slipsmart_users/{firebaseUid}` with role `user`.
8. Promote an administrator by setting that document's `role` to `admin` in the Firebase console, or add the email to `ADMIN_EMAILS` before registration.

The browser only receives the Firebase web config. The Admin SDK credential must remain server-side and must never be placed in `public/`.

The server continues to keep purchases, AI credits, slips, and AI generations in SQLite. Firebase UID links those records to the Firebase account. Only authenticated users can buy slips or credits/use AI, and only users with the server-verified admin role can create or edit slips.

This app uses the separate top-level `slipsmart_users` collection so it can share the same Firebase project/database with another application without using or modifying that application's `admissions_applications` data.

Email verification is handled by Firebase Auth. Users receive a verification link after registration and cannot purchase, buy credits, use AI, or access admin routes until their email is verified.

For purchase receipts, configure a Resend API key and a verified sender address in `.env`:

```env
RESEND_API_KEY=re_...
RECEIPT_FROM=SlipSmart <receipts@your-verified-domain.com>
```

Receipts are sent after Paystack or demo payment completion. If email delivery is not configured, purchases still complete normally and the receipt is skipped.
