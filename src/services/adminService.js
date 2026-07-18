import { getSupabase } from "./supabaseClient.js";

export function isAdminUser(user) {
  return Boolean(user?.id);
}

async function rpc(name, params = {}) {
  const supabase = await getSupabase();
  const { data, error } = await supabase.rpc(name, params);
  if (error) throw error;
  return data;
}

export async function getAdminMe() {
  const data = await rpc("after_admin_me");
  const row = Array.isArray(data) ? data[0] : data;
  return row || null;
}

export async function bootstrapMasterAdmin() {
  await rpc("after_admin_bootstrap_master");
}

export async function getAdminDashboard() {
  const data = await rpc("after_admin_dashboard_v2");
  return data || {};
}

export async function listAdminUsers({ search = "", status = "all" } = {}) {
  return rpc("after_admin_list_users", {
    search_text: search,
    status_filter: status,
    limit_count: 120
  });
}

export async function listAdminAgeReviews({ search = "", status = "all" } = {}) {
  return rpc("after_admin_list_age_reviews", {
    search_text: search,
    status_filter: status,
    limit_count: 300
  });
}

export async function listAdminLocationPoints() {
  return rpc("after_admin_location_points", { limit_count: 5000 });
}

export async function listAdminReports(filters = {}) {
  const rows = await rpc("after_admin_list_reports", { limit_count: 160 });
  return filterRows(rows, filters, {
    status: ["status"],
    priority: ["prioridade", "priority"],
    reason: ["motivo"],
    search: ["id", "motivo", "tipo", "status", "denunciante_nome", "denunciante_id", "denunciado_nome", "denunciado_id"]
  });
}

export async function listAdminBlocks(filters = {}) {
  const rows = await rpc("after_admin_list_blocks", { limit_count: 180 });
  return filterRows(rows, filters, {
    search: [
      "bloqueador_id",
      "bloqueador_nome",
      "bloqueador_email",
      "bloqueado_id",
      "bloqueado_nome",
      "bloqueado_email"
    ]
  });
}

export async function listAdminDeletionRequests() {
  return rpc("after_admin_list_deletions", { limit_count: 120 });
}

export async function listAdminSupportTickets(filters = {}) {
  const status = filters.status || filters.supportStatus || "all";
  const rows = await rpc("after_admin_list_support_tickets", {
    status_filter: status,
    limit_count: 160
  });
  return filterRows(rows, filters, {
    status: ["status"],
    priority: ["priority"],
    category: ["category"],
    search: ["id", "subject", "category", "message", "user_email", "user_name", "user_id", "admin_response"]
  });
}

export async function listAdminLogs(filters = {}) {
  const rows = await rpc("after_admin_list_logs", { limit_count: 180 });
  return filterRows(rows, filters, {
    action: ["action"],
    search: ["action", "admin_email", "admin_id", "target_table", "target_id"]
  });
}

export async function listAdminProfilePhotos(filters = {}) {
  const rows = await rpc("after_admin_list_profile_photos", {
    status_filter: filters.status || "pending_review",
    search_text: filters.search || "",
    limit_count: 160
  });
  return rows || [];
}

export async function listAdminAccounts() {
  return rpc("after_admin_list_admins", { limit_count: 80 });
}

export async function getAdminHealth() {
  return rpc("after_admin_health");
}

export async function getAdminMarketing(periodDays = 30) {
  const days = Math.max(7, Math.min(Number(periodDays) || 30, 90));
  const data = await rpc("after_admin_marketing_dashboard", { p_period_days: days });
  return data || {};
}

export async function listAdminSettings() {
  const supabase = await getSupabase();
  const { data, error } = await supabase.from("after_app_settings").select("*").order("key");
  if (error) throw error;
  return data || [];
}

export async function updateReportStatus({ reportId, status, notes = "" }) {
  await rpc("after_admin_update_report", {
    report_id: reportId,
    next_status: status,
    admin_notes: notes
  });
}

export async function moderateUser({ userId, status, reason = "" }) {
  await rpc("after_admin_moderate_user", {
    target_user: userId,
    next_status: status,
    reason
  });
}

export async function deleteAdminUser({ userId, reason = "" }) {
  await rpc("after_admin_delete_user", {
    target_user: userId,
    reason
  });
}

export async function setUserVerified({ userId, verified }) {
  await rpc("after_admin_set_user_verified", {
    target_user: userId,
    verified: Boolean(verified)
  });
}

export async function setUserAgeVerified({ userId, verified = true }) {
  await rpc("after_admin_set_user_age_verified", {
    target_user: userId,
    verified: Boolean(verified)
  });
}

