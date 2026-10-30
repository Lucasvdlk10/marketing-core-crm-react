import { CircleCheck, Filter, Link2, Pencil, Trash2, X, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { PageHeader, EmptyState } from "../components/common/PageHeader";
import { getPipelines, type PipelineConfig } from "../lib/pipelines";
import {
  mockLeads,
  mockOpportunities,
  type MockLead,
} from "../data/mockCrmData";
import { LeadProfileDrawer } from "../components/contacts/LeadProfileDrawer";
import { PhoneInput, phoneIdentity } from "../components/common/PhoneInput";
import { getLeadSources } from "../lib/leadSources";
import { getLossReasons } from "../lib/lossReasons";
import { getDealActions, subscribeDealActions } from "../lib/dealActions";
import { loadRemoteCommercialSettings } from "../lib/workspaceSettings";
import { saveDealLossRecord } from "../lib/dealLossRecords";
import {currentCapability} from '../lib/effectivePermissions';
import {
  removeScheduledDealAction,
  saveScheduledDealAction,
} from "../lib/scheduledDealActions";
import {
  getRemoteSnapshot,
  isRemoteMode,
  REMOTE_UPDATED_EVENT,
  remoteInsert,
  remoteDelete,
  remoteUpdate,
  type RemoteContact,
} from "../lib/remoteCrm";
import {
  createLeadRecord,
  getAllLeadTags,
  getEffectiveLeads,
  getLeadRecord,
  isLeadDeleted,
  saveLeadRecord,
  subscribeLeadRecords,
} from "../lib/leadRecords";

type Deal = {
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
type SegmentListFilters = {
  tag: string;
  status: string;
  source: string;
  company: string;
  dateFrom: string;
  dateTo: string;
  hasEmail: "" | "yes" | "no";
  stage: string;
};
type StoredSegmentList = {
  id?: string;
  name: string;
  filters?: SegmentListFilters;
  leadIds?: string[];
};
type PipelineFilters = {
  outcome: "open" | "won" | "lost";
  tag: string;
  source: string;
  campaign: string;
  dateFrom: string;
  dateTo: string;
  segment: string;
};
const emptyFilters: PipelineFilters = {
  outcome: "open",
  tag: "",
  source: "",
  campaign: "",
  dateFrom: "",
  dateTo: "",
  segment: "",
};
const campaignFor = (lead: MockLead) =>
  lead.source === "Google Ads"
    ? "Campanha Google Ads"
    : lead.source === "Instagram"
      ? "Campanha Instagram"
      : lead.source === "Landing page"
        ? "Campanha Landing Page"
        : lead.source === "Indicação"
          ? "Programa de Indicações"
          : "Aquisição orgânica";
const leadDate = (value: string) => {
  const [day, month, year] = value.split("/").map(Number);
  return new Date(year, month - 1, day).getTime();
};
const brl = (value: number) =>
  new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
const colors = [
  "#11B8CB",
  "#94A3B8",
  "#8B67D7",
  "#F0A245",
  "#20A579",
  "#EB5C70",
];
const normalizePhone = phoneIdentity;

export function PipelinePage({ preview = false }: { preview?: boolean }) {
  const canWrite=currentCapability('deals.write',preview);const canDelete=currentCapability('deals.delete',preview);
  const [pipelines, setPipelines] = useState<PipelineConfig[]>(getPipelines);
  const [selectedId, setSelectedId] = useState(() =>
    isRemoteMode()
      ? getPipelines()[0]?.id || ""
      : localStorage.getItem("marketing_core_selected_pipeline") ||
        getPipelines()[0].id,
  );
  const [createdDeals, setCreatedDeals] = useState<Deal[]>([]);
  const [editedDeals, setEditedDeals] = useState<Record<string, Deal>>({});
  const [selectedDeal, setSelectedDeal] = useState<Deal | null>(null);
  const [selectedLead, setSelectedLead] = useState<MockLead | null>(null);
  const [hiddenDeals,setHiddenDeals]=useState<Set<string>>(()=>new Set());
  const [deleteConfirm,setDeleteConfirm]=useState<Deal|null>(null);
  const [dealDeleting,setDealDeleting]=useState(false);
  const [deleteError,setDeleteError]=useState("");
  const [editingDeal, setEditingDeal] = useState(false);
  const [editDraft, setEditDraft] = useState({
    name: "",
    value: "",
    stage: "",
    nextAction: "",
    nextActionDate: "",
  });
  const [draggedDealId, setDraggedDealId] = useState<string | null>(null);
  const [dropStage, setDropStage] = useState<string | null>(null);
  const dragOccurred = useRef(false);
  const openedNotificationDeal = useRef(false);
  const [lossOpen, setLossOpen] = useState(false);
  const [lossReason, setLossReason] = useState("");
  const [lossNotes, setLossNotes] = useState("");
  const [feedback, setFeedback] = useState("");
  const [dealActions, setDealActions] = useState<string[]>(getDealActions);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<PipelineFilters>(emptyFilters);
  const [filterDraft, setFilterDraft] = useState<PipelineFilters>(emptyFilters);
  const [modalOpen, setModalOpen] = useState(false);
  const [dealCreating, setDealCreating] = useState(false);
  const [dealCreateError, setDealCreateError] = useState("");
  const [linkedLead, setLinkedLead] = useState<MockLead | null>(null);
  const [availableLeads, setAvailableLeads] =
    useState<MockLead[]>(getEffectiveLeads);
  const leadTags = getAllLeadTags();
  const leadSources = getLeadSources();
  const [draft, setDraft] = useState<DealDraft>({
    name: "",
    contact: "",
    phone: "",
    email: "",
    company: "",
    source: "",
    value: "",
    stage: "",
    nextAction: "",
    nextActionDate: "",
  });
  useEffect(() => {
    const refresh = () => setPipelines(getPipelines());
    window.addEventListener("marketing-core-pipelines-updated", refresh);
    window.addEventListener(REMOTE_UPDATED_EVENT, refresh);
    return () => {
      window.removeEventListener("marketing-core-pipelines-updated", refresh);
      window.removeEventListener(REMOTE_UPDATED_EVENT, refresh);
    };
  }, []);
  useEffect(
    () => subscribeLeadRecords(() => setAvailableLeads(getEffectiveLeads())),
    [],
  );
  useEffect(
    () => subscribeDealActions(() => setDealActions(getDealActions())),
    [],
  );
  useEffect(() => {
    if (preview) return;
    loadRemoteCommercialSettings()
      .then(() => setDealActions(getDealActions()))
      .catch(() => {});
  }, [preview]);
  const selected =
    pipelines.find((item) => item.id === selectedId) || pipelines[0];
  const remoteSnapshot = getRemoteSnapshot();
  const remoteDeals: Deal[] = isRemoteMode()
    ? remoteSnapshot?.deals
        .filter((item) => item.pipeline_id === selected.id)
        .map((item) => {
          const lead = availableLeads.find(
            (candidate) => candidate.id === item.contact_id,
          );
          const stage = remoteSnapshot.stages.find(
            (candidate) => candidate.id === item.stage_id,
          );
          return {
            id: item.id,
            pipelineId: item.pipeline_id,
            leadId: item.contact_id,
            name: item.name,
            company: lead?.company || "",
            contact: lead?.name || "",
            phone: lead?.phone || "",
            stage: stage?.name || "Sem etapa",
            value: Number(item.value) || 0,
            nextAction: item.notes || "Definir próxima ação",
            nextActionDate: item.expected_close || undefined,
            result: item.status,
          };
        }) || []
    : [];
  const baseDeals: Deal[] = isRemoteMode()
    ? remoteDeals
    : selected.id === "sales-default"
      ? mockOpportunities.map(
          (item) =>
            editedDeals[item.id] || {
              ...item,
              pipelineId: "sales-default",
              phone:
                availableLeads.find((lead) => lead.id === item.leadId)?.phone ||
                "",
            },
        )
      : [];
  const allDeals = [
    ...createdDeals.filter((item) => item.pipelineId === selected.id),
    ...baseDeals,
  ].filter((deal) => !isLeadDeleted(deal.leadId)&&!hiddenDeals.has(deal.id));
  useEffect(() => {
    if (openedNotificationDeal.current) return;
    const dealId = new URLSearchParams(
      window.location.hash.split("?")[1] || "",
    ).get("deal");
    if (!dealId) return;
    const deal = allDeals.find((item) => item.id === dealId);
    if (deal) {
      openedNotificationDeal.current = true;
      setSelectedDeal(deal);
    }
  }, [allDeals]);
  const segmentLists = useMemo<StoredSegmentList[]>(() => {
    if (isRemoteMode())
      return (remoteSnapshot?.segmentLists || []).map((list) => ({
        id: list.id,
        name: list.name,
        leadIds: (remoteSnapshot?.segmentMembers || [])
          .filter((member) => member.list_id === list.id && member.contact_id)
          .map((member) => member.contact_id!),
      }));
    try {
      const value = JSON.parse(
        localStorage.getItem("marketing_core_segment_lists") || "[]",
      );
      return Array.isArray(value) ? (value as StoredSegmentList[]) : [];
    } catch {
      return [];
    }
  }, [filterOpen, remoteSnapshot]);
  const isLeadInSegment = (lead: MockLead, deal: Deal, segmentId: string) => {
    const list = segmentLists.find(
      (item) => (item.id || item.name) === segmentId,
    );
    if (!list) return false;
    if (list.leadIds) return list.leadIds.includes(lead.id);
    const criteria = list.filters;
    if (!criteria) return false;
    const record = getLeadRecord(lead);
    if (criteria.tag && !record.tags.includes(criteria.tag)) return false;
    if (criteria.status && lead.status !== criteria.status) return false;
    if (criteria.source && lead.source !== criteria.source) return false;
    if (
      criteria.company &&
      !lead.company.toLowerCase().includes(criteria.company.toLowerCase())
    )
      return false;
    const created = leadDate(lead.createdAt);
    if (
      criteria.dateFrom &&
      created < new Date(`${criteria.dateFrom}T00:00:00`).getTime()
    )
      return false;
    if (
      criteria.dateTo &&
      created > new Date(`${criteria.dateTo}T23:59:59`).getTime()
    )
      return false;
    if (
      criteria.hasEmail &&
      (criteria.hasEmail === "yes" ? !lead.email : Boolean(lead.email))
    )
      return false;
    if (criteria.stage && deal.stage !== criteria.stage) return false;
    return true;
  };
  const filteredDeals = allDeals.filter((deal) => {
    const lead = availableLeads.find((item) => item.id === deal.leadId);
    const result =
      deal.result ||
      (deal.stage === "Perdido"
        ? "lost"
        : /ganh|won/i.test(deal.stage)
          ? "won"
          : "open");
    if (result !== filters.outcome) return false;
    if (!lead)
      return (
        !filters.tag &&
        !filters.source &&
        !filters.campaign &&
        !filters.dateFrom &&
        !filters.dateTo &&
        !filters.segment
      );
    if (filters.tag && !getLeadRecord(lead).tags.includes(filters.tag))
      return false;
    if (filters.source && lead.source !== filters.source) return false;
    if (filters.campaign && campaignFor(lead) !== filters.campaign)
      return false;
    const created = leadDate(lead.createdAt);
    if (
      filters.dateFrom &&
      created < new Date(`${filters.dateFrom}T00:00:00`).getTime()
    )
      return false;
    if (
      filters.dateTo &&
      created > new Date(`${filters.dateTo}T23:59:59`).getTime()
    )
      return false;
    if (filters.segment && !isLeadInSegment(lead, deal, filters.segment))
      return false;
    return true;
  });
  const visibleStageConfigs = selected.stages;
  const stages = visibleStageConfigs.map((stage, index) => ({
    name: stage.name,
    color: stage.name === "Perdido" ? "#D84B5E" : colors[index % colors.length],
    items: filteredDeals.filter((item) => item.stage === stage.name),
  }));
  const total = stages.reduce((sum, stage) => sum + stage.items.length, 0);
  const activeFilterCount = Object.entries(filters).filter(([key,value])=>key!=="outcome"&&Boolean(value)).length;
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
  const openModal = () => {
    if(!canWrite)return;
    setLinkedLead(null);
    setDealCreateError("");
    setDraft({
      name: "",
      contact: "",
      phone: "",
      email: "",
      company: "",
      source: leadSources[0] || "",
      value: "",
      stage: selected.stages[0]?.name || "",
      nextAction: "",
      nextActionDate: "",
    });
    setModalOpen(true);
  };
  const updatePhone = (phone: string) => {
    setDraft((current) => ({ ...current, phone }));
    if (
      linkedLead &&
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
    if(!canWrite)return;
    if (phoneMatch && !linkedLead) {
      setDealCreateError(
        "Vincule o lead encontrado antes de criar a negociação.",
      );
      return;
    }
    setDealCreating(true);
    setDealCreateError("");
    let lead = linkedLead;
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
          const created = await remoteInsert<RemoteContact>("core_contacts", {
            name: localLead.name,
            phone: localLead.phone,
            email: localLead.email || null,
            company: localLead.company || null,
            source: localLead.source,
            status: "qualified",
          });
          lead = { ...localLead, id: created.id };
        } else {
          await createLeadRecord(localLead);
          lead = localLead;
        }
      } else if (!lead.company && draft.company.trim()) {
        lead = { ...lead, company: draft.company.trim() };
        if (isRemoteMode())
          await remoteUpdate("core_contacts", lead.id, {
            company: lead.company,
          });
        else {
          const record = getLeadRecord(lead);
          saveLeadRecord({ ...record, lead });
        }
      }
      if (!draft.name.trim() || !lead.name || !lead.phone)
        throw new Error(
          "Preencha o nome da negociação, o contato e o telefone.",
        );
      const deal: Deal = {
        id: `deal-${Date.now()}`,
        pipelineId: selected.id,
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
        const stage = remoteSnapshot?.stages.find(
          (item) =>
            item.pipeline_id === selected.id && item.name === draft.stage,
        );
        if (!stage)
          throw new Error("Etapa da pipeline não encontrada no Supabase.");
        await remoteInsert("core_deals", {
          contact_id: lead.id,
          pipeline_id: selected.id,
          stage_id: stage.id,
          name: deal.name,
          value: String(deal.value),
          status: stage.outcome,
          expected_close: deal.nextActionDate || null,
          notes: deal.nextAction || null,
        });
      } else setCreatedDeals((current) => [...current, deal]);
      if (deal.nextActionDate && !isRemoteMode())
        await saveScheduledDealAction({
          dealId: deal.id,
          dealName: deal.name,
          leadId: deal.leadId,
          leadName: deal.contact,
          company: deal.company,
          action: deal.nextAction,
          date: deal.nextActionDate,
        });
      setModalOpen(false);
    } catch (cause) {
      setDealCreateError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível criar a negociação.",
      );
    } finally {
      setDealCreating(false);
    }
  };
  const beginEdit = () => {
    if(!canWrite)return;
    if (!selectedDeal) return;
    setEditDraft({
      name: selectedDeal.name,
      value: String(selectedDeal.value),
      stage: selectedDeal.stage,
      nextAction: selectedDeal.nextAction,
      nextActionDate: selectedDeal.nextActionDate || "",
    });
    setEditingDeal(true);
  };
  const errorMessage = (cause: unknown, fallback: string) =>
    cause instanceof Error ? cause.message : fallback;
  const persistDeal = async (
    updated: Deal,
    remoteOutcome?: {
      status: "open" | "won" | "lost";
      stageId?: string;
      notes?: string;
      loss_reason?: string;
    },
  ) => {
    if (isRemoteMode()) {
      const stage = remoteOutcome?.stageId
        ? remoteSnapshot?.stages.find(
            (item) => item.id === remoteOutcome.stageId,
          )
        : remoteSnapshot?.stages.find(
            (item) =>
              item.pipeline_id === updated.pipelineId &&
              item.name === updated.stage,
          );
      if (!stage && !remoteOutcome)
        throw new Error("Etapa da pipeline não encontrada no Supabase.");
      const current = remoteSnapshot?.deals.find(
        (item) => item.id === updated.id,
      );
      const stageId = stage?.id || current?.stage_id;
      if (!stageId)
        throw new Error("A negociação não possui uma etapa remota válida.");
      await remoteUpdate("core_deals", updated.id, {
        name: updated.name,
        value: String(updated.value),
        stage_id: stageId,
        status: remoteOutcome?.status || stage!.outcome,
        loss_reason: remoteOutcome?.loss_reason || updated.lossReason || null,
        expected_close: updated.nextActionDate || null,
        notes: remoteOutcome?.notes ?? (updated.nextAction || null),
      });
      return;
    }
    if (updated.id.startsWith("deal-"))
      setCreatedDeals((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
    else setEditedDeals((current) => ({ ...current, [updated.id]: updated }));
  };
  const saveEdit = async (event: FormEvent) => {
    event.preventDefault();
    if(!canWrite)return;
    if (!selectedDeal || !editDraft.name.trim()) return;
    const updated = {
      ...selectedDeal,
      name: editDraft.name.trim(),
      value: Number(editDraft.value) || 0,
      stage: editDraft.stage,
      nextAction: editDraft.nextAction.trim() || "Definir próxima ação",
      nextActionDate: editDraft.nextActionDate,
    };
    try {
      await persistDeal(updated);
      setSelectedDeal(updated);
      if (!isRemoteMode()) {
        if (updated.nextActionDate)
          await saveScheduledDealAction({
            dealId: updated.id,
            dealName: updated.name,
            leadId: updated.leadId,
            leadName: updated.contact,
            company: updated.company,
            action: updated.nextAction,
            date: updated.nextActionDate,
          });
        else await removeScheduledDealAction(updated.id);
      }
      setEditingDeal(false);
    } catch (cause) {
      setFeedback(errorMessage(cause, "Não foi possível salvar a negociação."));
    }
  };
  const moveDeal = async (dealId: string, stage: string) => {
    if(!canWrite)return;
    const deal = allDeals.find((item) => item.id === dealId);
    if (!deal || deal.stage === stage) {
      setDraggedDealId(null);
      setDropStage(null);
      return;
    }
    try {
      await persistDeal({ ...deal, stage });
    } catch (cause) {
      setFeedback(errorMessage(cause, "Não foi possível mover a negociação."));
    } finally {
      setDraggedDealId(null);
      setDropStage(null);
    }
  };
  const updateNextAction = async (nextAction: string) => {
    if(!canWrite)return;
    if (!selectedDeal) return;
    const updated = { ...selectedDeal, nextAction };
    try {
      await persistDeal(updated);
      setSelectedDeal(updated);
      if (!isRemoteMode() && updated.nextActionDate)
        await saveScheduledDealAction({
          dealId: updated.id,
          dealName: updated.name,
          leadId: updated.leadId,
          leadName: updated.contact,
          company: updated.company,
          action: updated.nextAction,
          date: updated.nextActionDate,
        });
    } catch (cause) {
      setFeedback(
        errorMessage(cause, "Não foi possível atualizar a próxima ação."),
      );
    }
  };
  const updateNextActionDate = async (nextActionDate: string) => {
    if(!canWrite)return;
    if (!selectedDeal) return;
    const updated = { ...selectedDeal, nextActionDate };
    try {
      await persistDeal(updated);
      setSelectedDeal(updated);
      if (!isRemoteMode()) {
        if (nextActionDate)
          await saveScheduledDealAction({
            dealId: updated.id,
            dealName: updated.name,
            leadId: updated.leadId,
            leadName: updated.contact,
            company: updated.company,
            action: updated.nextAction,
            date: nextActionDate,
          });
        else await removeScheduledDealAction(updated.id);
      }
    } catch (cause) {
      setFeedback(
        errorMessage(
          cause,
          "Não foi possível atualizar a data da próxima ação.",
        ),
      );
    }
  };
  const markWon = async () => {
    if(!canWrite)return;
    if (!selectedDeal) return;
    const remoteWonStage = remoteSnapshot?.stages.find(
      (stage) =>
        stage.pipeline_id === selectedDeal.pipelineId &&
        stage.outcome === "won",
    );
    const localWonStage =
      selected.stages.find((stage) => /ganh|won/i.test(stage.name))?.name ||
      selected.stages.at(-1)?.name ||
      "Ganho";
    const updated = {
      ...selectedDeal,
      stage: remoteWonStage?.name || localWonStage,
      lossReason: undefined,
      lossNotes: undefined,
    };
    try {
      await persistDeal(
        updated,
        isRemoteMode()
          ? { status: "won", stageId: remoteWonStage?.id }
          : undefined,
      );
      setSelectedDeal(null);
      setFeedback("Negociação marcada como ganha.");
      setTimeout(() => setFeedback(""), 2500);
    } catch (cause) {
      setFeedback(
        errorMessage(cause, "Não foi possível marcar a negociação como ganha."),
      );
    }
  };
  const confirmLoss = async (event: FormEvent) => {
    event.preventDefault();
    if(!canWrite)return;
    if (!selectedDeal || !lossReason) return;
    const notes = lossNotes.trim();
    const currentStage = remoteSnapshot?.stages.find(
      (stage) =>
        stage.pipeline_id === selectedDeal.pipelineId &&
        stage.name === selectedDeal.stage,
    );
    const updated = {
      ...selectedDeal,
      lossReason,
      lossNotes: notes,
      result: "lost" as const,
    };
    try {
      await persistDeal(
        updated,
        isRemoteMode()
          ? {
              status: "lost",
              stageId: currentStage?.id,
              loss_reason: lossReason,
              notes: `Motivo da perda: ${lossReason}${notes ? `\nObservação: ${notes}` : ""}`,
            }
          : undefined,
      );
      if (!isRemoteMode()) {
        saveDealLossRecord({
          dealId: selectedDeal.id,
          dealName: selectedDeal.name,
          leadName: selectedDeal.contact,
          reason: lossReason,
          notes,
          value: selectedDeal.value,
          lostAt: new Date().toISOString(),
        });
        await removeScheduledDealAction(selectedDeal.id);
      }
      setLossOpen(false);
      setSelectedDeal(null);
      setLossReason("");
      setLossNotes("");
      setFeedback("Negociação marcada como perdida.");
      setTimeout(() => setFeedback(""), 2500);
    } catch (cause) {
      setFeedback(
        errorMessage(
          cause,
          "Não foi possível marcar a negociação como perdida.",
        ),
      );
    }
  };
  const deleteDeal=async()=>{if(!canDelete||!deleteConfirm)return;setDealDeleting(true);setDeleteError('');try{if(isRemoteMode())await remoteDelete('core_deals',deleteConfirm.id);else{setCreatedDeals(current=>current.filter(item=>item.id!==deleteConfirm.id));setHiddenDeals(current=>new Set([...current,deleteConfirm.id]));await removeScheduledDealAction(deleteConfirm.id)}setSelectedDeal(null);setDeleteConfirm(null);setEditingDeal(false);setFeedback('Negociação excluída com sucesso.');setTimeout(()=>setFeedback(''),2500)}catch(cause){setDeleteError(errorMessage(cause,'Não foi possível excluir a negociação.'))}finally{setDealDeleting(false)}};

  return (
    <>
      <PageHeader
        title="Pipeline comercial"
        subtitle="Acompanhe negociações por etapa."
        actions={
          <div className="pipeline-actions">
            <label>
              <span>PIPELINE</span>
              <select
                aria-label="Selecionar pipeline"
                value={selected.id}
                onChange={(event) => {
                  setSelectedId(event.target.value);
                  if (!isRemoteMode())
                    localStorage.setItem(
                      "marketing_core_selected_pipeline",
                      event.target.value,
                    );
                }}
              >
                {pipelines.map((pipeline) => (
                  <option key={pipeline.id} value={pipeline.id}>
                    {pipeline.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              className={`pipeline-filter-button ${activeFilterCount ? "active" : ""}`}
              aria-label="Filtrar pipeline"
              onClick={() => {
                setFilterDraft(filters);
                setFilterOpen(true);
              }}
            >
              <Filter size={18} />
              {activeFilterCount > 0 && <span>{activeFilterCount}</span>}
            </button>
            {canWrite&&<button className="btn primary" onClick={openModal}>+ Nova negociação</button>}
          </div>
        }
      />
      <nav className="pipeline-outcome-menu" aria-label="Status das negociações">
        {([{value:'open',label:'Em andamento'},{value:'won',label:'Ganhos'},{value:'lost',label:'Perdidos'}] as const).map(item=><button key={item.value} type="button" className={filters.outcome===item.value?'active':''} aria-pressed={filters.outcome===item.value} onClick={()=>{setFilters(current=>({...current,outcome:item.value}));setFilterDraft(current=>({...current,outcome:item.value}))}}>{item.label}</button>)}
      </nav>
      {preview || isRemoteMode() ? (
        <div className="pipeline-summary">
          <strong>{total} negociações</strong>
          <span>
            {selected.name}
            {preview && !isRemoteMode() && selected.id === "sales-default"
              ? " · 31 ganhos · R$ 86.400 em receita fictícia"
              : " · Pipeline personalizada"}
          </span>
        </div>
      ) : null}
      {feedback && (
        <div className="pipeline-feedback" role="status">
          {feedback}
        </div>
      )}
      <div className="kanban">
        {preview || isRemoteMode() ? (
          stages.map((stage) => (
            <section
              className={`kanban-column ${dropStage === stage.name ? "drop-target" : ""}`}
              key={stage.name}
              data-testid={`pipeline-stage-${stage.name}`}
              onDragOver={(event) => {
                event.preventDefault();
                if (draggedDealId) setDropStage(stage.name);
              }}
              onDragLeave={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget as Node))
                  setDropStage(null);
              }}
              onDrop={(event) => {
                event.preventDefault();
                if (draggedDealId) moveDeal(draggedDealId, stage.name);
              }}
            >
              <header>
                <div>
                  <span
                    className="stage-dot"
                    style={{ background: stage.color }}
                  />
                  <strong>{stage.name}</strong>
                </div>
                <b>{stage.items.length}</b>
              </header>
              <div className="kanban-cards">
                {stage.items
                  .slice(0, stage.name === "Ganho" ? 5 : 6)
                  .map((item) => (
                    <article
                      className={`deal-card clickable-deal-card ${draggedDealId === item.id ? "dragging" : ""}`}
                      key={item.id}
                      data-testid={`deal-card-${item.id}`}
                      draggable={canWrite}
                      tabIndex={0}
                      role="button"
                      aria-label={`Abrir negociação ${item.name} de ${item.company}`}
                      onDragStart={(event) => {
                        dragOccurred.current = true;
                        setDraggedDealId(item.id);
                        if (event.dataTransfer) {
                          event.dataTransfer.effectAllowed = "move";
                          event.dataTransfer.setData("text/plain", item.id);
                        }
                      }}
                      onDragEnd={() => {
                        setDraggedDealId(null);
                        setDropStage(null);
                        window.setTimeout(() => {
                          dragOccurred.current = false;
                        }, 0);
                      }}
                      onClick={() => {
                        if (!dragOccurred.current) setSelectedDeal(item);
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          setSelectedDeal(item);
                        }
                      }}
                    >
                      <span className="deal-kind">{item.name}</span>
                      <h3>{item.company}</h3>
                      <p>{item.contact}</p>
                      <strong>{brl(item.value)}</strong>
                      <small>{item.nextAction}</small>
                    </article>
                  ))}
                {stage.items.length > (stage.name === "Ganho" ? 5 : 6) && (
                  <div className="more-deals">
                    + {stage.items.length - (stage.name === "Ganho" ? 5 : 6)}{" "}
                    negociações
                  </div>
                )}
                {!stage.items.length && (
                  <div className="kanban-empty">
                    Nenhuma negociação nesta etapa
                  </div>
                )}
              </div>
            </section>
          ))
        ) : (
          <EmptyState
            title="Pipeline sem registros carregados"
            body="As etapas e negociações vêm do staging após autenticação."
          />
        )}
      </div>

      {filterOpen && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="pipeline-filter-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Filtros da pipeline"
            onSubmit={(event) => {
              event.preventDefault();
              setFilters(filterDraft);
              setFilterOpen(false);
            }}
          >
            <header>
              <div>
                <span>FILTROS</span>
                <h2>Filtrar Pipeline</h2>
                <p>Combine critérios para localizar negociações específicas.</p>
              </div>
              <button
                type="button"
                aria-label="Fechar filtros"
                onClick={() => setFilterOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="pipeline-filter-body">
              <label className="field">
                <span>Tag</span>
                <select
                  aria-label="Filtrar por tag"
                  value={filterDraft.tag}
                  onChange={(event) =>
                    setFilterDraft({ ...filterDraft, tag: event.target.value })
                  }
                >
                  <option value="">Todas as tags</option>
                  {leadTags.map((tag) => (
                    <option key={tag}>{tag}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Origem</span>
                <select
                  aria-label="Filtrar por origem"
                  value={filterDraft.source}
                  onChange={(event) =>
                    setFilterDraft({
                      ...filterDraft,
                      source: event.target.value,
                    })
                  }
                >
                  <option value="">Todas as origens</option>
                  {Array.from(
                    new Set(availableLeads.map((lead) => lead.source)),
                  ).map((source) => (
                    <option key={source}>{source}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Campanha</span>
                <select
                  aria-label="Filtrar por campanha"
                  value={filterDraft.campaign}
                  onChange={(event) =>
                    setFilterDraft({
                      ...filterDraft,
                      campaign: event.target.value,
                    })
                  }
                >
                  <option value="">Todas as campanhas</option>
                  {Array.from(
                    new Set(isRemoteMode() ? [] : mockLeads.map(campaignFor)),
                  ).map((campaign) => (
                    <option key={campaign}>{campaign}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Criado a partir de</span>
                <input
                  aria-label="Data inicial"
                  type="date"
                  value={filterDraft.dateFrom}
                  onChange={(event) =>
                    setFilterDraft({
                      ...filterDraft,
                      dateFrom: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field">
                <span>Criado até</span>
                <input
                  aria-label="Data final"
                  type="date"
                  value={filterDraft.dateTo}
                  onChange={(event) =>
                    setFilterDraft({
                      ...filterDraft,
                      dateTo: event.target.value,
                    })
                  }
                />
              </label>
              <label className="field full">
                <span>Lista de segmentação</span>
                <select
                  aria-label="Filtrar por lista de segmentação"
                  value={filterDraft.segment}
                  onChange={(event) =>
                    setFilterDraft({
                      ...filterDraft,
                      segment: event.target.value,
                    })
                  }
                >
                  <option value="">Todas as listas</option>
                  {segmentLists.map((list) => (
                    <option
                      key={list.id || list.name}
                      value={list.id || list.name}
                    >
                      {list.name}
                    </option>
                  ))}
                </select>
                {!segmentLists.length && (
                  <small>Nenhuma lista de segmentação criada.</small>
                )}
              </label>
            </div>
            <footer>
              <button
                type="button"
                className="btn secondary"
                onClick={() => {
                  setFilterDraft(emptyFilters);
                  setFilters(emptyFilters);
                  setFilterOpen(false);
                }}
              >
                Limpar filtros
              </button>
              <button type="submit" className="btn primary">
                Aplicar filtros
              </button>
            </footer>
          </form>
        </div>
      )}

      {selectedDeal && (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSelectedDeal(null);
              setEditingDeal(false);
            }
          }}
        >
          {editingDeal ? (
            <form
              className="deal-details-modal deal-edit-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`Editar negociação ${selectedDeal.name}`}
              onSubmit={saveEdit}
            >
              <header>
                <div>
                  <span>EDITAR NEGOCIAÇÃO</span>
                  <h2>{selectedDeal.company}</h2>
                  <p>Atualize os dados comerciais desta negociação.</p>
                </div>
                <button
                  type="button"
                  aria-label="Cancelar edição"
                  onClick={() => setEditingDeal(false)}
                >
                  <X size={19} />
                </button>
              </header>
              <div className="deal-details-body">
                <div className="form-grid">
                  <label className="field full">
                    <span>Nome da negociação</span>
                    <input
                      required
                      value={editDraft.name}
                      onChange={(event) =>
                        setEditDraft({ ...editDraft, name: event.target.value })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Valor</span>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={editDraft.value}
                      onChange={(event) =>
                        setEditDraft({
                          ...editDraft,
                          value: event.target.value,
                        })
                      }
                    />
                  </label>
                  <label className="field">
                    <span>Etapa</span>
                    <select
                      value={editDraft.stage}
                      onChange={(event) =>
                        setEditDraft({
                          ...editDraft,
                          stage: event.target.value,
                        })
                      }
                    >
                      {selected.stages.map((stage) => (
                        <option key={stage.id} value={stage.name}>
                          {stage.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field full">
                    <span>Próxima ação</span>
                    <select
                      aria-label="Próxima ação da negociação"
                      value={editDraft.nextAction}
                      onChange={(event) =>
                        setEditDraft({
                          ...editDraft,
                          nextAction: event.target.value,
                        })
                      }
                    >
                      {editDraft.nextAction &&
                        !dealActions.includes(editDraft.nextAction) && (
                          <option>{editDraft.nextAction}</option>
                        )}
                      <option value="">Definir próxima ação</option>
                      {dealActions.map((action) => (
                        <option key={action} value={action}>
                          {action}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field full">
                    <span>Data da próxima ação</span>
                    <input
                      aria-label="Data da próxima ação na edição"
                      type="date"
                      value={editDraft.nextActionDate}
                      onChange={(event) =>
                        setEditDraft({
                          ...editDraft,
                          nextActionDate: event.target.value,
                        })
                      }
                    />
                  </label>
                </div>
              </div>
              <footer>
                <button
                  type="button"
                  className="btn secondary"
                  onClick={() => setEditingDeal(false)}
                >
                  Cancelar
                </button>
                <button type="submit" className="btn primary">
                  Salvar alterações
                </button>
              </footer>
            </form>
          ) : (
            <section
              className="deal-details-modal"
              role="dialog"
              aria-modal="true"
              aria-label={`Detalhes da negociação ${selectedDeal.name}`}
            >
              <header>
                <div className="deal-detail-title">
                  <span>NEGOCIAÇÃO</span>
                  <h2>{selectedDeal.name}</h2>
                  <div className="deal-detail-secondary-actions">
                    <button
                      type="button"
                      className="deal-edit-trigger"
                      aria-label="Editar negociação"
                      disabled={!canWrite}
                      onClick={beginEdit}
                    >
                      <Pencil size={15} />
                      Editar negociação
                    </button>
                    <button
                      type="button"
                      className="deal-delete-trigger"
                      aria-label="Excluir negociação"
                      disabled={!canDelete}
                      onClick={()=>{setDeleteError('');setDeleteConfirm(selectedDeal)}}
                    >
                      <Trash2 size={15} />
                      Excluir negociação
                    </button>
                  </div>
                  <p>{selectedDeal.company}</p>
                </div>
                <div className="deal-detail-head-actions outcome">
                  <button
                    type="button"
                    className="deal-win-button"
                    aria-label="Marcar como ganha"
                    disabled={!canWrite}
                    onClick={markWon}
                  >
                    <CircleCheck size={17} />
                    Ganhar
                  </button>
                  <button
                    type="button"
                    className="deal-lose-button"
                    aria-label="Marcar como perdida"
                    disabled={!canWrite}
                    onClick={() => {
                      setLossReason("");
                      setLossNotes("");
                      setLossOpen(true);
                    }}
                  >
                    <XCircle size={17} />
                    Perder
                  </button>
                  <button
                    type="button"
                    className="deal-detail-close"
                    aria-label="Fechar detalhes da negociação"
                    onClick={() => setSelectedDeal(null)}
                  >
                    <X size={19} />
                  </button>
                </div>
              </header>
              <div className="deal-details-body">
                <div className="deal-details-value">
                  <span>Valor da negociação</span>
                  <strong>{brl(selectedDeal.value)}</strong>
                  <b>{selectedDeal.stage}</b>
                </div>
                <div className="deal-details-grid">
                  <div>
                    <span>Empresa</span>
                    <strong>{selectedDeal.company}</strong>
                  </div>
                  <div>
                    <span>Etapa atual</span>
                    <strong>{selectedDeal.stage}</strong>
                  </div>
                  <label className="deal-next-action">
                    <span>Próxima ação</span>
                    <select
                      aria-label="Selecionar próxima ação"
                      value={selectedDeal.nextAction}
                      disabled={!canWrite}
                      onChange={(event) => updateNextAction(event.target.value)}
                    >
                      {selectedDeal.nextAction &&
                        !dealActions.includes(selectedDeal.nextAction) && (
                          <option>{selectedDeal.nextAction}</option>
                        )}
                      <option value="Definir próxima ação">
                        Definir próxima ação
                      </option>
                      {dealActions.map((action) => (
                        <option key={action} value={action}>
                          {action}
                        </option>
                      ))}
                    </select>
                    <input
                      aria-label="Data da próxima ação"
                      type="date"
                      value={selectedDeal.nextActionDate || ""}
                      onChange={(event) =>
                        updateNextActionDate(event.target.value)
                      }
                    />
                  </label>
                  <div>
                    <span>Pipeline</span>
                    <strong>{selected.name}</strong>
                  </div>
                </div>
                <button
                  type="button"
                  className="deal-linked-lead"
                  aria-label={`Abrir perfil do lead ${selectedDeal.contact}`}
                  onClick={() => {
                    const lead = availableLeads.find(
                      (item) => item.id === selectedDeal.leadId,
                    );
                    if (lead) setSelectedLead(lead);
                  }}
                >
                  <span>Lead vinculado</span>
                  <div>
                    <i>
                      {selectedDeal.contact
                        .split(" ")
                        .map((part) => part[0])
                        .slice(0, 2)
                        .join("")}
                    </i>
                    <div>
                      <strong>{selectedDeal.contact}</strong>
                      <small>
                        {selectedDeal.phone || "Telefone não informado"}
                      </small>
                    </div>
                    <b>Ver perfil</b>
                  </div>
                </button>
              </div>
            </section>
          )}
        </div>
      )}
      {selectedLead && (
        <LeadProfileDrawer
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}
      {deleteConfirm&&<div className="modal-backdrop delete-deal-backdrop" role="presentation"><section className="delete-deal-dialog" role="dialog" aria-modal="true" aria-label="Confirmar exclusão da negociação"><header><div><span>EXCLUIR NEGOCIAÇÃO</span><h2>Excluir “{deleteConfirm.name}”?</h2><p>Esta ação remove apenas a negociação. O lead vinculado continuará salvo no CRM.</p></div><button type="button" aria-label="Fechar confirmação de exclusão" onClick={()=>setDeleteConfirm(null)}><X size={18}/></button></header>{deleteError&&<p className="form-error" role="alert">{deleteError}</p>}<footer><button type="button" className="btn secondary" disabled={dealDeleting} onClick={()=>setDeleteConfirm(null)}>Cancelar</button><button type="button" className="deal-delete-confirm" disabled={dealDeleting} onClick={deleteDeal}><Trash2 size={16}/>{dealDeleting?'Excluindo…':'Excluir negociação'}</button></footer></section></div>}
      {lossOpen && (
        <div className="modal-backdrop loss-backdrop" role="presentation">
          <form
            className="loss-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="Registrar perda da negociação"
            onSubmit={confirmLoss}
          >
            <header>
              <div>
                <span>NEGOCIAÇÃO PERDIDA</span>
                <h2>Informe o motivo da perda</h2>
                <p>Esta informação será mantida no histórico comercial.</p>
              </div>
              <button
                type="button"
                aria-label="Fechar registro de perda"
                onClick={() => setLossOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="loss-dialog-body">
              <label className="field">
                <span>Motivo da perda</span>
                <select
                  aria-label="Motivo da perda"
                  required
                  value={lossReason}
                  onChange={(event) => setLossReason(event.target.value)}
                >
                  <option value="" disabled>
                    Selecione um motivo
                  </option>
                  {getLossReasons().map((reason) => (
                    <option key={reason}>{reason}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Observação (opcional)</span>
                <textarea
                  aria-label="Observação da perda"
                  rows={4}
                  value={lossNotes}
                  onChange={(event) => setLossNotes(event.target.value)}
                  placeholder="Adicione detalhes que ajudem a entender a perda..."
                />
              </label>
            </div>
            <footer>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setLossOpen(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="deal-lose-button">
                <XCircle size={17} />
                Confirmar perda
              </button>
            </footer>
          </form>
        </div>
      )}

      {modalOpen && (
        <div className="modal-backdrop" role="presentation">
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
                  Digite o telefone para localizar um lead existente. Se não
                  houver correspondência, um novo lead será criado junto com a
                  negociação.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setModalOpen(false)}
              >
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
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Nome do contato</span>
                  <input
                    aria-label="Nome do contato"
                    required
                    readOnly={Boolean(linkedLead)}
                    value={draft.contact}
                    onChange={(event) =>
                      setDraft({ ...draft, contact: event.target.value })
                    }
                  />
                </label>
                <div className="field phone-field">
                  <span>Telefone</span>
                  <PhoneInput
                    required
                    value={draft.phone}
                    onChange={updatePhone}
                  />
                </div>
                <label className="field">
                  <span>E-mail (opcional)</span>
                  <input
                    aria-label="E-mail do contato"
                    type="email"
                    readOnly={Boolean(linkedLead)}
                    value={draft.email}
                    onChange={(event) =>
                      setDraft({ ...draft, email: event.target.value })
                    }
                    placeholder="contato@empresa.com.br"
                  />
                </label>
                {phoneMatch && !linkedLead && (
                  <div className="lead-match-card">
                    <span>
                      <Link2 size={17} />
                    </span>
                    <div>
                      <strong>Lead encontrado</strong>
                      <small>
                        {phoneMatch.name} · {phoneMatch.company}
                      </small>
                    </div>
                    <button
                      type="button"
                      aria-label={`Vincular ${phoneMatch.name}`}
                      onClick={() => linkLead(phoneMatch)}
                    >
                      Vincular lead
                    </button>
                  </div>
                )}
                {linkedLead && (
                  <div className="linked-lead-card">
                    <div>
                      <strong>Negociação vinculada a {linkedLead.name}</strong>
                      <span>
                        Nome, telefone e e-mail usam os dados do lead. Se a
                        empresa estiver vazia, ela será atualizada ao salvar.
                      </span>
                    </div>
                    <button type="button" onClick={() => setLinkedLead(null)}>
                      Desvincular
                    </button>
                  </div>
                )}
                <label className="field">
                  <span>Empresa</span>
                  <input
                    aria-label="Empresa da negociação"
                    readOnly={Boolean(linkedLead?.company)}
                    value={draft.company}
                    onChange={(event) =>
                      setDraft({ ...draft, company: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Origem do lead</span>
                  <select
                    aria-label="Origem do lead na negociação"
                    required
                    disabled={Boolean(linkedLead)}
                    value={draft.source}
                    onChange={(event) =>
                      setDraft({ ...draft, source: event.target.value })
                    }
                  >
                    {leadSources.map((source) => (
                      <option key={source}>{source}</option>
                    ))}
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
                    onChange={(event) =>
                      setDraft({ ...draft, value: event.target.value })
                    }
                  />
                </label>
                <label className="field">
                  <span>Etapa inicial</span>
                  <select
                    value={draft.stage}
                    onChange={(event) =>
                      setDraft({ ...draft, stage: event.target.value })
                    }
                  >
                    {selected.stages.map((stage) => (
                      <option key={stage.id} value={stage.name}>
                        {stage.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Próxima ação</span>
                  <select
                    aria-label="Próxima ação inicial"
                    value={draft.nextAction}
                    onChange={(event) =>
                      setDraft({ ...draft, nextAction: event.target.value })
                    }
                  >
                    <option value="">Definir depois</option>
                    {dealActions.map((action) => (
                      <option key={action} value={action}>
                        {action}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Data da próxima ação</span>
                  <input
                    aria-label="Data da próxima ação na criação"
                    type="date"
                    value={draft.nextActionDate}
                    onChange={(event) =>
                      setDraft({ ...draft, nextActionDate: event.target.value })
                    }
                  />
                </label>
              </div>
              {dealCreateError && (
                <div className="import-error deal-create-error" role="alert">
                  {dealCreateError}
                </div>
              )}
            </div>
            <footer>
              {phoneMatch && !linkedLead ? (
                <span className="deal-link-required">
                  Já existe um lead com este telefone ou e-mail. Vincule-o para
                  evitar duplicidade.
                </span>
              ) : normalizePhone(draft.phone).length >= 8 && !linkedLead ? (
                <span className="deal-new-lead-note">
                  Novo contato: um lead será criado automaticamente.
                </span>
              ) : null}
              <button
                type="button"
                className="btn secondary"
                onClick={() => setModalOpen(false)}
              >
                Cancelar
              </button>
              <button
                type="submit"
                className="btn primary"
                disabled={dealCreating || Boolean(phoneMatch && !linkedLead)}
              >
                {dealCreating ? "Criando…" : "Criar negociação"}
              </button>
            </footer>
          </form>
        </div>
      )}
    </>
  );
}
