import { Pencil, Plus, Trash2, X } from "lucide-react";
import { useState, type FormEvent } from "react";
import {
  mockOpportunities,
  mockTasks,
  type MockLead,
} from "../../data/mockCrmData";
import {
  deleteLeadRecord,
  getAllLeadTags,
  getLeadRecord,
  saveLeadRecord,
  type LeadRecord,
} from "../../lib/leadRecords";
import { currentCapability } from "../../lib/effectivePermissions";
type Action = "edit" | "note" | "delete" | "tags" | null;
export function LeadProfileDrawer({
  lead,
  onClose,
}: {
  lead: MockLead;
  onClose: () => void;
}) {
  const canWrite = currentCapability("contacts.write");
  const canDelete = currentCapability("contacts.delete");
  const [record, setRecord] = useState<LeadRecord>(() => getLeadRecord(lead));
  const [action, setAction] = useState<Action>(null);
  const [edit, setEdit] = useState(record.lead);
  const [note, setNote] = useState("");
  const [newTag, setNewTag] = useState("");
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const availableTags = getAllLeadTags();
  const current = record.lead;
  const deals = mockOpportunities.filter((item) => item.leadId === current.id);
  const tasks = mockTasks.filter((item) => item.leadId === current.id);
  const initials = current.name
    .split(" ")
    .map((item) => item[0])
    .slice(0, 2)
    .join("");
  const persist = async (next: LeadRecord) => {
    setSaving(true);
    setActionError("");
    try {
      await saveLeadRecord(next);
      setRecord(next);
      return true;
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível salvar as alterações.",
      );
      return false;
    } finally {
      setSaving(false);
    }
  };
  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    if (
      await persist({
        ...record,
        lead: {
          ...edit,
          name: edit.name.trim(),
          phone: edit.phone.trim(),
          source: edit.source.trim(),
        },
      })
    )
      setAction(null);
  };
  const saveNote = async (event: FormEvent) => {
    event.preventDefault();
    if (!note.trim()) return;
    if (
      await persist({
        ...record,
        notes: [
          {
            id: `note-${Date.now()}`,
            text: note.trim(),
            createdAt: new Date().toLocaleString("pt-BR"),
          },
          ...record.notes,
        ],
      })
    ) {
      setNote("");
      setAction(null);
    }
  };
  const addTag = async (event: FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    const value = newTag.trim();
    if (
      value &&
      !record.tags.some((tag) => tag.toLowerCase() === value.toLowerCase()) &&
      (await persist({ ...record, tags: [...record.tags, value] }))
    )
      setNewTag("");
  };
  const removeTag = async (tag: string) => {
    if (!canWrite) return;
    await persist({
      ...record,
      tags: record.tags.filter((item) => item !== tag),
    });
  };
  const confirmDelete = async () => {
    if (!canDelete) return;
    setSaving(true);
    setActionError("");
    try {
      await deleteLeadRecord(current.id);
      onClose();
    } catch (cause) {
      setActionError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível excluir o lead.",
      );
    } finally {
      setSaving(false);
    }
  };
  return (
    <div
      className="lead-drawer-overlay"
      style={{ zIndex: 130 }}
      onMouseDown={(event) => event.target === event.currentTarget && onClose()}
    >
      <aside
        className="lead-drawer"
        role="dialog"
        aria-modal="true"
        aria-label={`Detalhes de ${current.name}`}
      >
        <header className="lead-drawer-head">
          <div className="lead-drawer-headline">
            <small>PERFIL DO CONTATO</small>
            <button
              className="lead-drawer-close"
              aria-label="Fechar perfil"
              onClick={onClose}
            >
              <X size={20} />
            </button>
          </div>
          <div className="lead-contact-hero">
            <span>{initials}</span>
            <div>
              <h2>{current.name}</h2>
              <p>
                {current.company} · {current.source}
              </p>
            </div>
          </div>
          <div className="lead-drawer-actions">
            {canWrite && (
              <button
                onClick={() => {
                  setEdit(current);
                  setAction("edit");
                }}
              >
                <Pencil size={14} />
                Editar
              </button>
            )}
            <button onClick={() => setAction("note")}>
              <Plus size={14} />
              Registrar nota
            </button>
            {canDelete && (
              <button className="danger" onClick={() => setAction("delete")}>
                <Trash2 size={14} />
                Excluir
              </button>
            )}
          </div>
        </header>
        <div className="lead-drawer-body">
          <section className="lead-drawer-section">
            <h3>Informações</h3>
            <div className="lead-detail-grid">
              <div>
                <span>E-mail</span>
                <strong>{current.email || "Não informado"}</strong>
              </div>
              <div>
                <span>Telefone</span>
                <strong>{current.phone}</strong>
              </div>
              <div>
                <span>Empresa</span>
                <strong>{current.company || "Não informada"}</strong>
              </div>
              <div>
                <span>Responsável</span>
                <strong>Equipe comercial</strong>
              </div>
              <div>
                <span>Status</span>
                <strong>{current.status}</strong>
              </div>
              <div>
                <span>Campanha</span>
                <strong>{current.source}</strong>
              </div>
              <div>
                <span>Origem</span>
                <strong>{current.source}</strong>
              </div>
              <div>
                <span>Cadastro</span>
                <strong>{current.createdAt}</strong>
              </div>
            </div>
            <p className="section-note lead-consent">
              Consentimento: não informado
            </p>
          </section>
          <section className="lead-drawer-section">
            <h3>Tags</h3>
            <div className="lead-tags">
              {record.tags.map((tag) => (
                <span key={tag}>{tag}</span>
              ))}
            </div>
            {canWrite && (
              <button className="btn small" onClick={() => setAction("tags")}>
                <Plus size={13} />
                Gerenciar tags
              </button>
            )}
          </section>
          <section className="lead-drawer-section">
            <h3>Negócios vinculados</h3>
            {deals.length ? (
              deals.map((deal) => (
                <div className="lead-mini-row" key={deal.id}>
                  <div>
                    <strong>{deal.name}</strong>
                    <small>
                      {new Intl.NumberFormat("pt-BR", {
                        style: "currency",
                        currency: "BRL",
                      }).format(deal.value)}
                    </small>
                  </div>
                  <span>{deal.stage}</span>
                </div>
              ))
            ) : (
              <p className="section-note">Nenhum negócio vinculado.</p>
            )}
          </section>
          <section className="lead-drawer-section">
            <h3>Histórico de atividades</h3>
            <div className="lead-timeline">
              {record.notes.map((item) => (
                <div className="lead-timeline-item note" key={item.id}>
                  <strong>Nota registrada</strong>
                  <p>{item.text}</p>
                  <small>{item.createdAt}</small>
                </div>
              ))}
              {tasks.map((task) => (
                <div className="lead-timeline-item" key={task.id}>
                  <strong>Tarefa: {task.title}</strong>
                  <p>{task.status}</p>
                  <small>{task.dueAt}</small>
                </div>
              ))}
            </div>
            {!record.notes.length && !tasks.length && (
              <p className="section-note">Sem atividades registradas.</p>
            )}
          </section>
        </div>
      </aside>
      {action === "edit" && (
        <div className="lead-action-backdrop">
          <form
            className="lead-action-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Editar contato"
            onSubmit={saveEdit}
          >
            <header>
              <h2>Editar contato</h2>
              <button
                type="button"
                aria-label="Fechar edição do contato"
                onClick={() => setAction(null)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="form-grid">
              <label className="field">
                <span>Nome</span>
                <input
                  aria-label="Nome do contato"
                  required
                  value={edit.name}
                  onChange={(event) =>
                    setEdit({ ...edit, name: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Telefone</span>
                <input
                  aria-label="Telefone do contato"
                  required
                  value={edit.phone}
                  onChange={(event) =>
                    setEdit({ ...edit, phone: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>E-mail</span>
                <input
                  type="email"
                  value={edit.email}
                  onChange={(event) =>
                    setEdit({ ...edit, email: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Empresa</span>
                <input
                  value={edit.company}
                  onChange={(event) =>
                    setEdit({ ...edit, company: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Origem</span>
                <input
                  aria-label="Origem do contato"
                  required
                  value={edit.source}
                  onChange={(event) =>
                    setEdit({ ...edit, source: event.target.value })
                  }
                />
              </label>
              <label className="field">
                <span>Status</span>
                <select
                  value={edit.status}
                  onChange={(event) =>
                    setEdit({
                      ...edit,
                      status: event.target.value as MockLead["status"],
                    })
                  }
                >
                  <option>Novo</option>
                  <option>Qualificado</option>
                  <option>Oportunidade</option>
                  <option>Cliente</option>
                </select>
              </label>
            </div>
            {actionError && (
              <div className="import-error" role="alert">
                {actionError}
              </div>
            )}
            <footer>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setAction(null)}
              >
                Cancelar
              </button>
              <button className="btn primary" type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Salvar contato"}
              </button>
            </footer>
          </form>
        </div>
      )}
      {action === "note" && (
        <div className="lead-action-backdrop">
          <form
            className="lead-action-modal compact"
            role="dialog"
            aria-modal="true"
            aria-label="Registrar nova nota"
            onSubmit={saveNote}
          >
            <header>
              <h2>Registrar nota</h2>
              <button
                type="button"
                aria-label="Fechar nova nota"
                onClick={() => setAction(null)}
              >
                <X size={18} />
              </button>
            </header>
            <label className="field">
              <span>Nota</span>
              <textarea
                aria-label="Texto da nota"
                required
                rows={5}
                value={note}
                onChange={(event) => setNote(event.target.value)}
                placeholder="Digite a observação sobre o lead..."
              />
            </label>
            {actionError && (
              <div className="import-error" role="alert">
                {actionError}
              </div>
            )}
            <footer>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setAction(null)}
              >
                Cancelar
              </button>
              <button className="btn primary" type="submit" disabled={saving}>
                {saving ? "Salvando..." : "Adicionar ao histórico"}
              </button>
            </footer>
          </form>
        </div>
      )}
      {action === "delete" && (
        <div className="lead-action-backdrop">
          <section
            className="lead-action-modal compact"
            role="alertdialog"
            aria-modal="true"
            aria-label="Excluir lead"
          >
            <header>
              <h2>Excluir lead do CRM?</h2>
              <button
                type="button"
                aria-label="Fechar exclusão"
                onClick={() => setAction(null)}
              >
                <X size={18} />
              </button>
            </header>
            <p>
              Esta ação removerá <strong>{current.name}</strong> das listas,
              buscas e negociações ativas do CRM.
            </p>
            {actionError && (
              <div className="import-error" role="alert">
                {actionError}
              </div>
            )}
            <footer>
              <button className="btn secondary" onClick={() => setAction(null)}>
                Cancelar
              </button>
              <button
                className="btn danger"
                disabled={saving}
                onClick={() => void confirmDelete()}
              >
                {saving ? "Excluindo..." : "Excluir definitivamente"}
              </button>
            </footer>
          </section>
        </div>
      )}
      {action === "tags" && (
        <div className="lead-action-backdrop">
          <section
            className="lead-action-modal compact"
            role="dialog"
            aria-modal="true"
            aria-label="Gerenciar tags do lead"
          >
            <header>
              <h2>Gerenciar tags</h2>
              <button
                type="button"
                aria-label="Fechar tags"
                onClick={() => setAction(null)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="tag-manager-list">
              {record.tags.map((tag) => (
                <div key={tag}>
                  <span>{tag}</span>
                  <button
                    aria-label={`Remover tag ${tag}`}
                    disabled={saving}
                    onClick={() => void removeTag(tag)}
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <form className="tag-add-form" onSubmit={addTag}>
              <input
                aria-label="Nova tag"
                list="lead-existing-tags"
                value={newTag}
                onChange={(event) => setNewTag(event.target.value)}
                placeholder="Selecione uma tag existente"
              />
              <datalist id="lead-existing-tags">
                {availableTags
                  .filter((tag) => !record.tags.includes(tag))
                  .map((tag) => (
                    <option key={tag} value={tag} />
                  ))}
              </datalist>
              <button className="btn primary" type="submit" disabled={saving}>
                Adicionar tag
              </button>
            </form>
            {actionError && (
              <div className="import-error" role="alert">
                {actionError}
              </div>
            )}
            <footer>
              <button className="btn secondary" onClick={() => setAction(null)}>
                Concluir
              </button>
            </footer>
          </section>
        </div>
      )}
    </div>
  );
}