export async function resetUserTrust({ userId, reason = "" }) {
  await rpc("after_admin_reset_user_trust", { target_user: userId, reason });
}

export async function resetUserReports({ userId, reason = "" }) {
  await rpc("after_admin_reset_user_reports", { target_user: userId, reason });
}

export async function removeAdminBlock({ blockerId, blockedId, reason = "" }) {
  await rpc("after_admin_remove_block", {
    blocker: blockerId,
    blocked: blockedId,
    reason
  });
}

export async function updateDeletionRequest({ requestId, status, reason = "" }) {
  await rpc("after_admin_update_deletion", {
    request_id: requestId,
    next_status: status,
    reason
  });
}

export async function updateSupportTicket({ ticketId, status = "", priority = "", response = "" }) {
  await rpc("after_admin_update_support_ticket", {
    ticket_id: ticketId,
    next_status: status || null,
    next_priority: priority || null,
    response_text: response || null,
    assign_to: null
  });
}

export async function reviewProfilePhoto({ photoId, status, reason = "" }) {
  await rpc("after_admin_review_profile_photo", {
    photo_id: photoId,
    next_status: status,
    reason
  });
}

export async function queueAdminNotification({ targetType, targetValue, type, title, body }) {
  return rpc("after_admin_queue_notification", {
    target_type: targetType,
    target_value: targetValue,
    notification_type: type,
    title,
    body
  });
}

export async function updateAppSetting({ key, value }) {
  await rpc("after_admin_update_app_setting", {
    setting_key: key,
    setting_value: value
  });
}

export async function updateOfficialProfile({ name, photo, bio, welcomeMessage, status, autoWelcome }) {
  await rpc("after_admin_update_official_profile", {
    official_name: name,
    official_photo: photo,
    official_bio: bio,
    welcome_message: welcomeMessage,
    official_status: status,
    auto_welcome: Boolean(autoWelcome)
  });
}

export async function upsertAdminAccount({ email, role, active }) {
  await rpc("after_admin_upsert_admin", {
    admin_email: email,
    next_role: role,
    active_state: Boolean(active)
  });
}

export async function getAdminBundle(filters = {}) {
  const userFilters = filters.users || filters.userFilters || filters || {};
  const reportFilters = filters.reports || {};
  const ageFilters = filters.age || {};
  const blockFilters = filters.blocks || {};
  const supportFilters = filters.support || {};
  const auditFilters = filters.audit || {};
  const photoFilters = filters.photos || {};
  const marketingFilters = filters.marketing || {};
  const results = await settleAdminBundle({
    me: () => getAdminMe(),
    dashboard: () => getAdminDashboard(),
    users: () => listAdminUsers(userFilters),
    ageUsers: () => listAdminAgeReviews(ageFilters),
    locationPoints: () => listAdminLocationPoints(),
    reports: () => listAdminReports(reportFilters),
    blocks: () => listAdminBlocks(blockFilters),
    deletions: () => listAdminDeletionRequests(),
    supportTickets: () => listAdminSupportTickets(supportFilters),
    logs: () => listAdminLogs(auditFilters),
    health: () => getAdminHealth(),
    settings: () => listAdminSettings(),
    admins: () => listAdminAccounts(),
    profilePhotos: () => listAdminProfilePhotos(photoFilters),
    photoModerationAll: () => listAdminProfilePhotos({ status: "all", search: "" }),
    marketing: () => getAdminMarketing(marketingFilters.periodDays || 30)
  });
  const {
    me,
    dashboard = {},
    users = [],
    ageUsers = [],
    locationPoints = [],
    reports = [],
    blocks = [],
    deletions = [],
    supportTickets = [],
    logs = [],
    settings = [],
    admins = [],
    profilePhotos = [],
    photoModerationAll = [],
    marketing = {}
  } = results.data;
  const health = {
    ...(results.data.health || {}),
    section_errors: results.errors
  };
  const hydratedBlocks = hydrateAdminBlocks(blocks, users);
  const enrichedDashboard = enrichDashboard(dashboard, { users, reports, blocks: hydratedBlocks, supportTickets, photos: photoModerationAll });

  return {
    me,
    dashboard: enrichedDashboard,
    users,
    ageUsers,
    locationPoints,
    reports,
    blocks: hydratedBlocks,
    deletions,
    supportTickets,
    logs,
    health,
    settings,
    admins,
    profilePhotos,
    photoModerationAll,
    marketing
  };
}

