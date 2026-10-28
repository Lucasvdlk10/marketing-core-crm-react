export type CommitPolicy = 'ATOMIC' | 'PARTIAL';
export type DuplicatePolicy = 'SKIP' | 'UPDATE';
export interface ImportRequest { sourceDigest: string; sourceBytes: number; contentType: 'text/csv' | 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'; duplicatePolicy: DuplicatePolicy; commitPolicy: CommitPolicy; confirmPartial: boolean }
export interface ZipLimits { maxMembers: number; maxAggregateBytes: number; maxMemberBytes: number; maxCompressionRatio: number }
export const DEFAULT_ZIP_LIMITS: Readonly<ZipLimits> = Object.freeze({ maxMembers: 256, maxAggregateBytes: 128 * 1024 * 1024, maxMemberBytes: 32 * 1024 * 1024, maxCompressionRatio: 100 });
const allowedMember = /^(?:\[Content_Types\]\.xml|_rels\/\.rels|docProps\/(?:app|core)\.xml|xl\/(?:workbook\.xml|styles\.xml|sharedStrings\.xml|theme\/theme\d+\.xml|_rels\/workbook\.xml\.rels|worksheets\/_rels\/sheet\d+\.xml\.rels|worksheets\/sheet\d+\.xml))$/u;
const object = (value: unknown): Record<string, unknown> => { if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('request must be an object'); return value as Record<string, unknown>; };
const finiteInt = (value: unknown, label: string, min: number, max: number): number => { if (typeof value !== 'number' || !Number.isSafeInteger(value)) throw new Error(`${label} must be a finite integer`); if (value < min || value > max) throw new Error(`${label} is out of range`); return value; };
export function validateImportRequest(input: unknown): ImportRequest {
  const value = object(input); const allowed = ['sourceDigest','sourceBytes','contentType','duplicatePolicy','commitPolicy','confirmPartial'];
  for (const key of Object.keys(value)) if (!allowed.includes(key)) throw new Error(`request has unknown key: ${key}`);
  if (typeof value.sourceDigest !== 'string' || !/^[a-f0-9]{64}$/u.test(value.sourceDigest)) throw new Error('sourceDigest must be lowercase SHA-256');
  const sourceBytes = finiteInt(value.sourceBytes, 'sourceBytes', 1, 15 * 1024 * 1024);
  if (value.contentType !== 'text/csv' && value.contentType !== 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet') throw new Error('contentType is unsupported');
  if (value.duplicatePolicy !== 'SKIP' && value.duplicatePolicy !== 'UPDATE') throw new Error('duplicatePolicy is unsupported');
  const commitPolicy = value.commitPolicy === undefined ? 'ATOMIC' : value.commitPolicy;
  if (commitPolicy !== 'ATOMIC' && commitPolicy !== 'PARTIAL') throw new Error('commitPolicy is unsupported');
  const confirmPartial = value.confirmPartial === true;
  if (commitPolicy === 'PARTIAL' && !confirmPartial) throw new Error('PARTIAL commit requires explicit confirmPartial');
  return { sourceDigest: value.sourceDigest, sourceBytes, contentType: value.contentType, duplicatePolicy: value.duplicatePolicy, commitPolicy, confirmPartial };
}
export class ZipBudget {
  readonly limits: Readonly<ZipLimits>; private members = 0; private aggregate = 0; private memberBytes = 0; private compressedBytes = 0; private open = false;
  constructor(limits: ZipLimits = DEFAULT_ZIP_LIMITS) {
    this.limits = Object.freeze({ maxMembers: finiteInt(limits.maxMembers,'maxMembers',1,10_000), maxAggregateBytes: finiteInt(limits.maxAggregateBytes,'maxAggregateBytes',1,1_073_741_824), maxMemberBytes: finiteInt(limits.maxMemberBytes,'maxMemberBytes',1,1_073_741_824), maxCompressionRatio: finiteInt(limits.maxCompressionRatio,'maxCompressionRatio',1,10_000) });
  }
  beginMember(name: string, compressedBytes: number): void {
    if (this.open) throw new Error('previous ZIP member is still open');
    if (!allowedMember.test(name) || name.includes('..') || name.startsWith('/') || name.toLowerCase().endsWith('.zip')) throw new Error('ZIP member is not allowlisted');
    this.compressedBytes = finiteInt(compressedBytes, 'compressedBytes', 1, 15 * 1024 * 1024); this.memberBytes = 0; this.members++;
    if (this.members > this.limits.maxMembers) throw new Error('ZIP member limit exceeded'); this.open = true;
  }
  consume(emittedBytes: number): void {
    if (!this.open) throw new Error('no ZIP member is open'); const amount = finiteInt(emittedBytes, 'emittedBytes', 0, 1_073_741_824);
    this.memberBytes += amount; this.aggregate += amount;
    if (this.memberBytes > this.limits.maxMemberBytes) throw new Error('ZIP member decompression limit exceeded');
    if (this.aggregate > this.limits.maxAggregateBytes) throw new Error('ZIP aggregate decompression limit exceeded');
    if (this.memberBytes / this.compressedBytes > this.limits.maxCompressionRatio) throw new Error('ZIP compression ratio limit exceeded');
  }
  endMember(): void { if (!this.open) throw new Error('no ZIP member is open'); this.open = false; }
  snapshot(): Readonly<{ members: number; aggregateBytes: number }> { return Object.freeze({ members: this.members, aggregateBytes: this.aggregate }); }
}
