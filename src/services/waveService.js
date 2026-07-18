import { mapProfile } from "./profileService.js";
import { getSupabase } from "./supabaseClient.js";

export async function listWaves(currentUserId) {
  const supabase = await getSupabase();
  const { data: waves, error } = await supabase
    .from("acenos")
    .select("*")
    .or(`sender_id.eq.${currentUserId},receiver_id.eq.${currentUserId}`)
    .order("updated_at", { ascending: false })
    .limit(80);

  if (error) throw error;
  if (!waves?.length) return [];

  const profileIds = Array.from(
    new Set(
      waves
        .flatMap((wave) => [wave.sender_id, wave.receiver_id])
        .filter((id) => id && id !== currentUserId)
    )
  );

  const { data: profiles, error: profilesError } = await supabase.from("usuarios").select("*").in("id", profileIds);
  if (profilesError) throw profilesError;

  const profileMap = new Map((profiles || []).map((profile) => [profile.id, mapProfile(profile)]));
  return normalizeWaves(waves, currentUserId, profileMap);
}

export async function sendWave({ receiverId }) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("enviar_aceno", {
    receiver: receiverId
  });

  if (error) throw error;
  return Array.isArray(data) ? data[0] : data;
}

export async function undoWave({ waveId }) {
  const supabase = await getSupabase();
  const { error } = await supabase.rpc("desfazer_aceno", {
    aceno_id: waveId
  });

  if (error) throw error;
}

export async function subscribeToWaves(currentUserId, callback) {
  const supabase = await getSupabase();
  const handleChange = (payload) => {
    const wave = payload.new;
    if (!wave) return;
    if (wave.sender_id === currentUserId || wave.receiver_id === currentUserId) {
      callback(wave);
    }
  };

  const channel = supabase.channel(`after-waves-${currentUserId}`);
  ["INSERT", "UPDATE"].forEach((event) => {
    channel
      .on("postgres_changes", { event, schema: "public", table: "acenos", filter: `sender_id=eq.${currentUserId}` }, handleChange)
      .on("postgres_changes", { event, schema: "public", table: "acenos", filter: `receiver_id=eq.${currentUserId}` }, handleChange);
  });
  return channel.subscribe();
}

function normalizeWaves(waves, currentUserId, profileMap) {
  const interactions = [];
  const seenMutual = new Set();

  waves.forEach((wave) => {
    const profileId = wave.sender_id === currentUserId ? wave.receiver_id : wave.sender_id;
    const profile = profileMap.get(profileId);
    if (!profile) return;

    const isSender = wave.sender_id === currentUserId;
    const isMutual = wave.status === "mutual";
    const pairKey = [wave.sender_id, wave.receiver_id].sort().join(":");

    if (isMutual) {
      if (seenMutual.has(pairKey)) return;
      seenMutual.add(pairKey);
    }

    interactions.push({
      id: wave.id,
      profileId,
      profile,
      direction: isSender ? "sent" : "received",
      status: wave.status || "sent",
      isMutual,
      canReturn: !isSender && wave.status === "sent",
      createdAt: wave.created_at,
      updatedAt: wave.updated_at
    });
  });

  return interactions.sort((a, b) => new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime());
}



