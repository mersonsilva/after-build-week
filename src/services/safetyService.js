import { getSupabase } from "./supabaseClient.js";
import { mapProfile } from "./profileService.js";

export async function blockProfile({ blockerId, blockedId }) {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("bloqueios")
    .upsert(
      {
        bloqueador_id: blockerId,
        bloqueado_id: blockedId
      },
      {
        onConflict: "bloqueador_id,bloqueado_id",
        ignoreDuplicates: true
      }
    );

  if (error) throw error;
}

export async function unblockProfile({ blockerId, blockedId }) {
  const supabase = await getSupabase();
  const { error } = await supabase
    .from("bloqueios")
    .delete()
    .eq("bloqueador_id", blockerId)
    .eq("bloqueado_id", blockedId);

  if (error) throw error;
}

export async function listBlockedProfileIds(userId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("after_blocked_profile_ids");

  if (!error) {
    return (data || []).map((row) => row.profile_id || row).filter(Boolean);
  }

  const { data: fallback, error: fallbackError } = await supabase
    .from("bloqueios")
    .select("bloqueado_id")
    .eq("bloqueador_id", userId);

  if (fallbackError) throw fallbackError;
  return (fallback || []).map((row) => row.bloqueado_id).filter(Boolean);
}

export async function listBlockedProfiles(userId) {
  const supabase = await getSupabase();
  const { data, error } = await supabase
    .from("bloqueios")
    .select("bloqueado_id")
    .eq("bloqueador_id", userId)
    .order("criado_em", { ascending: false });

  if (error) throw error;

  const ids = (data || []).map((row) => row.bloqueado_id).filter(Boolean);
  if (!ids.length) return [];

  const { data: profiles, error: profilesError } = await supabase.from("usuarios").select("*").in("id", ids);
  if (profilesError) throw profilesError;

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, mapProfile(profile)]));
  return ids.map((id) => profileMap.get(id)).filter(Boolean);
}

export async function reportProfile({ reporterId, reportedId, reason }) {
  const supabase = await getSupabase();
  const { error } = await supabase.from("denuncias").insert({
    denunciante_id: reporterId,
    denunciado_id: reportedId,
    motivo: reason
  });

  if (error) throw error;
}



