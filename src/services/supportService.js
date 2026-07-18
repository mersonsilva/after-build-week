import { getSupabase } from "./supabaseClient.js";

export async function sendSupportMessage({ subject, category, message, deviceInfo = "", appVersion = "" }) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("after_create_support_ticket", {
    subject_text: subject,
    category_text: category,
    message_text: String(message || "").trim(),
    device_text: deviceInfo,
    version_text: appVersion
  });
  if (error) throw error;
  return data;
}

export async function listMySupportTickets() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc("after_list_my_support_tickets", {
    limit_count: 60
  });
  if (error) throw error;
  return data || [];
}



