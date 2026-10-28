export interface TaskRow {
  id: string;
  workspace_id: string;
  title: string;
  status: string;
  due_at?: string | null;
  description?: string | null;
}
export interface TaskFilters { showCompleted: boolean; overdueOnly: boolean }
export const DEFAULT_TASK_FILTERS: Readonly<TaskFilters> = Object.freeze({ showCompleted: false, overdueOnly: false });
export type PartialTaskFilters = Partial<TaskFilters>;

type DomDocument = Pick<Document, 'createElement' | 'createDocumentFragment'>;
const requireText = (value: unknown, label: string, max = 200): string => {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > max) throw new Error(`${label} is invalid`);
  return value.trim();
};
const assertKeys = (value: object, allowed: readonly string[], label: string): void => {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`${label} has unknown field: ${key}`);
};
const dateValue = (value: string | null | undefined): number | null => {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
};
export function isTaskOverdue(task: TaskRow, now: Date = new Date()): boolean {
  const due = dateValue(task.due_at);
  return task.status !== 'done' && due !== null && due < now.getTime();
}
export function filterTasks<T extends TaskRow>(tasks: readonly T[], filters: PartialTaskFilters = {}, now: Date = new Date()): T[] {
  const resolved = { ...DEFAULT_TASK_FILTERS, ...filters };
  return tasks.filter((task) => (resolved.showCompleted || task.status !== 'done') && (!resolved.overdueOnly || isTaskOverdue(task, now)));
}
export interface TaskRenderOptions {
  document?: DomDocument;
  filters?: PartialTaskFilters;
  now?: Date;
  canCompleteTasks: boolean;
  onToggleComplete?: (task: TaskRow, complete: boolean) => void | Promise<void>;
}
const dom = (provided?: DomDocument): DomDocument => {
  if (provided) return provided;
  if (typeof document === 'undefined') throw new Error('A document is required to render');
  return document;
};
export function renderTaskList(container: Pick<Element, 'replaceChildren'>, tasks: readonly TaskRow[], options: TaskRenderOptions): void {
  const doc = dom(options.document); const fragment = doc.createDocumentFragment();
  for (const task of filterTasks(tasks, options.filters, options.now)) {
    const article = doc.createElement('article'); article.className = 'task-row'; article.dataset.taskId = task.id;
    const check = doc.createElement('input'); check.type = 'checkbox'; check.checked = task.status === 'done'; check.disabled = !options.canCompleteTasks;
    check.setAttribute('aria-label', `Concluir ${task.title}`);
    if (options.onToggleComplete) check.addEventListener('change', () => void options.onToggleComplete!(task, check.checked));
    const content = doc.createElement('div');
    const title = doc.createElement('strong'); title.textContent = task.title;
    const meta = doc.createElement('small');
    const due = dateValue(task.due_at); meta.textContent = due === null ? 'Sem prazo' : isTaskOverdue(task, options.now) ? 'Atrasada' : new Date(due).toLocaleDateString('pt-BR');
    content.append(title, meta); article.append(check, content); fragment.appendChild(article);
  }
  container.replaceChildren(fragment);
}

export interface NotificationRow { id: string; workspace_id: string; title: string; body?: string | null; read_at?: string | null; created_at?: string }
export interface RpcTransport { rpc(method: string, body: Record<string, unknown>): Promise<unknown> }
export interface NotificationCapabilities { canMarkNotificationsRead: boolean }
export function createNotificationController(transport: RpcTransport, workspaceId: string, capabilities: NotificationCapabilities) {
  const workspace = requireText(workspaceId, 'workspace');
  return Object.freeze({
    async markRead(notificationId: string): Promise<void> {
      if (!capabilities.canMarkNotificationsRead) throw new Error('Permission denied: cannot mark notifications read');
      await transport.rpc('core_mark_notification_read', { p_workspace: workspace, p_notification: requireText(notificationId, 'notification id') });
    },
  });
}
export interface NotificationRenderOptions extends NotificationCapabilities {
  document?: DomDocument;
  markRead?: (notificationId: string) => void | Promise<void>;
}
export function renderNotifications(container: Pick<Element, 'replaceChildren'>, notifications: readonly NotificationRow[], options: NotificationRenderOptions): void {
  const doc = dom(options.document); const fragment = doc.createDocumentFragment();
  for (const notification of notifications) {
    const article = doc.createElement('article'); article.className = notification.read_at ? 'notification is-read' : 'notification'; article.dataset.notificationId = notification.id;
    const title = doc.createElement('strong'); title.textContent = notification.title;
    const body = doc.createElement('p'); body.textContent = notification.body ?? '';
    article.append(title, body);
    if (!notification.read_at) {
      const button = doc.createElement('button'); button.type = 'button'; button.textContent = 'Marcar como lida';
      button.disabled = !options.canMarkNotificationsRead || !options.markRead;
      if (options.markRead) button.addEventListener('click', () => void options.markRead!(notification.id));
      article.append(button);
    }
    fragment.appendChild(article);
  }
  container.replaceChildren(fragment);
}

