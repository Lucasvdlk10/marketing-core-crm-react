export type NodeKind = 'trigger' | 'condition' | 'action';
export type TriggerSubtype = 'LEAD_CREATED' | 'WEBHOOK_RECEIVED' | 'STAGE_CHANGED' | 'DEAL_LOST';
export type ConditionSubtype = 'SOURCE_EQUALS' | 'CAMPAIGN_EQUALS' | 'STAGE_EQUALS';
export type ActionSubtype = 'CREATE_TASK' | 'CREATE_FOLLOWUP' | 'COMPLETE_TASKS' | 'DISTRIBUTE_LEAD' | 'ADD_TO_SEGMENT_LIST' | 'NOTIFY_USER';
export interface AutomationNode { id: string; type: NodeKind; subtype: TriggerSubtype | ConditionSubtype | ActionSubtype; position: { x: number; y: number }; config: Record<string, unknown> }
export interface AutomationEdge { id: string; source: string; target: string }
export interface AutomationGraphV1 { schema_version: 1; nodes: AutomationNode[]; edges: AutomationEdge[] }
export interface AutomationDrop { nodeType: NodeKind; x: number; y: number }

const triggers = new Set<string>(['LEAD_CREATED','WEBHOOK_RECEIVED','STAGE_CHANGED','DEAL_LOST']);
const conditions = new Set<string>(['SOURCE_EQUALS','CAMPAIGN_EQUALS','STAGE_EQUALS']);
const actions = new Set<string>(['CREATE_TASK','CREATE_FOLLOWUP','COMPLETE_TASKS','DISTRIBUTE_LEAD','ADD_TO_SEGMENT_LIST','NOTIFY_USER']);
const own = (value: object, key: string): boolean => Object.prototype.hasOwnProperty.call(value, key);
const record = (value: unknown, label: string): Record<string, unknown> => {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
};
const exact = (value: Record<string, unknown>, keys: readonly string[], label: string): void => {
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`${label} has unknown key: ${key}`);
  for (const key of keys) if (!own(value, key)) throw new Error(`${label} is missing ${key}`);
};
const text = (value: unknown, label: string, max = 200): string => {
  if (typeof value !== 'string' || value.length < 1 || value.length > max || /[\u0000-\u001f\u007f]/u.test(value)) throw new Error(`${label} is invalid`);
  return value;
};
const finite = (value: unknown, label: string, min: number, max: number): number => {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${label} must be finite`);
  if (value < min || value > max) throw new Error(`${label} is out of range`);
  return value;
};
const optionalKeys = (config: Record<string, unknown>, allowed: readonly string[], label: string): void => {
  for (const key of Object.keys(config)) if (!allowed.includes(key)) throw new Error(`${label} has unknown key: ${key}`);
};
function validateConfig(kind: NodeKind, subtype: string, input: unknown): Record<string, unknown> {
  const config = record(input, 'node.config');
  if (kind === 'trigger') optionalKeys(config, ['source','form_id','stage_id','loss_reason','days','timeframe'], 'trigger config');
  else if (kind === 'condition') optionalKeys(config, ['value','stage_id','days'], 'condition config');
  else {
    const allowed: Record<string, readonly string[]> = {
      CREATE_TASK: ['title','delay','unit','business_hours','assignee','user_id'], CREATE_FOLLOWUP: ['title','delay','unit','business_hours','assignee','user_id'],
      COMPLETE_TASKS: ['only_automation'], DISTRIBUTE_LEAD: ['mode','team','members'], ADD_TO_SEGMENT_LIST: ['list_id','reason'],
      NOTIFY_USER: ['title','body','user_id'],
    };
    optionalKeys(config, allowed[subtype] ?? [], 'action config');
  }
  const encoded = JSON.stringify(config);
  if (encoded.length > 8_192) throw new Error('node.config is too large');
  for (const [key, value] of Object.entries(config)) {
    if (typeof value === 'number') finite(value, `config.${key}`, -1_000_000, 1_000_000);
    if (typeof value === 'string' && value.length > 2_000) throw new Error(`config.${key} is too long`);
  }
  return config;
}
export function validateAutomationDrop(input: unknown): AutomationDrop {
  const value = record(input, 'drop'); exact(value, ['nodeType','x','y'], 'drop');
  if (value.nodeType !== 'trigger' && value.nodeType !== 'condition' && value.nodeType !== 'action') throw new Error('drop.nodeType is invalid');
  return { nodeType: value.nodeType, x: finite(value.x, 'drop.x', -100_000, 100_000), y: finite(value.y, 'drop.y', -100_000, 100_000) };
}
export function validateAutomationGraph(input: unknown): AutomationGraphV1 {
  const root = record(input, 'graph'); exact(root, ['schema_version','nodes','edges'], 'graph');
  if (root.schema_version !== 1) throw new Error('graph.schema_version must be 1');
  if (!Array.isArray(root.nodes) || root.nodes.length < 2 || root.nodes.length > 35) throw new Error('graph.nodes count is invalid');
  if (!Array.isArray(root.edges) || root.edges.length < 1 || root.edges.length > 50) throw new Error('graph.edges count is invalid');
  if (JSON.stringify(root).length > 65_536) throw new Error('graph is too large');
  const ids = new Set<string>(); let triggerCount = 0;
  const nodes = root.nodes.map((raw, index): AutomationNode => {
    const node = record(raw, `nodes[${index}]`); exact(node, ['id','type','subtype','position','config'], `nodes[${index}]`);
    const id = text(node.id, `nodes[${index}].id`, 90); if (ids.has(id)) throw new Error(`duplicate node id: ${id}`); ids.add(id);
    if (node.type !== 'trigger' && node.type !== 'condition' && node.type !== 'action') throw new Error(`nodes[${index}].type is invalid`);
    const subtype = text(node.subtype, `nodes[${index}].subtype`, 50);
    const allowed = node.type === 'trigger' ? triggers : node.type === 'condition' ? conditions : actions;
    if (!allowed.has(subtype)) throw new Error(`nodes[${index}].subtype is invalid`); if (node.type === 'trigger') triggerCount++;
    const position = record(node.position, `nodes[${index}].position`); exact(position, ['x','y'], 'position');
    return { id, type: node.type, subtype: subtype as AutomationNode['subtype'], position: { x: finite(position.x,'position.x',-100_000,100_000), y: finite(position.y,'position.y',-100_000,100_000) }, config: validateConfig(node.type, subtype, node.config) };
  });
  if (triggerCount !== 1) throw new Error('graph must contain exactly one trigger');
  const edgeIds = new Set<string>(); const pairs = new Set<string>();
  const edges = root.edges.map((raw, index): AutomationEdge => {
    const edge = record(raw, `edges[${index}]`); exact(edge, ['id','source','target'], `edges[${index}]`);
    const id = text(edge.id, 'edge.id', 90), source = text(edge.source, 'edge.source', 90), target = text(edge.target, 'edge.target', 90);
    if (edgeIds.has(id)) throw new Error(`duplicate edge id: ${id}`); edgeIds.add(id);
    if (!ids.has(source) || !ids.has(target) || source === target) throw new Error('edge connection is invalid');
    const pair = `${source}\u0000${target}`; if (pairs.has(pair)) throw new Error('duplicate edge'); pairs.add(pair); return { id, source, target };
  });
  const trigger = nodes.find((node) => node.type === 'trigger')!; const visited = new Set<string>(); const active = new Set<string>();
  const incoming = new Map(nodes.map((node) => [node.id, 0])); const outgoing = new Map(nodes.map((node) => [node.id, 0]));
  for (const edge of edges) { incoming.set(edge.target, (incoming.get(edge.target) ?? 0) + 1); outgoing.set(edge.source, (outgoing.get(edge.source) ?? 0) + 1); }
  if (edges.length !== nodes.length - 1 || incoming.get(trigger.id) !== 0 || nodes.some((node) => node.id !== trigger.id && incoming.get(node.id) !== 1) || nodes.some((node) => (outgoing.get(node.id) ?? 0) > 1)) throw new Error('automation graph must be linear');
  const walk = (id: string): void => { if (active.has(id)) throw new Error('graph contains a cycle'); if (visited.has(id)) return; active.add(id); for (const edge of edges) if (edge.source === id) walk(edge.target); active.delete(id); visited.add(id); };
  walk(trigger.id);
  if (visited.size !== nodes.length) throw new Error('graph contains an unreachable node');
  if (!nodes.some((node) => node.type === 'action' && visited.has(node.id))) throw new Error('graph needs a reachable action');
  return { schema_version: 1, nodes, edges };
}
