import { Link2, X } from "lucide-react";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { PhoneInput, phoneIdentity } from "../common/PhoneInput";
import { type MockLead } from "../../data/mockCrmData";
import { currentCapability } from "../../lib/effectivePermissions";
import { getLeadSources } from "../../lib/leadSources";
import { getDealActions, subscribeDealActions } from "../../lib/dealActions";
import { loadRemoteCommercialSettings } from "../../lib/workspaceSettings";
import {
  createLeadRecord,
  getEffectiveLeads,
  subscribeLeadRecords,
} from "../../lib/leadRecords";
import {
  getRemoteSnapshot,
  getRemoteWorkspaceId,
  isRemoteMode,
  remoteInsert,
  remoteRpc,
} from "../../lib/remoteCrm";
import { saveScheduledDealAction } from "../../lib/scheduledDealActions";
import { type PipelineConfig } from "../../lib/pipelines";

type DealDraft = {
  name: string;
  contact: string;
  phone: string;
  email: string;
  company: string;
  source: string;
  value: string;
  stage: string;
  nextAction: string;
  nextActionDate: string;
};

export type Deal = {
  id: string;
  pipelineId: string;
  leadId: string;
  name: string;
  company: string;
  contact: string;
  phone: string;
  stage: string;
  value: number;
  nextAction: string;
  nextActionDate?: string;
  lossReason?: string;
  lossNotes?: string;
  result?: "open" | "won" | "lost";
};

type DealCreateDialogProps = {
  pipeline: PipelineConfig;
  preview?: boolean;
  initialLead?: MockLead | null;
  onClose: () => void;
  onCreated?: (deal: Deal) => void;
};

const emptyDraft = (pipeline: PipelineConfig, lead: MockLead | null): DealDraft => ({
  name: lead?.name || "",
  contact: lead?.name || "",
  phone: lead?.phone || "",
  email: lead?.email || "",
  company: lead?.company || "",
  source: lead?.source || getLeadSources()[0] || "",
  value: "",
  stage: pipeline.stages[0]?.name || "",
  nextAction: "",
  nextActionDate: "",
});

const normalizePhone = phoneIdentity;

