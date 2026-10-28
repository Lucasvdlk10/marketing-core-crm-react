export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_API_MAX_ROWS = 2_000;
export const IMPORT_PREVIEW_MAX_ROWS = 5_000;

export interface CsvParseLimits { maxBytes: number; maxRows: number }
export interface ImportRow { name?: string; email?: string; phone?: string; company?: string }
export interface ImportJobPayload {
  workspace_id: string; source_type: 'CSV'; duplicate_policy: 'SKIP' | 'UPDATE';
  commit_policy: 'ATOMIC' | 'PARTIAL'; confirm_partial: boolean; rows: ImportRow[];
}
export interface JobProgress { status: string; processed: number; total: number }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;
const encoder = new TextEncoder();

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('payload must be an object');
  return value as Record<string, unknown>;
}
function exactKeys(value: Record<string, unknown>, allowed: readonly string[]): void {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`unknown field: ${key}`);
}

export function parseCsvPreview(text: string, limits: CsvParseLimits = { maxBytes: IMPORT_MAX_BYTES, maxRows: IMPORT_PREVIEW_MAX_ROWS }): string[][] {
  if (typeof text !== 'string' || encoder.encode(text).byteLength > limits.maxBytes) throw new Error('CSV bytes limit exceeded');
  if (!Number.isSafeInteger(limits.maxRows) || limits.maxRows < 1) throw new Error('invalid row limit');
  const rows: string[][] = []; let row: string[] = []; let cell = ''; let quoted = false;
  const pushRow = (): void => { row.push(cell); rows.push(row); row = []; cell = ''; if (rows.length > limits.maxRows) throw new Error('CSV row limit exceeded'); };
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell.length === 0) quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n') pushRow();
    else if (ch !== '\r') cell += ch;
  }
  if (quoted) throw new Error('unterminated CSV quote');
  if (cell.length || row.length || (text.length && text[text.length - 1] !== '\n')) pushRow();
  return rows;
}

export function validateImportJobPayload(input: unknown): ImportJobPayload {
  const value = record(input);
  exactKeys(value, ['workspace_id','source_type','duplicate_policy','commit_policy','confirm_partial','rows']);
  if (typeof value.workspace_id !== 'string' || !UUID.test(value.workspace_id)) throw new Error('invalid workspace_id');
  if (value.source_type !== 'CSV') throw new Error('only CSV imports are supported by this client');
  if (value.duplicate_policy !== 'SKIP' && value.duplicate_policy !== 'UPDATE') throw new Error('invalid duplicate_policy');
  const commit_policy = value.commit_policy === undefined ? 'ATOMIC' : value.commit_policy;
  if (commit_policy !== 'ATOMIC' && commit_policy !== 'PARTIAL') throw new Error('invalid commit_policy');
  const confirm_partial = value.confirm_partial === true;
  if (commit_policy === 'PARTIAL' && !confirm_partial) throw new Error('partial import requires explicit confirm_partial');
  if (!Array.isArray(value.rows) || value.rows.length < 1 || value.rows.length > IMPORT_API_MAX_ROWS) throw new Error('invalid rows count');
  const rows = value.rows.map((item) => {
    const source = record(item); exactKeys(source, ['name','email','phone','company']); const clean: ImportRow = {};
    for (const key of ['name','email','phone','company'] as const) { const part = source[key]; if (part !== undefined) { if (typeof part !== 'string' || part.length > 500 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/u.test(part)) throw new Error(`invalid row ${key}`); clean[key] = part.trim(); } }
    return clean;
  });
  return { workspace_id: value.workspace_id, source_type: 'CSV', duplicate_policy: value.duplicate_policy, commit_policy, confirm_partial, rows };
}

export function csvCell(value: unknown): string {
  let text = value == null ? '' : String(value);
  if (/^[\t\r\n ]*[-+=@]/u.test(text)) text = `'${text}`;
  return /[",\r\n]/u.test(text) ? `"${text.replace(/"/gu, '""')}"` : text;
}

export function renderJobProgress(target: Pick<HTMLElement, 'textContent'>, progress: JobProgress): void {
  const processed = Number.isFinite(progress.processed) ? Math.max(0, Math.trunc(progress.processed)) : 0;
  const total = Number.isFinite(progress.total) ? Math.max(0, Math.trunc(progress.total)) : 0;
  target.textContent = `${String(progress.status)} — ${processed}/${total}`;
}

export async function pollJob(fetchStatus: () => Promise<JobProgress>, target: Pick<HTMLElement, 'textContent'>, intervalMs = 1_000): Promise<JobProgress> {
  for (;;) {
    const progress = await fetchStatus(); renderJobProgress(target, progress);
    if (['COMPLETED','COMPLETED_WITH_REJECTIONS','FAILED','REJECTED','CANCELLED'].includes(progress.status)) return progress;
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, intervalMs));
  }
}
