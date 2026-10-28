import { crmApi, type Row, type Session } from "./api";

export type RemoteContact = {
  id: string;
  workspace_id: string;
  name: string;
  email: string | null;
  phone: string | null;
  company: string | null;
  source: string | null;
  status: "new" | "contacted" | "qualified" | "customer" | "lost";
  notes: string | null;
  custom_fields: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
};
export type RemotePipeline = {
  id: string;
  workspace_id: string;
  name: string;
  is_default: boolean;
  created_at: string;
};
export type RemoteStage = {
  id: string;
  workspace_id: string;
  pipeline_id: string;
  name: string;
  position: number;
  probability: number;
  outcome: "open" | "won" | "lost";
};
export type RemoteDeal = {
  id: string;
  workspace_id: string;
  contact_id: string;
  pipeline_id: string;
  stage_id: string;
  name: string;
  value: string;
  status: "open" | "won" | "lost";
  owner_id: string | null;
  expected_close: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};
export type RemoteTask = {
  id: string;
  workspace_id: string;
  contact_id: string | null;
  deal_id: string | null;
  title: string;
  description: string | null;
  due_at: string | null;
  priority: "low" | "normal" | "high";
  status: "todo" | "done";
  assigned_to: string | null;
  created_at: string;
  updated_at: string;
};
export type RemoteTag = {
  id: string;
  workspace_id: string;
  name: string;
  color: string;
};
export type RemoteContactTag = {
  workspace_id: string;
  contact_id: string;
  tag_id: string;
};
export type RemoteNotification = {
  id: string;
  workspace_id: string;
  user_id: string;
  task_id: string | null;
  kind: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
};
export type RemoteMember = {
  workspace_id: string;
  user_id: string;
  role: string;
  active: boolean;
  joined_at: string;
};
export type RemoteWorkspace = {
  id: string;
  name: string;
  slug: string;
  state: string;
  logo_path: string | null;
  created_at: string;
};
export type RemoteCampaign = {
  id: string;
  workspace_id: string;
  name: string;
  channel: string | null;
  budget: string | null;
  spent: string | null;
  status: "planned" | "active" | "paused" | "finished";
  start_date: string | null;
  end_date: string | null;
  created_at: string;
};
export type RemoteSegmentList = {
  id: string;
  workspace_id: string;
  name: string;
  category: "RECOVERY" | "MARKETING" | "CUSTOM";
  description: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export type RemoteSegmentMember = {
  id: string;
  workspace_id: string;
  list_id: string;
  contact_id: string;
  deal_id: string | null;
  added_by_rule_id: string | null;
  reason: string | null;
  added_at: string;
};
export type RemoteAutomation = {
  id: string;
  name: string;
  enabled: boolean;
  creator_id: string | null;
  active_revision_id: string | null;
  updated_at: string;
};
export type RemoteSnapshot = {
  workspace: RemoteWorkspace;
  membership: RemoteMember;
  contacts: RemoteContact[];
  pipelines: RemotePipeline[];
  stages: RemoteStage[];
  deals: RemoteDeal[];
  tasks: RemoteTask[];
  tags: RemoteTag[];
  contactTags: RemoteContactTag[];
  notifications: RemoteNotification[];
  members: Array<{ user_id: string; full_name: string }>;
  campaigns: RemoteCampaign[];
  segmentLists: RemoteSegmentList[];
  segmentMembers: RemoteSegmentMember[];
  automations: RemoteAutomation[];
  summary: Record<string, unknown> | null;
};

const workspaceKey = "marketing_core_active_workspace";
export const REMOTE_UPDATED_EVENT = "marketing-core-remote-updated";
const encode = (value: string) => encodeURIComponent(value);
const userId = (session: Session) => String(session.user?.id || "");

let remoteSnapshot: RemoteSnapshot | null = null;
export function getRemoteSnapshot(): RemoteSnapshot | null {
  return remoteSnapshot;
}
export function getRemoteWorkspaceId() {
  return (
    sessionStorage.getItem(workspaceKey) ||
    getRemoteSnapshot()?.workspace.id ||
    ""
  );
}
export function isRemoteMode() {
  return Boolean(crmApi?.getSession() && getRemoteWorkspaceId());
}
function store(snapshot: RemoteSnapshot) {
  remoteSnapshot = snapshot;
  sessionStorage.setItem(workspaceKey, snapshot.workspace.id);
  localStorage.removeItem("marketing_core_remote_snapshot");
  localStorage.removeItem(workspaceKey);
  window.dispatchEvent(new Event(REMOTE_UPDATED_EVENT));
  return snapshot;
}
export function clearRemoteSnapshot() {
  remoteSnapshot = null;
  sessionStorage.removeItem(workspaceKey);
  localStorage.removeItem("marketing_core_remote_snapshot");
  localStorage.removeItem(workspaceKey);
  window.dispatchEvent(new Event(REMOTE_UPDATED_EVENT));
}

async function select<T>(table: string, query: string): Promise<T[]> {
  if (!crmApi) throw Error("Supabase não configurado.");
  return crmApi.request(`/rest/v1/${table}?${query}`) as Promise<T[]>;
}
export async function bootstrapRemoteCrm(
  session: Session,
  preferredWorkspace?: string,
): Promise<RemoteSnapshot> {
  if (!crmApi) throw Error("Supabase não configurado.");
  try {
    await crmApi.rpc("core_accept_my_pending_invitations", {});
  } catch {}
  const uid = userId(session);
  if (!uid) throw Error("Sessão sem usuário identificado.");
  const memberships = await select<RemoteMember>(
    "core_memberships",
    `select=workspace_id,user_id,role,active,joined_at&user_id=eq.${encode(uid)}&active=eq.true&order=joined_at.asc`,
  );
  if (!memberships.length)
    throw Error("Este usuário ainda não pertence a um workspace ativo.");
  const membership =
    memberships.find((item) => item.workspace_id === preferredWorkspace) ||
    memberships[0];
  const workspaces = await select<RemoteWorkspace>(
    "core_workspaces",
    `select=id,name,slug,state,logo_path,created_at&id=eq.${encode(membership.workspace_id)}&limit=1`,
  );
  const workspace = workspaces[0];
  if (!workspace)
    throw Error("Workspace do usuário não encontrado ou suspenso.");
  const w = workspace.id;
  const [
    contacts,
    pipelines,
    stages,
    deals,
    tasks,
    tags,
    contactTags,
    notifications,
    members,
    campaigns,
    segmentLists,
    segmentMembers,
    automations,
    summary,
  ] = await Promise.all([
    select<RemoteContact>(
      "core_contacts",
      `select=id,workspace_id,name,email,phone,company,source,status,notes,custom_fields,created_at,updated_at&workspace_id=eq.${encode(w)}&order=created_at.desc,id.desc`,
    ),
    select<RemotePipeline>(
      "core_pipelines",
      `select=id,workspace_id,name,is_default,created_at&workspace_id=eq.${encode(w)}&order=created_at.asc`,
    ),
    select<RemoteStage>(
      "core_stages",
      `select=id,workspace_id,pipeline_id,name,position,probability,outcome&workspace_id=eq.${encode(w)}&order=position.asc,id.asc`,
    ),
    select<RemoteDeal>(
      "core_deals",
      `select=id,workspace_id,contact_id,pipeline_id,stage_id,name,value,status,owner_id,expected_close,notes,created_at,updated_at&workspace_id=eq.${encode(w)}&order=created_at.desc,id.desc`,
    ),
    select<RemoteTask>(
      "core_tasks",
      `select=id,workspace_id,contact_id,deal_id,title,description,due_at,priority,status,assigned_to,created_at,updated_at&workspace_id=eq.${encode(w)}&order=due_at.asc.nullslast,created_at.desc`,
    ),
    select<RemoteTag>(
      "core_tags",
      `select=id,workspace_id,name,color&workspace_id=eq.${encode(w)}&order=name.asc,id.asc`,
    ),
    select<RemoteContactTag>(
      "core_contact_tags",
      `select=workspace_id,contact_id,tag_id&workspace_id=eq.${encode(w)}`,
    ),
    select<RemoteNotification>(
      "core_notifications",
      `select=id,workspace_id,user_id,task_id,kind,title,body,read_at,created_at&workspace_id=eq.${encode(w)}&order=created_at.desc`,
    ),
    crmApi.rpc("core_member_display_names", { w }) as Promise<
      Array<{ user_id: string; full_name: string }>
    >,
    select<RemoteCampaign>(
      "core_campaigns",
      `select=id,workspace_id,name,channel,budget,spent,status,start_date,end_date,created_at&workspace_id=eq.${encode(w)}&order=created_at.desc,id.desc`,
    ),
    select<RemoteSegmentList>(
      "core_segment_lists",
      `select=id,workspace_id,name,category,description,created_by,created_at,updated_at&workspace_id=eq.${encode(w)}&order=created_at.desc,id.desc`,
    ),
    select<RemoteSegmentMember>(
      "core_segment_list_members",
      `select=id,workspace_id,list_id,contact_id,deal_id,added_by_rule_id,reason,added_at&workspace_id=eq.${encode(w)}&order=added_at.desc,id.desc`,
    ),
    crmApi.rpc("core_automation_list", { p_workspace: w }) as Promise<
      RemoteAutomation[]
    >,
    crmApi.rpc("core_dashboard_summary", { p_workspace: w }) as Promise<Record<
      string,
      unknown
    > | null>,
  ]);
  return store({
    workspace,
    membership,
    contacts,
    pipelines,
    stages,
    deals,
    tasks,
    tags,
    contactTags,
    notifications,
    members,
    campaigns,
    segmentLists,
    segmentMembers,
    automations,
    summary,
  });
}

let mutationQueue: Promise<unknown> = Promise.resolve();
const enqueueMutation = <T>(operation: () => Promise<T>): Promise<T> => {
  const run = mutationQueue.then(operation, operation);
  mutationQueue = run.catch(() => undefined);
  return run;
};
export async function refreshRemoteCrm() {
  const session = crmApi?.getSession();
  if (!session) throw Error("Sessão Supabase ausente.");
  return bootstrapRemoteCrm(session, getRemoteWorkspaceId());
}
export function remoteInsert<T = Row>(
  table: string,
  body: Row,
  refresh = true,
): Promise<T> {
  return enqueueMutation(async () => {
    if (!crmApi) throw Error("Supabase não configurado.");
    const rows = (await crmApi.insert(table, {
      ...body,
      workspace_id: getRemoteWorkspaceId(),
    })) as T[];
    if (rows.length !== 1)
      throw Error(
        `A inclusão em ${table} não retornou exatamente um registro.`,
      );
    if (refresh) await refreshRemoteCrm();
    return rows[0];
  });
}
export function remoteUpdate<T = Row>(
  table: string,
  id: string,
  body: Row,
  refresh = true,
): Promise<T> {
  return enqueueMutation(async () => {
    if (!crmApi) throw Error("Supabase não configurado.");
    const rows = (await crmApi.update(
      table,
      id,
      getRemoteWorkspaceId(),
      body,
    )) as T[];
    if (rows.length !== 1)
      throw Error(
        `A atualização em ${table} não encontrou exatamente um registro.`,
      );
    if (refresh) await refreshRemoteCrm();
    return rows[0];
  });
}
export function remoteDelete(table: string, id: string, refresh = true) {
  return enqueueMutation(async () => {
    if (!crmApi) throw Error("Supabase não configurado.");
    const rows = (await crmApi.request(
      `/rest/v1/${table}?id=eq.${encodeURIComponent(id)}&workspace_id=eq.${encodeURIComponent(getRemoteWorkspaceId())}`,
      { method: "DELETE", headers: { Prefer: "return=representation" } },
    )) as Row[];
    if (rows.length !== 1)
      throw Error(
        `A exclusão em ${table} não encontrou exatamente um registro.`,
      );
    if (refresh) await refreshRemoteCrm();
  });
}
export function remoteDeleteWhere(
  table: string,
  filters: Record<string, string>,
  refresh = true,
) {
  return enqueueMutation(async () => {
    if (!crmApi) throw Error("Supabase não configurado.");
    const query = new URLSearchParams({
      workspace_id: `eq.${getRemoteWorkspaceId()}`,
    });
    Object.entries(filters).forEach(([key, value]) =>
      query.set(key, `eq.${value}`),
    );
    const rows = (await crmApi.request(
      `/rest/v1/${table}?${query.toString()}`,
      { method: "DELETE", headers: { Prefer: "return=representation" } },
    )) as Row[];
    if (rows.length !== 1)
      throw Error(
        `A exclusão em ${table} não encontrou exatamente um registro.`,
      );
    if (refresh) await refreshRemoteCrm();
  });
}
export function markRemoteNotificationRead(id: string, refresh = true) {
  return enqueueMutation(async () => {
    if (!crmApi) throw Error("Supabase não configurado.");
    await crmApi.rpc("core_mark_notification_read", {
      p_workspace: getRemoteWorkspaceId(),
      p_notification: id,
    });
    if (refresh) await refreshRemoteCrm();
  });
}
export function markAllRemoteNotificationsRead(ids: string[]) {
  return enqueueMutation(async () => {
    if (!crmApi) throw Error("Supabase não configurado.");
    const workspace = getRemoteWorkspaceId();
    for (const id of ids)
      await crmApi.rpc("core_mark_notification_read", {
        p_workspace: workspace,
        p_notification: id,
      });
    await refreshRemoteCrm();
  });
}
export function remoteRpc<T = unknown>(name: string, args: Row): Promise<T> {
  return enqueueMutation(async () => {
    if (!crmApi) throw Error("Supabase não configurado.");
    const result = (await crmApi.rpc(name, args)) as T;
    await refreshRemoteCrm();
    return result;
  });
}
export function updateRemoteWorkspaceName(
  name: string,
): Promise<RemoteWorkspace> {
  return enqueueMutation(async () => {
    if (!crmApi) throw Error("Supabase não configurado.");
    const workspaceId = getRemoteWorkspaceId();
    const normalized = name.trim();
    if (!workspaceId) throw Error("Workspace remoto indisponível.");
    if (!normalized) throw Error("Informe o nome da empresa.");
    const updated = (await crmApi.request(
      `/rest/v1/core_workspaces?id=eq.${encode(workspaceId)}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({ name: normalized }),
      },
    )) as RemoteWorkspace[];
    if (updated.length !== 1)
      throw Error(
        "A atualização do workspace não retornou exatamente um registro.",
      );
    const rows = await select<RemoteWorkspace>(
      "core_workspaces",
      `select=id,name,slug,state,logo_path,created_at&id=eq.${encode(workspaceId)}&limit=1`,
    );
    if (rows.length !== 1 || rows[0].name !== normalized)
      throw Error("Não foi possível confirmar o nome salvo no workspace.");
    if (remoteSnapshot) store({ ...remoteSnapshot, workspace: rows[0] });
    return rows[0];
  });
}