export function DealCreateDialog({
  pipeline,
  preview = false,
  initialLead = null,
  onClose,
  onCreated,
}: DealCreateDialogProps) {
  const canWrite = currentCapability("deals.write", preview);
  const canWriteContacts = currentCapability("contacts.write", preview);
  const [linkedLead, setLinkedLead] = useState<MockLead | null>(initialLead);
  const [draft, setDraft] = useState<DealDraft>(() => emptyDraft(pipeline, initialLead));
  const [dealCreating, setDealCreating] = useState(false);
  const [dealCreateError, setDealCreateError] = useState("");
  const [availableLeads, setAvailableLeads] = useState<MockLead[]>(getEffectiveLeads);
  const [dealActions, setDealActions] = useState<string[]>(getDealActions);
  const [leadSources, setLeadSources] = useState<string[]>(getLeadSources);

  useEffect(
    () => subscribeLeadRecords(() => setAvailableLeads(getEffectiveLeads())),
    [],
  );

  useEffect(() => {
    let active = true;
    const refreshSettings = () => {
      setDealActions(getDealActions());
      setLeadSources(getLeadSources());
    };
    const unsubscribe = subscribeDealActions(refreshSettings);
    if (!preview)
      void loadRemoteCommercialSettings()
        .then(() => {
          if (active) refreshSettings();
        })
        .catch(() => {});
    return () => {
      active = false;
      unsubscribe();
    };
  }, [preview]);

  const remoteSnapshot = getRemoteSnapshot();
  const phoneMatch = useMemo(() => {
    const phone = normalizePhone(draft.phone);
    const email = draft.email.trim().toLowerCase();
    return (
      availableLeads.find(
        (lead) =>
          (phone.length >= 8 && normalizePhone(lead.phone) === phone) ||
          (email && lead.email.trim().toLowerCase() === email),
      ) || null
    );
  }, [draft.phone, draft.email, availableLeads]);
  const conflictingLead =
    phoneMatch && phoneMatch.id !== linkedLead?.id ? phoneMatch : null;

  const updatePhone = (phone: string) => {
    setDraft((current) => ({ ...current, phone }));
    if (
      linkedLead?.phone &&
      normalizePhone(linkedLead.phone) !== normalizePhone(phone)
    )
      setLinkedLead(null);
  };

  const linkLead = (lead: MockLead) => {
    setLinkedLead(lead);
    setDraft((current) => ({
      ...current,
      contact: lead.name,
      phone: lead.phone,
      email: lead.email,
      company: lead.company || current.company,
      source: lead.source,
    }));
  };

  const createDeal = async (event: FormEvent) => {
    event.preventDefault();
    if (!canWrite) return;
    if (conflictingLead) {
      setDealCreateError("Vincule o lead encontrado antes de criar a negociação.");
      return;
    }
    if (!linkedLead && isRemoteMode() && !canWriteContacts) {
      setDealCreateError("Você não tem permissão para criar um novo contato.");
      return;
    }

    setDealCreateError("");
    if (!draft.name.trim() || !draft.contact.trim() || !draft.phone.trim()) {
      setDealCreateError("Preencha o nome da negociação, o contato e o telefone.");
      return;
    }

    setDealCreating(true);
    let lead = linkedLead;
    let atomicDealId: string | null = null;
    try {
      if (!lead) {
        const localLead: MockLead = {
          id: `lead-deal-${Date.now()}`,
          name: draft.contact.trim(),
          phone: draft.phone.trim(),
          email: draft.email.trim(),
          company: draft.company.trim(),
          source: draft.source,
          status: "Oportunidade",
          createdAt: new Date().toLocaleDateString("pt-BR"),
        };
        if (isRemoteMode()) {
          const stage = remoteSnapshot?.stages.find(
            (item) => item.pipeline_id === pipeline.id && item.name === draft.stage,
          );
          if (!stage)
            throw new Error("Etapa da pipeline não encontrada no Supabase.");
          const created = await remoteRpc<{ contact_id: string; deal_id: string }>(
            "core_deal_create_with_contact",
            {
              p_workspace: getRemoteWorkspaceId(),
              p_contact_name: localLead.name,
              p_phone: localLead.phone,
              p_email: localLead.email || null,
              p_company: localLead.company || null,
              p_source: localLead.source,
              p_pipeline: pipeline.id,
              p_stage: stage.id,
              p_deal_name: draft.name.trim(),
              p_value: Number(draft.value) || 0,
              p_expected_close: draft.nextActionDate || null,
              p_notes: draft.nextAction.trim() || null,
            },
          );
          if (!created?.contact_id || !created?.deal_id)
            throw new Error("O Supabase não confirmou a criação da negociação.");
          lead = { ...localLead, id: created.contact_id };
          atomicDealId = created.deal_id;
        } else {
          await createLeadRecord(localLead);
          lead = localLead;
        }
      } else {
        // Do not mutate the existing contact as part of deal creation. If the deal
        // insert fails, the contact must remain unchanged; draft values belong to
        // this deal form only.
        lead = {
          ...lead,
          phone: draft.phone.trim() || lead.phone,
          company: draft.company.trim() || lead.company,
        };
      }

      if (!draft.name.trim() || !lead.name || !lead.phone)
        throw new Error("Preencha o nome da negociação, o contato e o telefone.");

      const deal: Deal = {
        id: `deal-${Date.now()}`,
        pipelineId: pipeline.id,
        leadId: lead.id,
        name: draft.name.trim(),
        company: lead.company || draft.company.trim() || "Sem empresa",
        contact: lead.name,
        phone: lead.phone,
        stage: draft.stage,
        value: Number(draft.value) || 0,
        nextAction: draft.nextAction.trim() || "Definir próxima ação",
        nextActionDate: draft.nextActionDate,
      };

      if (isRemoteMode()) {
        if (atomicDealId) {
          deal.id = atomicDealId;
        } else {
          const stage = remoteSnapshot?.stages.find(
            (item) => item.pipeline_id === pipeline.id && item.name === draft.stage,
          );
          if (!stage)
            throw new Error("Etapa da pipeline não encontrada no Supabase.");
          const created = await remoteInsert<{ id: string }>("core_deals", {
            contact_id: lead.id,
            pipeline_id: pipeline.id,
            stage_id: stage.id,
            name: deal.name,
            value: String(deal.value),
            status: stage.outcome,
            expected_close: deal.nextActionDate || null,
            notes: deal.nextAction || null,
          });
          deal.id = created.id;
        }
      } else {
        if (deal.nextActionDate)
          await saveScheduledDealAction({
            dealId: deal.id,
            dealName: deal.name,
            leadId: deal.leadId,
            leadName: deal.contact,
            company: deal.company,
            action: deal.nextAction,
            date: deal.nextActionDate,
          });
      }

      onCreated?.(deal);
      onClose();
    } catch (cause) {
      setDealCreateError(
        cause instanceof Error ? cause.message : "Não foi possível criar a negociação.",
      );
    } finally {
      setDealCreating(false);
    }
  };

  if (!canWrite) return null;

  return (
    <div className="modal-backdrop deal-create-backdrop" role="presentation">
      <form
        className="deal-create-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Registrar nova negociação"
        onSubmit={createDeal}
      >
        <header>
          <div>
            <h2>Nova negociação</h2>
            <p>
              {linkedLead
                ? `Esta negociação ficará vinculada a ${linkedLead.name}; os dados do lead já estão preenchidos.`
                : "Digite o telefone para localizar um lead existente. Se não houver correspondência, um novo lead será criado junto com a negociação."}
            </p>
          </div>
          <button type="button" aria-label="Fechar" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        <div className="deal-form-body">
          <div className="form-grid">
            <label className="field full">
              <span>Nome da negociação</span>
              <input
                aria-label="Nome da negociação"
                autoFocus
                required
                placeholder="Ex.: Contrato de suporte anual"
                value={draft.name}
                onChange={(event) => setDraft({ ...draft, name: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Nome do contato</span>
              <input
                aria-label="Nome do contato"
                required
                readOnly={Boolean(linkedLead)}
                value={draft.contact}
                onChange={(event) => setDraft({ ...draft, contact: event.target.value })}
              />
            </label>
            <div className="field phone-field">
              <span>Telefone</span>
              <PhoneInput required value={draft.phone} onChange={updatePhone} />
            </div>
            <label className="field">
              <span>E-mail (opcional)</span>
              <input
                aria-label="E-mail do contato"
                type="email"
                readOnly={Boolean(linkedLead)}
                value={draft.email}
                onChange={(event) => setDraft({ ...draft, email: event.target.value })}
                placeholder="contato@empresa.com.br"
              />
            </label>
            {conflictingLead && (
              <div className="lead-match-card">
                <span><Link2 size={17} /></span>
                <div>
                  <strong>Lead encontrado</strong>
                  <small>{conflictingLead.name} · {conflictingLead.company}</small>
                </div>
                <button type="button" aria-label={`Vincular ${conflictingLead.name}`} onClick={() => linkLead(conflictingLead)}>
                  Vincular lead
                </button>
              </div>
            )}
            {linkedLead && (
              <div className="linked-lead-card">
                <div>
                  <strong>Negociação vinculada a {linkedLead.name}</strong>
                  <span>
                    Nome, telefone e e-mail usam os dados do lead. Se a empresa estiver vazia, ela será atualizada ao salvar.
                  </span>
                </div>
                <button type="button" onClick={() => setLinkedLead(null)}>Desvincular</button>
              </div>
            )}
            <label className="field">
              <span>Empresa</span>
              <input
                aria-label="Empresa da negociação"
                readOnly={Boolean(linkedLead?.company)}
                value={draft.company}
                onChange={(event) => setDraft({ ...draft, company: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Origem do lead</span>
              <select
                aria-label="Origem do lead na negociação"
                required
                disabled={Boolean(linkedLead)}
                value={draft.source}
                onChange={(event) => setDraft({ ...draft, source: event.target.value })}
              >
                {[...new Set([...(draft.source ? [draft.source] : []), ...leadSources])].map((source) => <option key={source}>{source}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Valor da negociação</span>
              <input
                aria-label="Valor da negociação"
                type="number"
                min="0"
                step="0.01"
                value={draft.value}
                onChange={(event) => setDraft({ ...draft, value: event.target.value })}
              />
            </label>
            <label className="field">
              <span>Etapa inicial</span>
              <select value={draft.stage} onChange={(event) => setDraft({ ...draft, stage: event.target.value })}>
                {pipeline.stages.map((stage) => <option key={stage.id} value={stage.name}>{stage.name}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Próxima ação</span>
              <select
                aria-label="Próxima ação inicial"
                value={draft.nextAction}
                onChange={(event) => setDraft({ ...draft, nextAction: event.target.value })}
              >
                <option value="">Definir depois</option>
                {dealActions.map((action) => <option key={action} value={action}>{action}</option>)}
              </select>
            </label>
            <label className="field">
              <span>Data da próxima ação</span>
              <input
                aria-label="Data da próxima ação na criação"
                type="date"
                value={draft.nextActionDate}
                onChange={(event) => setDraft({ ...draft, nextActionDate: event.target.value })}
              />
            </label>
          </div>
          {dealCreateError && <div className="import-error deal-create-error" role="alert">{dealCreateError}</div>}
        </div>
        <footer>
          {conflictingLead ? (
            <span className="deal-link-required">Já existe um lead com este telefone ou e-mail. Vincule-o para evitar duplicidade.</span>
          ) : normalizePhone(draft.phone).length >= 8 && !linkedLead ? (
            <span className="deal-new-lead-note">Novo contato: um lead será criado automaticamente.</span>
          ) : null}
          <button type="button" className="btn secondary" onClick={onClose}>Cancelar</button>
          <button type="submit" className="btn primary" disabled={dealCreating || Boolean(conflictingLead)}>
            {dealCreating ? "Criando…" : "Criar negociação"}
          </button>
        </footer>
      </form>
    </div>
  );
}
