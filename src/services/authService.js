import { getSupabase } from "./supabaseClient.js";

const AUTH_CALLBACK_PATH = "/auth/callback";
const NATIVE_AUTH_REDIRECT_URL = "br.com.afterapp.app://auth/callback";

function isNativeApp() {
  return Boolean(window.Capacitor?.isNativePlatform?.());
}

export function getAuthRedirectUrl() {
  if (isNativeApp()) return NATIVE_AUTH_REDIRECT_URL;
  return `${window.location.origin}${AUTH_CALLBACK_PATH}`;
}

export async function getSession() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.getSession();
  if (error) throw error;
  return data.session;
}

export async function exchangeAuthCodeForSession(code) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) throw error;
  return data.session;
}

export async function signInWithEmail(email, password) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data.session;
}

export async function signUpWithEmail({ email, password, profile }) {
  const supabase = await getSupabase();
  const displayName = String(profile.name || "").trim();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: {
        username: displayName,
        nome: displayName,
        idade: profile.age,
        cidade: profile.city,
        bio: profile.bio,
        accepted_terms_at: profile.acceptedTermsAt || null,
        accepted_privacy_at: profile.acceptedPrivacyAt || null,
        age_confirmed: profile.ageConfirmed === true,
        birth_date: profile.birthDate || null,
        age_verified: profile.ageVerified === true,
        age_verified_at: profile.ageVerifiedAt || null,
        age_verification_method: profile.ageVerificationMethod || null
      },
      emailRedirectTo: getAuthRedirectUrl()
    }
  });

  if (error) throw error;
  return data;
}

export async function signInWithGoogle() {
  const supabase = await getSupabase();
  const redirectTo = getAuthRedirectUrl();
  const native = isNativeApp();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo,
      skipBrowserRedirect: native,
      queryParams: {
        access_type: "offline",
        prompt: "select_account"
      }
    }
  });

  if (error) throw error;

  if (native) {
    if (!data?.url) throw new Error("Não foi possível iniciar o login com Google.");
    const browser = window.Capacitor?.Plugins?.Browser;
    if (!browser?.open) throw new Error("O navegador seguro do Android não está disponível.");
    await browser.open({ url: data.url });
  }
}

export async function resetPassword(email) {
  const supabase = await getSupabase();
  const redirectTo = getAuthRedirectUrl();
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
  if (error) throw error;
}

export async function resendConfirmationEmail(email) {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.resend({
    type: "signup",
    email,
    options: {
      emailRedirectTo: getAuthRedirectUrl()
    }
  });
  if (error) throw error;
}

export async function signOut(options = { scope: "local" }) {
  const supabase = await getSupabase();
  const { error } = await supabase.auth.signOut(options);
  if (!error) return;

  if (options?.scope) {
    const fallback = await supabase.auth.signOut();
    if (fallback.error) throw fallback.error;
    return;
  }

  throw error;
}

export async function deleteAccount() {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc("excluir_minha_conta");
  if (error) throw error;
  await supabase.auth.signOut();
}

export async function onAuthChange(callback) {
  const supabase = await getSupabase();
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
  return data.subscription;
}