export async function subscribeAdminRealtime(onChange) {
  const supabase = await getSupabase();
  const channel = supabase.channel("after-admin-command-center");
  const tables = [
    "usuarios",
    "mensagens",
    "profile_photos",
    "denuncias",
    "bloqueios",
    "admin_logs",
    "after_push_events",
    "after_admin_notifications",
    "support_tickets",
    "conta_exclusao_solicitacoes",
    "after_marketing_events"
  ];

  tables.forEach((table) => {
    channel.on("postgres_changes", { event: "*", schema: "public", table }, () => onChange?.(table));
  });

  channel.subscribe();
  return () => supabase.removeChannel(channel);
}

async function settleAdminBundle(loaders = {}) {
  const entries = Object.entries(loaders);
  const settled = await Promise.allSettled(entries.map(([, loader]) => loader()));
  const data = {};
  const errors = {};

  settled.forEach((result, index) => {
    const key = entries[index][0];
    if (result.status === "fulfilled") {
      data[key] = result.value;
      return;
    }
    errors[key] = result.reason?.message || String(result.reason || "Falha ao carregar");
  });

  return { data, errors };
}

function enrichDashboard(dashboard = {}, { users = [], reports = [], blocks = [], supportTickets = [], photos = [] } = {}) {
  const pendingReports = reports.filter((item) => ["open", "reviewing", "pending"].includes(String(item.status || "open"))).length;
  const openSupport = supportTickets.filter((item) => ["open", "in_progress", "waiting_user"].includes(String(item.status || "open"))).length;
  const suspended = users.filter((item) => String(item.moderation_status || "").includes("suspended")).length;
  const banned = users.filter((item) => ["blocked", "banned"].includes(String(item.moderation_status || ""))).length;
  const ageUnverified = users.filter((item) => !item.age_verified).length;
  const pendingPhotos = photos.filter((item) => ["pending_review", "manual_review"].includes(String(item.status || ""))).length;
  const underageSuspected = users.filter((item) =>
    String(item.age_review_status || item.moderation_reason || "").toLowerCase().includes("menor")
  ).length;

  return {
    ...dashboard,
    reports_pending: dashboard.reports_pending ?? pendingReports,
    support_open: dashboard.support_open ?? openSupport,
    accounts_suspended: dashboard.accounts_suspended ?? suspended,
    accounts_blocked: dashboard.accounts_blocked ?? banned,
    profiles_blocked: dashboard.profiles_blocked ?? blocks.length,
    age_unverified: dashboard.age_unverified ?? ageUnverified,
    underage_suspected: dashboard.underage_suspected ?? underageSuspected,
    photos_pending: dashboard.photos_pending ?? pendingPhotos
  };
}

function filterRows(rows = [], filters = {}, config = {}) {
  const normalized = normalizeFilterObject(filters);
  return (rows || []).filter((row) => {
    for (const [filterName, fields] of Object.entries(config)) {
      const filterValue = normalized[filterName];
      if (!filterValue || filterValue === "all") continue;
      if (filterName === "search") {
        const haystack = normalizeSearchText(fields.map((field) => stringifyValue(row?.[field])).join(" "));
        if (!haystack.includes(normalizeSearchText(filterValue))) return false;
        continue;
      }
      const values = fields.map((field) => normalizeSearchText(stringifyValue(row?.[field])));
      const target = normalizeSearchText(filterValue);
      const exactFilters = ["status", "priority"];
      const matches = exactFilters.includes(filterName)
        ? values.some((value) => value === target)
        : values.some((value) => value.includes(target));
      if (!matches) return false;
    }
    return true;
  });
}

function normalizeFilterObject(filters = {}) {
  return Object.fromEntries(
    Object.entries(filters || {}).map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
  );
}

function stringifyValue(value) {
  if (value === null || value === undefined) return "";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function normalizeSearchText(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

function hydrateAdminBlocks(blocks = [], users = []) {
  const usersById = new Map((users || []).map((user) => [user.id, user]));

  return (blocks || []).map((block) => {
    const blocker = usersById.get(block.bloqueador_id) || {};
    const blocked = usersById.get(block.bloqueado_id) || {};

    return {
      ...block,
      bloqueador_nome: block.bloqueador_nome || blocker.name || blocker.username || blocker.nome || "",
      bloqueador_email: block.bloqueador_email || blocker.email || "",
      bloqueado_nome: block.bloqueado_nome || blocked.name || blocked.username || blocked.nome || "",
      bloqueado_email: block.bloqueado_email || blocked.email || ""
    };
  });
}



