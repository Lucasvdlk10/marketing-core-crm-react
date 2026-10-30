import { Search, X, Menu } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { NotificationMenu } from "./NotificationMenu";
import { UserMenu } from "./UserMenu";
import { type MockLead } from "../../data/mockCrmData";
import { getEffectiveLeads, subscribeLeadRecords } from "../../lib/leadRecords";
import { LeadProfileDrawer } from "../contacts/LeadProfileDrawer";
import { currentCapability } from "../../lib/effectivePermissions";
const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
const digits = (value: string) => value.replace(/\D/g, "");
const matchesLead = (lead: MockLead, query: string) => {
  const text = normalizeText(query);
  const queryDigits = digits(query);
  const textMatch = [lead.name, lead.email].some((value) =>
    normalizeText(value).includes(text),
  );
  const documentMatch =
    queryDigits.length >= 3 &&
    [lead.phone, lead.cpf || "", lead.cnpj || ""].some((value) =>
      digits(value).includes(queryDigits),
    );
  return text.length >= 2 && (textMatch || documentMatch);
};
export function Header({
  userName,
  userAvatar,
  role,
  onLogout,
  mobileNavOpen = false,
  onMenuClick,
}: {
  userName: string;
  userAvatar?: string | null;
  role: "admin" | "employee";
  onLogout: () => void;
  mobileNavOpen?: boolean;
  onMenuClick?: () => void;
}) {
  const canSearch = currentCapability("contacts.read");
  const [query, setQuery] = useState("");
  const [selectedLead, setSelectedLead] = useState<MockLead | null>(null);
  const [focused, setFocused] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [leads, setLeads] = useState<MockLead[]>(getEffectiveLeads);
  useEffect(() => { if (mobileSearchOpen) searchInputRef.current?.focus(); }, [mobileSearchOpen]);
  useEffect(() => { if (mobileNavOpen) { setMobileSearchOpen(false); setFocused(false); } }, [mobileNavOpen]);
  useEffect(
    () => subscribeLeadRecords(() => setLeads(getEffectiveLeads())),
    [],
  );
  const results = useMemo(
    () =>
      query.trim().length >= 2
        ? leads.filter((lead) => matchesLead(lead, query)).slice(0, 8)
        : [],
    [query, leads],
  );
  const showResults = focused && query.trim().length >= 2;
  const openLead = (lead: MockLead) => {
    setSelectedLead(lead);
    setFocused(false);
    setMobileSearchOpen(false);
  };
  return (
    <>
      <header className={`topbar ${mobileSearchOpen?'mobile-search-active':''}`}>
        <div className="topbar-start">
          <button type="button" className="sidebar-toggle" aria-label={mobileNavOpen?"Fechar menu de navegação":"Abrir menu de navegação"} aria-expanded={mobileNavOpen} aria-controls="primary-navigation" onClick={onMenuClick}>
            <Menu size={20} aria-hidden="true"/>
          </button>
          <div className="crumb">
            <strong>CRM</strong>
            <span>/</span>
            <span className="padded-crumb">Operação comercial</span>
          </div>
        </div>
        <div className="topbar-end">
          {canSearch && (
            <>
              <button type="button" className="mobile-search-toggle" aria-label={mobileSearchOpen?"Fechar busca global":"Abrir busca global"} aria-expanded={mobileSearchOpen} aria-controls="global-search-input" onClick={()=>setMobileSearchOpen(open=>!open)}>
                {mobileSearchOpen?<X size={18}/>:<Search size={18} />}
              </button>
              <div className={`global-search-wrap ${mobileSearchOpen?"mobile-search-open":""}`}>
              <label className="top-search">
                <Search size={17} />
                <input
                  id="global-search-input"
                  ref={searchInputRef}
                  aria-label="Busca global"
                  placeholder="Buscar nome, telefone, e-mail, CPF ou CNPJ..."
                  value={query}
                  onFocus={() => setFocused(true)}
                  onChange={(event) => {
                    setQuery(event.target.value);
                    setFocused(true);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" && results[0])
                      openLead(results[0]);
                    if (event.key === "Escape") { setFocused(false); setMobileSearchOpen(false); }
                  }}
                />
                {query && (
                  <button
                    type="button"
                    aria-label="Limpar busca"
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setQuery("")}
                  >
                    <X size={14} />
                  </button>
                )}
              </label>
              {showResults && (
                <div
                  className="global-search-results"
                  role="listbox"
                  aria-label="Resultados da busca global"
                >
                  {results.length ? (
                    results.map((lead) => (
                      <button
                        type="button"
                        role="option"
                        aria-label={`Abrir lead ${lead.name}`}
                        key={lead.id}
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => openLead(lead)}
                      >
                        <span>
                          {lead.name
                            .split(" ")
                            .map((part) => part[0])
                            .slice(0, 2)
                            .join("")}
                        </span>
                        <div>
                          <strong>{lead.name}</strong>
                          <small>
                            {lead.phone} · {lead.email}
                          </small>
                          <em>
                            CPF {lead.cpf} · CNPJ {lead.cnpj}
                          </em>
                        </div>
                        <b>{lead.status}</b>
                      </button>
                    ))
                  ) : (
                    <div className="global-search-empty">
                      <strong>Nenhum lead encontrado</strong>
                      <span>
                        Pesquise por nome, telefone, e-mail, CPF ou CNPJ.
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            </>
            )}
            <NotificationMenu />
          <UserMenu
            userName={userName}
            avatarUrl={userAvatar}
            role={role === "admin" ? "owner" : "employee"}
            onLogout={onLogout}
          />
        </div>
      </header>
      {selectedLead && (
        <LeadProfileDrawer
          lead={selectedLead}
          onClose={() => setSelectedLead(null)}
        />
      )}
    </>
  );
}
