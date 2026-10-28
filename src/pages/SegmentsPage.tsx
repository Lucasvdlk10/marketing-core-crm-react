import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Filter, Link2, Pencil, Trash2 } from "lucide-react";
import { PageHeader, EmptyState } from "../components/common/PageHeader";
import { Modal } from "../components/common/Modal";
import {
  getAllLeadTags,
  getEffectiveLeads,
  getLeadRecord,
} from "../lib/leadRecords";
import {
  getRemoteWorkspaceId,
  isRemoteMode,
  remoteRpc,
} from "../lib/remoteCrm";
import { useRemoteSnapshot } from "../lib/useRemoteSnapshot";
type SegmentFilters = {
  tag: string;
  status: string;
  source: string;
  company: string;
  dateFrom: string;
  dateTo: string;
  hasEmail: "" | "yes" | "no";
};
type LocalList = {
  id: string;
  name: string;
  description: string;
  criteria: string;
  leadIds: string[];
  leads: number;
  createdAt: string;
  filters?: SegmentFilters;
};
type AutomationLink = {
  list_id: string;
  rule_id: string;
  rule_name: string;
  enabled: boolean;
};
const emptyFilters: SegmentFilters = {
  tag: "",
  status: "",
  source: "",
  company: "",
  dateFrom: "",
  dateTo: "",
  hasEmail: "",
};
export function SegmentsPage() {
  const remote = isRemoteMode();
  const snapshot = useRemoteSnapshot();
  const [localLists, setLocalLists] = useState<LocalList[]>(() =>
    remote
      ? []
      : (() => {
          try {
            return JSON.parse(
              localStorage.getItem("marketing_core_segment_lists") || "[]",
            );
          } catch {
            return [];
          }
        })(),
  );
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [filters, setFilters] = useState(emptyFilters);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [automationLinks, setAutomationLinks] = useState<AutomationLink[]>([]);
  const [editTarget, setEditTarget] = useState<{
    id: string;
    name: string;
    description: string;
  } | null>(null);
  const [editName, setEditName] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editFilters,setEditFilters]=useState<SegmentFilters>(emptyFilters);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [listOverrides, setListOverrides] = useState<
    Record<string, { name: string; description: string;criteria?:string;leads?:number;filters?:SegmentFilters }>
  >({});
  const [hiddenLists, setHiddenLists] = useState<string[]>([]);
  useEffect(() => {
    let active = true;
    if (remote)
      remoteRpc<AutomationLink[]>("core_segment_list_automation_links", {
        p_workspace: getRemoteWorkspaceId(),
      })
        .then((rows) => {
          if (active) setAutomationLinks(rows || []);
        })
        .catch((e) => {
          if (active) setError(e instanceof Error ? e.message : String(e));
        });
    return () => {
      active = false;
    };
  }, [remote]);
  const leads = getEffectiveLeads();
  const tags = getAllLeadTags();
  const statuses = [...new Set(leads.map((x) => x.status))];
  const sources = [...new Set(leads.map((x) => x.source))];
  const leadDay = (value: string) => {
    const parts = value.includes("/")
      ? value.split("/").map(Number).reverse()
      : value.slice(0, 10).split("-").map(Number);
    return new Date(parts[0], parts[1] - 1, parts[2]).getTime();
  };
  const matchLeads = (criteria:SegmentFilters) => leads.filter((lead) => {
    const record = getLeadRecord(lead);
    const day = leadDay(lead.createdAt);
    return (!criteria.tag || record.tags.includes(criteria.tag)) && (!criteria.status || lead.status === criteria.status) && (!criteria.source || lead.source === criteria.source) && (!criteria.company || lead.company.toLowerCase().includes(criteria.company.toLowerCase())) && (!criteria.hasEmail || (criteria.hasEmail === "yes" ? Boolean(lead.email) : !lead.email)) && (!criteria.dateFrom || day >= leadDay(criteria.dateFrom)) && (!criteria.dateTo || day <= leadDay(criteria.dateTo));
  });
  const matched = useMemo(() => matchLeads(filters), [leads, filters]);
  const editMatched = useMemo(() => matchLeads(editFilters), [leads, editFilters]);
  const criteriaFor = (value:SegmentFilters) => {
    const items = [] as string[];
    if (value.tag) items.push(`Tag: ${value.tag}`);
    if (value.status) items.push(`Status: ${value.status}`);
    if (value.source) items.push(`Origem: ${value.source}`);
    if (value.company) items.push(`Empresa contém “${value.company}”`);
    if (value.dateFrom) items.push(`Criado desde ${value.dateFrom}`);
    if (value.dateTo) items.push(`Criado até ${value.dateTo}`);
    if (value.hasEmail) items.push(value.hasEmail === "yes" ? "Com e-mail" : "Sem e-mail");
    return items.join(" · ") || "Todos os leads";
  };
  const criteria = () => criteriaFor(filters);
  const filtersFromReason=(reason:string):SegmentFilters=>({tag:reason.match(/Tag: ([^·]+)/)?.[1]?.trim()||'',status:reason.match(/Status: ([^·]+)/)?.[1]?.trim()||'',source:reason.match(/Origem: ([^·]+)/)?.[1]?.trim()||'',company:reason.match(/Empresa contém “([^”]+)”/)?.[1]||'',dateFrom:reason.match(/Criado desde ([^·]+)/)?.[1]?.trim()||'',dateTo:reason.match(/Criado até ([^·]+)/)?.[1]?.trim()||'',hasEmail:reason.includes('Com e-mail')?'yes':reason.includes('Sem e-mail')?'no':''});
  const lists = (
    remote
      ? (snapshot?.segmentLists || []).map((list) => {const members=(snapshot?.segmentMembers||[]).filter(member=>member.list_id===list.id);const reason=members[0]?.reason||'';const saved=(list as typeof list&{filters?:SegmentFilters}).filters;return {
          id: list.id,
          name: list.name,
          description: list.description || "",
          criteria: reason||list.category,
          filters:saved&&typeof saved==='object'?{...emptyFilters,...saved}:filtersFromReason(reason),
          leads: members.length,
          createdAt: new Date(list.created_at).toLocaleDateString("pt-BR"),
        };})
      : localLists
  )
    .filter((list) => !hiddenLists.includes(list.id))
    .map((list) => ({ ...list, ...listOverrides[list.id] }));
  const openEdit = (list: {
    id: string;
    name: string;
    description: string;
    filters?:SegmentFilters;
  }) => {
    setEditTarget(list);
    setEditName(list.name);
    setEditDescription(list.description);
    setEditFilters({...emptyFilters,...list.filters});
  };
  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!editTarget || !editName.trim()) return;
    setSaving(true);
    setError("");
    try {
      if (remote)
        await remoteRpc("core_segment_list_update_with_members", {
          p_workspace: getRemoteWorkspaceId(),
          p_list_id: editTarget.id,
          p_name: editName.trim(),
          p_description: editDescription.trim(),
          p_filters:editFilters,
          p_contact_ids:editMatched.map(lead=>lead.id),
          p_reason:criteriaFor(editFilters),
        });
      else {
        const updated = localLists.map((list) =>
          list.id === editTarget.id
            ? {
                ...list,
                name: editName.trim(),
                description: editDescription.trim(),
                filters:editFilters,
                criteria:criteriaFor(editFilters),
                leadIds:editMatched.map(lead=>lead.id),
                leads:editMatched.length,
              }
            : list,
        );
        setLocalLists(updated);
        localStorage.setItem(
          "marketing_core_segment_lists",
          JSON.stringify(updated),
        );
      }
      setListOverrides((current) => ({
        ...current,
        [editTarget.id]: {
          name: editName.trim(),
          description: editDescription.trim(),
          filters:editFilters,
          criteria:criteriaFor(editFilters),
          leads:editMatched.length,
        },
      }));
      setEditTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    setError("");
    try {
      if (remote)
        await remoteRpc("core_segment_list_delete", {
          p_workspace: getRemoteWorkspaceId(),
          p_list_id: deleteTarget.id,
        });
      else {
        const updated = localLists.filter(
          (list) => list.id !== deleteTarget.id,
        );
        setLocalLists(updated);
        localStorage.setItem(
          "marketing_core_segment_lists",
          JSON.stringify(updated),
        );
      }
      setHiddenLists((current) => [...current, deleteTarget.id]);
      setDeleteTarget(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  const create = async (event: FormEvent) => {
    event.preventDefault();
    if (!name.trim()) return;
    setSaving(true);
    setError("");
    try {
      if (remote) {
        await remoteRpc("core_segment_list_create_with_filters", {
          p_workspace: getRemoteWorkspaceId(),
          p_name: name.trim(),
          p_description: description.trim(),
          p_category: "CUSTOM",
          p_contact_ids: matched.map((lead) => lead.id),
          p_reason: criteria(),
          p_filters:filters,
        });
      } else {
        const next = {
          id: `segment-${Date.now()}`,
          name: name.trim(),
          description: description.trim(),
          criteria: criteria(),
          leadIds: matched.map((x) => x.id),
          leads: matched.length,
          createdAt: new Date().toLocaleDateString("pt-BR"),
          filters,
        };
        const updated = [next, ...localLists];
        setLocalLists(updated);
        localStorage.setItem(
          "marketing_core_segment_lists",
          JSON.stringify(updated),
        );
      }
      setOpen(false);
      setName("");
      setDescription("");
      setFilters(emptyFilters);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <>
      <PageHeader
        title="Listas de segmentação"
        subtitle="Agrupe contatos reais por critérios comerciais."
        actions={
          <button className="btn primary" onClick={() => setOpen(true)}>
            + Nova lista
          </button>
        }
      />
      {lists.length ? (
        <section className="entity-grid segment-list-grid">
          {lists.map((list) => {
            const links = automationLinks.filter(
              (link) => link.list_id === list.id,
            );
            const linkNames = [...new Set(links.map((link) => link.rule_name))];
            const linked = linkNames.length > 0;
            const tooltip = linked
              ? `Esta lista está vinculada ao fluxo “${linkNames.join(", ")}”`
              : "";
            return (
              <article className="entity-card segment-list-card" key={list.id}>
                <div className="segment-list-card-head">
                  <span className="eyebrow">{list.leads} leads</span>
                  {linked && (
                    <span
                      className="segment-automation-link"
                      aria-label={`Vinculada à automação ${linkNames.join(", ")}`}
                      title={tooltip}
                    >
                      <Link2 size={15} />
                    </span>
                  )}
                </div>
                <h3>{list.name}</h3>
                <p>{list.description || list.criteria}</p>
                <div className="entity-foot">
                  <small>{list.createdAt}</small>
                  <div className="segment-list-actions">
                    <button
                      className="icon-action"
                      aria-label={`Editar ${list.name}`}
                      title="Editar lista"
                      onClick={() => openEdit(list)}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      className="icon-action danger"
                      aria-label={`Excluir ${list.name}`}
                      title={
                        linked
                          ? `Remova esta lista do fluxo “${linkNames.join(", ")}” antes de excluir.`
                          : "Excluir lista"
                      }
                      disabled={linked}
                      onClick={() => setDeleteTarget(list)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </section>
      ) : (
        <section className="surface">
          <EmptyState
            title="Nenhuma lista criada"
            body="Crie uma lista usando contatos do workspace."
          />
        </section>
      )}
      {open && (
        <Modal
          title="Criar lista de segmentação"
          open={open}
          onClose={() => setOpen(false)}
        >
          <form className="segment-filter-form" onSubmit={create}>
            <label className="field">
              <span>NOME</span>
              <input
                aria-label="Nome da lista"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="field">
              <span>DESCRIÇÃO</span>
              <input
                aria-label="Descrição da lista"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </label>
            <section
              className="segment-filter-box"
              role="group"
              aria-label="Filtros da lista"
            >
              <header>
                <div>
                  <Filter size={18} />
                  <span>
                    <strong>Filtros da lista</strong>
                    <small>Refine quais contatos entrarão nesta lista</small>
                  </span>
                </div>
                <b data-testid="segment-active-filter-count">
                  {Object.values(filters).filter(Boolean).length} ativos
                </b>
              </header>
              <div className="form-grid">
                <label className="field">
                  <span>TAG</span>
                  <select
                    aria-label="Filtrar lista por tag"
                    value={filters.tag}
                    onChange={(e) =>
                      setFilters({ ...filters, tag: e.target.value })
                    }
                  >
                    <option value="">Todas</option>
                    {tags.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>STATUS</span>
                  <select
                    aria-label="Filtrar lista por status"
                    value={filters.status}
                    onChange={(e) =>
                      setFilters({ ...filters, status: e.target.value })
                    }
                  >
                    <option value="">Todos</option>
                    {statuses.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>ORIGEM</span>
                  <select
                    aria-label="Filtrar lista por origem"
                    value={filters.source}
                    onChange={(e) =>
                      setFilters({ ...filters, source: e.target.value })
                    }
                  >
                    <option value="">Todas</option>
                    {sources.map((x) => (
                      <option key={x}>{x}</option>
                    ))}
                  </select>
                </label>
              </div>
              <footer>
                <span>
                  Resultado atual: <strong>{matched.length} leads</strong>
                </span>
                <button
                  type="button"
                  disabled={!Object.values(filters).some(Boolean)}
                  onClick={() => setFilters(emptyFilters)}
                >
                  Limpar filtros
                </button>
              </footer>
            </section>
            {error && <p className="form-error">{error}</p>}
            <footer className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button className="btn primary" disabled={saving || !name.trim()}>
                {saving
                  ? "Salvando..."
                  : `Criar lista com ${matched.length} leads`}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {editTarget && (
        <Modal
          title="Editar lista de segmentação"
          open={Boolean(editTarget)}
          onClose={() => setEditTarget(null)}
        >
          <form onSubmit={saveEdit}>
            <label className="field">
              <span>NOME</span>
              <input
                aria-label="Nome da lista"
                value={editName}
                onChange={(event) => setEditName(event.target.value)}
              />
            </label>
            <label className="field">
              <span>DESCRIÇÃO</span>
              <input
                aria-label="Descrição da lista"
                value={editDescription}
                onChange={(event) => setEditDescription(event.target.value)}
              />
            </label>
            <section className="segment-filter-box" role="group" aria-label="Editar filtros da lista">
              <header><div><Filter size={18}/><span><strong>Filtros da lista</strong><small>Altere os critérios e os contatos serão recalculados</small></span></div><b>{Object.values(editFilters).filter(Boolean).length} ativos</b></header>
              <div className="form-grid">
                <label className="field"><span>TAG</span><select aria-label="Editar filtro por tag" value={editFilters.tag} onChange={event=>setEditFilters({...editFilters,tag:event.target.value})}><option value="">Todas</option>{tags.map(tag=><option key={tag}>{tag}</option>)}</select></label>
                <label className="field"><span>STATUS</span><select aria-label="Editar filtro por status" value={editFilters.status} onChange={event=>setEditFilters({...editFilters,status:event.target.value})}><option value="">Todos</option>{statuses.map(status=><option key={status}>{status}</option>)}</select></label>
                <label className="field"><span>ORIGEM</span><select aria-label="Editar filtro por origem" value={editFilters.source} onChange={event=>setEditFilters({...editFilters,source:event.target.value})}><option value="">Todas</option>{sources.map(source=><option key={source}>{source}</option>)}</select></label>
              </div>
              <footer><span>Resultado atualizado: <strong>{editMatched.length} leads</strong></span><button type="button" disabled={!Object.values(editFilters).some(Boolean)} onClick={()=>setEditFilters(emptyFilters)}>Limpar filtros</button></footer>
            </section>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <footer className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setEditTarget(null)}
              >
                Cancelar
              </button>
              <button
                className="btn primary"
                disabled={saving || !editName.trim()}
              >
                {saving ? "Salvando…" : "Salvar alterações"}
              </button>
            </footer>
          </form>
        </Modal>
      )}
      {deleteTarget && (
        <Modal
          title="Excluir lista de segmentação"
          open={Boolean(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
        >
          <div className="segment-delete-confirm">
            <p>
              A lista <strong>{deleteTarget.name}</strong> será excluída
              definitivamente. Os contatos continuarão no CRM.
            </p>
            {error && (
              <p className="form-error" role="alert">
                {error}
              </p>
            )}
            <footer className="modal-actions">
              <button
                type="button"
                className="btn"
                onClick={() => setDeleteTarget(null)}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn danger"
                disabled={saving}
                onClick={confirmDelete}
              >
                {saving ? "Excluindo…" : "Confirmar exclusão"}
              </button>
            </footer>
          </div>
        </Modal>
      )}
    </>
  );
}
