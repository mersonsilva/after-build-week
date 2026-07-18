// Empty values intentionally start the review build in its built-in demo mode.
// Add credentials from your own Supabase project to exercise the full backend.
export const SUPABASE_URL = "";
export const SUPABASE_ANON_KEY = "";
export const SUPABASE_AVATAR_BUCKET = "avatars";
export const SUPABASE_CHAT_MEDIA_BUCKET = "chat-media";
export const WEB_PUSH_PUBLIC_KEY = "";

export const isSupabaseConfigured =
  SUPABASE_URL.startsWith("https://") &&
  SUPABASE_ANON_KEY.length > 20;



