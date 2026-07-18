# Google Vision no AFTER

A moderação automática de fotos usa uma Conta de Serviço do Google Cloud Vision apenas no backend.

## Secrets necessários

Configure no Supabase Edge Functions:

- `GOOGLE_VISION_SERVICE_ACCOUNT_BASE64`: JSON da conta de serviço convertido para Base64.
- `GOOGLE_VISION_PROJECT_ID`: `project_id` do mesmo JSON.

Nunca coloque o JSON dentro do app Android, frontend, GitHub ou bundle de produção.

## PowerShell

Depois de fazer `supabase login`, rode:

```powershell
$serviceAccountPath = "C:\Users\emers\Downloads\after-501913-05fdc7b97368.json"
$json = Get-Content -Raw -LiteralPath $serviceAccountPath
$projectId = ($json | ConvertFrom-Json).project_id
$base64 = [Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($json))
npx supabase secrets set GOOGLE_VISION_SERVICE_ACCOUNT_BASE64="$base64" GOOGLE_VISION_PROJECT_ID="$projectId"
npx supabase functions deploy moderate-profile-photo
```

Antes de usar em produção, rode também a migration:

`supabase/migrations/20260709103000_google_vision_photo_moderation.sql`
