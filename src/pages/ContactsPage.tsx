import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Upload,
  X,
} from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import { DataTable } from "../components/common/DataTable";
import { LeadProfileDrawer } from "../components/contacts/LeadProfileDrawer";
import { LeadImportPage } from "../components/contacts/LeadImportPage";
import {PhoneInput,phoneIdentity} from "../components/common/PhoneInput";
import { type MockLead } from "../data/mockCrmData";
import {
  createLeadRecord,
  getEffectiveLeads,
  importLeadRecords,
  subscribeLeadRecords,
} from "../lib/leadRecords";

import {
  exportCsv,
  exportPdf,
  exportXlsx,
  type ExportTable,
} from "../lib/exportReport";
type LeadDraft = {
  name: string;
  company: string;
  email: string;
  phone: string;
  source: string;
  status: MockLead["status"];
};
const emptyLead: LeadDraft = {
  name: "",
  company: "",
  email: "",
  phone: "",
  source: "",
  status: "Novo",
};
type LeadFilters = {
  source: string;
  status: string;
  company: string;
  period: "" | "7" | "15" | "30" | "custom";
  dateFrom: string;
  dateTo: string;
};
const emptyFilters: LeadFilters = {
  source: "",
  status: "",
  company: "",
  period: "",
  dateFrom: "",
  dateTo: "",
};
const leadDate = (value: string) => {
  const [day, month, year] = value.split("/").map(Number);
  return new Date(year, month - 1, day).getTime();
};
export function ContactsPage({ preview = false }: { preview?: boolean }) {
  const [query, setQuery] = useState("");
  const [importing, setImporting] = useState(false);
  const [open, setOpen] = useState(false);
  const [leadError, setLeadError] = useState("");
  const [selectedLead, setSelectedLead] = useState<MockLead | null>(null);
  const notificationLeadHandled = useRef(false);
  const [exportOpen, setExportOpen] = useState(false);
  const [filterOpen, setFilterOpen] = useState(false);
  const [filters, setFilters] = useState<LeadFilters>(emptyFilters);
  const [filterDraft, setFilterDraft] = useState<LeadFilters>(emptyFilters);
  const [baseLeads, setBaseLeads] = useState<MockLead[]>(getEffectiveLeads);
  const [draft, setDraft] = useState<LeadDraft>(emptyLead);
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const allLeads = baseLeads;
  const filtered = useMemo(
    () =>
      allLeads.filter((item) => {
        if (
          !`${item.name} ${item.email} ${item.company}`
            .toLowerCase()
            .includes(query.toLowerCase())
        )
          return false;
        if (filters.source && item.source !== filters.source) return false;
        if (filters.status && item.status !== filters.status) return false;
        if (
          filters.company &&
          !item.company.toLowerCase().includes(filters.company.toLowerCase())
        )
          return false;
        const created = leadDate(item.createdAt);
        if (filters.period && filters.period !== "custom") {
          const start = new Date();
          start.setHours(0, 0, 0, 0);
          start.setDate(start.getDate() - (Number(filters.period) - 1));
          if (created < start.getTime()) return false;
        }
        if (filters.period === "custom") {
          if (
            filters.dateFrom &&
            created < new Date(`${filters.dateFrom}T00:00:00`).getTime()
          )
            return false;
          if (
            filters.dateTo &&
            created > new Date(`${filters.dateTo}T23:59:59.999`).getTime()
          )
            return false;
        }
        return true;
      }),
    [allLeads, query, filters],
  );
  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  useEffect(() => setPage(1), [query, pageSize]);
  useEffect(() => {
    if (page > totalPages) setPage(totalPages);
  }, [page, totalPages]);
  useEffect(
    () => subscribeLeadRecords(() => setBaseLeads(getEffectiveLeads())),
    [],
  );
  useEffect(() => {
    if (notificationLeadHandled.current) return;
    const hashQuery = window.location.hash.split("?")[1] || "";
    const leadId = new URLSearchParams(hashQuery).get("lead");
    if (!leadId) return;
    const lead = allLeads.find((item) => item.id === leadId);
    if (lead) {
      notificationLeadHandled.current = true;
      setSelectedLead(lead);
    }
  }, [allLeads]);
  const rows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const activeFilterCount = Object.entries(filters).filter(
    ([key, value]) => value && key !== "dateFrom" && key !== "dateTo",
  ).length;
  const sources = Array.from(
    new Set(allLeads.map((item) => item.source).filter(Boolean)),
  ).sort();
  const pages = Array.from(
    { length: totalPages },
    (_, index) => index + 1,
  ).filter(
    (value) =>
      value === 1 || value === totalPages || Math.abs(value - page) <= 1,
  );
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const phone = phoneIdentity(draft.phone);
    const email = draft.email.trim().toLowerCase();
    if (allLeads.some((item) => phoneIdentity(item.phone) === phone)) {
      setLeadError("Já existe um lead com este telefone.");
      return;
    }
    if (
      email &&
      allLeads.some((item) => item.email.trim().toLowerCase() === email)
    ) {
      setLeadError("Já existe um lead com este e-mail.");
      return;
    }
    const lead: MockLead = {
      id: `lead-local-${Date.now()}`,
      name: draft.name.trim(),
      company: draft.company.trim(),
      email: draft.email.trim(),
      phone: draft.phone.trim(),
      source: draft.source,
      status: draft.status,
      createdAt: new Date().toLocaleDateString("pt-BR"),
    };
    try {
      const saved = await createLeadRecord(lead);
      void saved;
      setDraft(emptyLead);
      setOpen(false);
    } catch (cause) {
      setLeadError(
        cause instanceof Error
          ? cause.message
          : "Não foi possível cadastrar o lead.",
      );
    }
  };
  const leadsTable: ExportTable = {
    title: "Leads e contatos",
    headers: [
      "Nome",
      "Empresa",
      "E-mail",
      "Telefone",
      "Origem",
      "Status",
      "Entrada",
    ],
    rows: filtered.map((lead) => [
      lead.name,
      lead.company,
      lead.email,
      lead.phone,
      lead.source,
      lead.status,
      lead.createdAt,
    ]),
  };
  const exportLeads = (format: "pdf" | "xlsx" | "csv") => {
    const file =
      activeFilterCount || query
        ? "leads-filtrados"
        : `leads-${new Date().toISOString().slice(0, 10)}`;
    if (format === "pdf") exportPdf(leadsTable, file);
    else if (format === "xlsx") void exportXlsx(leadsTable, file);
    else exportCsv(leadsTable, file);
    setExportOpen(false);
  };
  if (importing)
    return (
      <LeadImportPage
        onBack={() => setImporting(false)}
        onImport={async (leads, onProgress) => {
          await importLeadRecords(leads, onProgress);
          setImporting(false);
        }}
      />
    );
  return (
    <>
      <PageHeader
        title="Leads & contatos"
        subtitle="Base unificada de pessoas e empresas."
        actions={
          <>
            <button
              className="btn secondary"
              aria-label="Filtrar leads"
              onClick={() => {
                setFilterDraft(filters);
                setFilterOpen(true);
              }}
            >
              <Filter size={16} />
              Filtrar{activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
            </button>
            <button
              className="btn secondary"
              onClick={() => setImporting(true)}
            >
              <Upload size={16} />
              Importar leads
            </button>
            <div className="report-export">
              <button
                className="btn secondary"
                aria-label="Exportar leads"
                onClick={() => setExportOpen((value) => !value)}
              >
                <Download size={16} />
                Exportar leads
              </button>
              {exportOpen && (
                <div className="export-menu">
                  <button onClick={() => exportLeads("pdf")}>
                    Exportar PDF
                  </button>
                  <button onClick={() => exportLeads("xlsx")}>
                    Exportar XLSX
                  </button>
                  <button onClick={() => exportLeads("csv")}>
                    Exportar CSV
                  </button>
                </div>
              )}
            </div>
            <button
              className="btn primary"
              onClick={() => {
                setLeadError("");
                setOpen(true);
              }}
            >
              + Novo lead
            </button>
          </>
        }
      />
      {(activeFilterCount > 0 || query) && (
        <div className="filter-summary">
          <strong>
            {filtered.length}{" "}
            {filtered.length === 1 ? "lead filtrado" : "leads filtrados"}
          </strong>
          <button
            className="btn secondary"
            onClick={() => {
              setFilters(emptyFilters);
              setFilterDraft(emptyFilters);
              setQuery("");
            }}
          >
            Limpar filtros
          </button>
        </div>
      )}
      {preview && (
        <div className="collection-toolbar">
          <div>
            <strong>{allLeads.length} contatos</strong>
            <span>
              Dados fictícios sincronizados com o dashboard e pipeline
            </span>
          </div>
          <input
            aria-label="Filtrar contatos"
            placeholder="Filtrar nome, e-mail ou empresa..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
      )}
      <section className="surface">
        <DataTable<MockLead>
          columns={[
            {
              key: "name",
              label: "NOME",
              render: (row) => (
                <div className="contact-name">
                  <span>
                    {row.name
                      .split(" ")
                      .map((item) => item[0])
                      .slice(0, 2)
                      .join("")}
                  </span>
                  <div>
                    <strong>{row.name}</strong>
                    <small>{row.phone}</small>
                  </div>
                </div>
              ),
            },
            { key: "company", label: "EMPRESA" },
            { key: "email", label: "E-MAIL" },
            { key: "source", label: "ORIGEM" },
            {
              key: "status",
              label: "STATUS",
              render: (row) => (
                <span className={`status-tag ${row.status.toLowerCase()}`}>
                  {row.status}
                </span>
              ),
            },
            { key: "createdAt", label: "ENTRADA" },
          ]}
          rows={rows}
          className="contacts-table"
          onRowClick={setSelectedLead}
        />
        {preview && (
          <footer className="collection-footer lead-pagination">
            <div className="pagination-size">
              <span>Mostrar</span>
              <select
                aria-label="Leads por página"
                value={pageSize}
                onChange={(event) => setPageSize(Number(event.target.value))}
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span>por página</span>
            </div>
            <span className="pagination-result">
              Exibindo {(page - 1) * pageSize + 1}–
              {Math.min(page * pageSize, filtered.length)} de {filtered.length}{" "}
              leads
            </span>
            <nav aria-label="Paginação de leads">
              <button
                aria-label="Página anterior"
                disabled={page === 1}
                onClick={() => setPage((value) => Math.max(1, value - 1))}
              >
                <ChevronLeft size={16} />
              </button>
              {pages.map((value, index) => (
                <span className="page-number-group" key={value}>
                  {index > 0 && value - pages[index - 1] > 1 && <i>…</i>}
                  <button
                    aria-label={`Página ${value}`}
                    aria-current={page === value ? "page" : undefined}
                    className={page === value ? "active" : ""}
                    onClick={() => setPage(value)}
                  >
                    {value}
                  </button>
                </span>
              ))}
              <button
                aria-label="Próxima página"
                disabled={page === totalPages}
                onClick={() =>
                  setPage((value) => Math.min(totalPages, value + 1))
                }
              >
                <ChevronRight size={16} />
              </button>
            </nav>
          </footer>
        )}
      </section>
      {filterOpen && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="lead-create-modal lead-filter-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Filtros de leads"
            onSubmit={(event) => {
              event.preventDefault();
              setFilters(filterDraft);
              setPage(1);
              setFilterOpen(false);
            }}
          >
            <header>
              <div>
                <h2>Filtrar leads</h2>
                <p>
                  Refine a lista por origem, status, empresa e data de entrada.
                </p>
              </div>
              <button
                type="button"
                aria-label="Fechar filtros"
                onClick={() => setFilterOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="lead-form-grid">
              <label>
                <span>ORIGEM</span>
                <select
                  aria-label="Origem"
                  value={filterDraft.source}
                  onChange={(event) =>
                    setFilterDraft({
                      ...filterDraft,
                      source: event.target.value,
                    })
                  }
                >
                  <option value="">Todas</option>
                  {sources.map((source) => (
                    <option key={source}>{source}</option>
                  ))}
                </select>
              </label>
              <label>
                <span>STATUS</span>
                <select
                  aria-label="Status"
                  value={filterDraft.status}
                  onChange={(event) =>
                    setFilterDraft({
                      ...filterDraft,
                      status: event.target.value,
                    })
                  }
                >
                  <option value="">Todos</option>
                  <option>Novo</option>
                  <option>Qualificado</option>
                  <option>Oportunidade</option>
                  <option>Cliente</option>
                </select>
              </label>
              <label>
                <span>EMPRESA</span>
                <input
                  aria-label="Empresa"
                  value={filterDraft.company}
                  onChange={(event) =>
                    setFilterDraft({
                      ...filterDraft,
                      company: event.target.value,
                    })
                  }
                  placeholder="Nome da empresa"
                />
              </label>
              <label>
                <span>DATA DE ENTRADA</span>
                <select
                  aria-label="Período de entrada"
                  value={filterDraft.period}
                  onChange={(event) =>
                    setFilterDraft({
                      ...filterDraft,
                      period: event.target.value as LeadFilters["period"],
                      dateFrom:
                        event.target.value === "custom"
                          ? filterDraft.dateFrom
                          : "",
                      dateTo:
                        event.target.value === "custom"
                          ? filterDraft.dateTo
                          : "",
                    })
                  }
                >
                  <option value="">Todo o período</option>
                  <option value="7">Últimos 7 dias</option>
                  <option value="15">Últimos 15 dias</option>
                  <option value="30">Último mês</option>
                  <option value="custom">Período personalizado</option>
                </select>
              </label>
              {filterDraft.period === "custom" && (
                <>
                  <label>
                    <span>DATA INICIAL</span>
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
                  <label>
                    <span>DATA FINAL</span>
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
                </>
              )}
            </div>
            <footer>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setFilterDraft(emptyFilters)}
              >
                Limpar
              </button>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setFilterOpen(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="btn primary">
                Aplicar filtros
              </button>
            </footer>
          </form>
        </div>
      )}
      {open && (
        <div className="modal-backdrop" role="presentation">
          <form
            className="lead-create-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Cadastrar novo lead"
            onSubmit={submit}
          >
            <header>
              <div>
                <h2>Novo lead</h2>
                <p>Cadastre uma pessoa ou empresa na base comercial.</p>
              </div>
              <button
                type="button"
                aria-label="Fechar"
                onClick={() => setOpen(false)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="lead-form-grid">
              <label>
                <span>NOME DO LEAD *</span>
                <input
                  autoFocus
                  required
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                  placeholder="Nome completo"
                />
              </label>
              <label>
                <span>EMPRESA</span>
                <input
                  value={draft.company}
                  onChange={(event) =>
                    setDraft({ ...draft, company: event.target.value })
                  }
                  placeholder="Nome da empresa"
                />
              </label>
              <label>
                <span>E-MAIL</span>
                <input
                  type="email"
                  value={draft.email}
                  onChange={(event) =>
                    setDraft({ ...draft, email: event.target.value })
                  }
                  placeholder="nome@empresa.com"
                />
              </label>
              <div className="field phone-field">
                <span>TELEFONE *</span>
                <PhoneInput required value={draft.phone} onChange={phone=>setDraft({...draft,phone})}/>
              </div>
              <label>
                <span>ORIGEM *</span>
                <select
                  aria-label="Origem do lead"
                  required
                  value={draft.source}
                  onChange={(event) =>
                    setDraft({ ...draft, source: event.target.value })
                  }
                >
                  <option value="" disabled>
                    Selecione a origem
                  </option>
                  <option>Indicação</option>
                  <option>Landing page</option>
                  <option>Google Ads</option>
                  <option>Instagram</option>
                  <option>LinkedIn</option>
                  <option>Evento</option>
                  <option>Site institucional</option>
                  <option>Outro</option>
                </select>
              </label>
              <label>
                <span>STATUS INICIAL</span>
                <select
                  value={draft.status}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
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
            {leadError && (
              <div className="import-error" role="alert">
                {leadError}
              </div>
            )}
            <footer>
              <button
                type="button"
                className="btn secondary"
                onClick={() => setOpen(false)}
              >
                Cancelar
              </button>
              <button type="submit" className="btn primary">
                Cadastrar lead
              </button>
            </footer>
          </form>
        </div>
      )}
      {selectedLead && (
        <LeadProfileDrawer
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}
    </>
  );
}
