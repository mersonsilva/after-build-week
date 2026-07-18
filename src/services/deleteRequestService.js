import { getSupabase } from "./supabaseClient.js";

export async function requestAccountDeletion({ email, message = "" }) {
  const supabase = await getSupabase();
  const normalizedEmail = String(email || "").trim().toLowerCase();

  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    throw new Error("Informe um email válido.");
  }

  const { error } = await supabase.from("conta_exclusao_solicitacoes").insert({
    email: normalizedEmail,
    mensagem: String(message || "").trim()
  });

  if (error) throw error;
}



