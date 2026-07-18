import { createClient } from "npm:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const resendApiKey = Deno.env.get("RESEND_API_KEY") || "";
const fromEmail = Deno.env.get("SUPPORT_FROM_EMAIL") || "AFTER <suporte.afterapp@gmail.com>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (!supabaseUrl || !serviceRoleKey) {
      throw new Error("Supabase service role não configurado.");
    }

    const body = await request.json().catch(() => ({}));
    const emailId = body.email_id || body.emailId || body.record?.id || "";
    if (!emailId) throw new Error("Email de suporte não informado.");

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data: email, error: emailError } = await supabase
      .from("support_email_outbox")
      .select("*")
      .eq("id", emailId)
      .eq("status", "pending")
      .maybeSingle();

    if (emailError) throw emailError;
    if (!email) {
      return jsonResponse({ sent: false, skipped: true, reason: "Email inexistente ou já processado." });
    }

    if (!resendApiKey) {
      await markEmail(supabase, email.id, "failed", "RESEND_API_KEY não configurada.");
      return jsonResponse({ sent: false, configured: false }, 202);
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [email.recipient_email],
        subject: email.subject,
        text: email.body,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      await markEmail(supabase, email.id, "failed", text);
      return jsonResponse({ sent: false, error: text }, response.status);
    }

    await supabase
      .from("support_email_outbox")
      .update({
        status: "sent",
        sent_at: new Date().toISOString(),
        attempts: Number(email.attempts || 0) + 1,
        last_error: null,
      })
      .eq("id", email.id);

    return jsonResponse({ sent: true });
  } catch (error) {
    return jsonResponse({ error: String(error?.message || error) }, 400);
  }
});

async function markEmail(supabase: ReturnType<typeof createClient>, id: string, status: string, error: string) {
  await supabase
    .from("support_email_outbox")
    .update({
      status,
      attempts: 1,
      last_error: String(error || "").slice(0, 1000),
    })
    .eq("id", id);
}

function jsonResponse(payload: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
