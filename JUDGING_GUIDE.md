# Judging Guide

## Fastest path

1. Install Node.js 24 or newer.
2. Run `npm install`.
3. Run `npm run build`.
4. Serve `dist/` with any static HTTP server.
5. Open the site and choose **Cadastro**. With backend credentials intentionally absent, AFTER runs in its built-in demo mode.

Demo mode includes sample profiles, discovery, interests, conversations, profile editing, and the principal navigation paths. It does not write to the production backend.

## Full backend review

The `supabase/` directory contains the schema migrations, RLS policies, RPCs, Edge Functions, photo moderation workflow, notifications, and administrative support used by production.

To connect a separate Supabase project:

1. Apply the migrations in timestamp order.
2. Deploy the required functions.
3. Configure function secrets in Supabase, never in the client.
4. Add the project URL and publishable key in `src/config/supabase.js`.

Google Vision and Firebase service-account credentials are intentionally excluded.

## Android

The `android/` directory is the Capacitor Android project. Production signing material and `google-services.json` are intentionally excluded. After configuring your own Firebase project:

```powershell
npm run cap:sync
cd android
./gradlew assembleDebug
```

## What to inspect

- `src/app.js`: application orchestration and state transitions.
- `src/services/`: Supabase, chat, photos, presence, notifications, and native bridges.
- `src/lib/photo/`: universal image selection, crop, conversion, and upload pipeline.
- `src/views/`: product surfaces for discovery, connections, chat, profile, settings, and admin.
- `supabase/migrations/`: data model and security evolution.
- `supabase/functions/`: server-side push and Google Vision moderation.

## Build Week evidence

- Core Codex session ID: `019ee61b-1ba3-78c3-b219-f16947cad37d`
- Category: Apps for Your Life
- The majority of the product iteration, debugging, and release preparation is documented in that long-running Codex task.

