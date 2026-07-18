# Security Notes

This judging repository is a sanitized snapshot of AFTER.

It intentionally excludes:

- Android signing keys and passwords;
- Firebase `google-services.json`;
- Google and Firebase service-account credentials;
- Supabase personal-access tokens;
- production deployment metadata;
- production user data and local build artifacts.

Client-side publishable keys are also removed so review starts in demo mode and cannot accidentally access the live service.

Please report security concerns privately to the project creator rather than opening a public issue.