export function parseNullableBudget(value: unknown, label = 'budget'): number | null {
  if (value === null || value === undefined || (typeof value === 'string' && value.trim() === '')) return null;
  if ((typeof value !== 'string' && typeof value !== 'number') || (typeof value === 'string' && !/^\d+(?:\.\d+)?$/u.test(value.trim()))) throw new Error(`${label} is invalid`);
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount < 0) throw new Error(`${label} is invalid`);
  return amount;
}
export function formatNullableBudget(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'Não informado';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(value);
}
export function campaignMutationFromForm(input: Record<string, unknown>): Record<string, unknown> {
  const allowed = ['name', 'channel', 'budget', 'spent', 'status', 'start_date', 'end_date']; assertKeys(input, allowed, 'campaign');
  const result: Record<string, unknown> = { name: requireText(input.name, 'campaign name'), budget: parseNullableBudget(input.budget, 'budget'), spent: parseNullableBudget(input.spent, 'spent') };
  for (const key of ['channel', 'status', 'start_date', 'end_date']) if (key in input) result[key] = input[key] === '' ? null : input[key];
  return result;
}

export type SegmentCategory = 'RECOVERY' | 'MARKETING' | 'CUSTOM';
export interface SegmentListInput { name: string; category?: SegmentCategory; description?: string | null }
export interface SegmentMemberInput { contactId: string; dealId?: string | null; reason?: string | null }
export interface SegmentCapabilities { canCreateLists: boolean; canUpdateLists: boolean; canDeleteLists: boolean; canManageMembership: boolean }
export interface SegmentTransport {
  list(table: string, workspace: string, extra?: Record<string, string | number | undefined>): Promise<unknown[]>;
  insert(table: string, body: Record<string, unknown>): Promise<unknown>;
  update(table: string, id: string, workspace: string, body: Record<string, unknown>): Promise<unknown>;
  del(table: string, id: string, workspace: string): Promise<void>;
}
const listInput = (input: SegmentListInput, partial = false): Record<string, unknown> => {
  assertKeys(input, ['name', 'category', 'description'], 'segment list'); const body: Record<string, unknown> = {};
  if (!partial || input.name !== undefined) body.name = requireText(input.name, 'segment list name');
  if (input.category !== undefined) { if (!['RECOVERY', 'MARKETING', 'CUSTOM'].includes(input.category)) throw new Error('segment list category is invalid'); body.category = input.category; }
  if (input.description !== undefined) body.description = input.description === null ? null : String(input.description).slice(0, 2000);
  if (partial && Object.keys(body).length === 0) throw new Error('segment list update is empty'); return body;
};
export function createSegmentListController(transport: SegmentTransport, workspaceId: string, capabilities: SegmentCapabilities) {
  const workspace = requireText(workspaceId, 'workspace');
  const permit = (allowed: boolean, action: string): void => { if (!allowed) throw new Error(`Permission denied: cannot ${action}`); };
  return Object.freeze({
    list: () => transport.list('core_segment_lists', workspace),
    create: async (input: SegmentListInput) => { permit(capabilities.canCreateLists, 'create segment lists'); return transport.insert('core_segment_lists', { workspace_id: workspace, ...listInput(input) }); },
    update: async (id: string, input: Partial<SegmentListInput>) => { permit(capabilities.canUpdateLists, 'update segment lists'); return transport.update('core_segment_lists', requireText(id, 'list id'), workspace, listInput(input as SegmentListInput, true)); },
    remove: async (id: string) => { permit(capabilities.canDeleteLists, 'delete segment lists'); await transport.del('core_segment_lists', requireText(id, 'list id'), workspace); },
    listMembers: (listId: string) => transport.list('core_segment_list_members', workspace, { list_id: `eq.${requireText(listId, 'list id')}` }),
    addMember: async (listId: string, input: SegmentMemberInput) => {
      permit(capabilities.canManageMembership, 'manage segment membership'); assertKeys(input, ['contactId', 'dealId', 'reason'], 'segment member');
      return transport.insert('core_segment_list_members', { workspace_id: workspace, list_id: requireText(listId, 'list id'), contact_id: requireText(input.contactId, 'contact id'), deal_id: input.dealId ?? null, reason: input.reason ?? null });
    },
    removeMember: async (memberId: string) => { permit(capabilities.canManageMembership, 'manage segment membership'); await transport.del('core_segment_list_members', requireText(memberId, 'member id'), workspace); },
  });
}
