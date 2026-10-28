import { useEffect, useState, type ChangeEvent } from "react";
import {
  Building2,
  Columns3,
  Handshake,
  ImagePlus,
  Pencil,
  Plus,
  Save,
  ShieldCheck,
  Tags,
  Trash2,
} from "lucide-react";
import { PageHeader } from "../components/common/PageHeader";
import {
  getPipelines,
  savePipelines,
  type PipelineConfig,
} from "../lib/pipelines";
import { getLossReasons, saveLossReasons } from "../lib/lossReasons";
import { getDealActions, saveDealActions } from "../lib/dealActions";
import {
  getAccessRoles,
  permissionLabels,
  saveAccessRoles,
  type AccessPermission,
  type AccessRole,
} from "../lib/accessRoles";
import { getLeadTags, saveLeadTags, type LeadTagConfig } from "../lib/leadTags";
import {isRemoteRolePermissionAvailable,loadRemoteAccessRoles,loadRemoteCommercialSettings,saveRemoteAccessRoles,saveRemoteCommercialSetting} from "../lib/workspaceSettings";
export type CompanyProfile = { name: string; tagline: string; logoUrl: string };
export function SettingsPage({
  profile,
  onSave,
  authenticated = false,
}: {
  profile: CompanyProfile;
  onSave: (
    profile: CompanyProfile,
  ) => CompanyProfile | Promise<CompanyProfile> | void;
  authenticated?: boolean;
}) {
  const [draft, setDraft] = useState(profile);
  const [saved, setSaved] = useState(false);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [pipelineSaved, setPipelineSaved] = useState(false);
  const [pipelineSaving, setPipelineSaving] = useState(false);
  const [pipelineError, setPipelineError] = useState("");
  const [pipelines, setPipelines] = useState<PipelineConfig[]>(getPipelines);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [lossReasons, setLossReasons] = useState<string[]>(getLossReasons);
  const [lossReasonsSaved, setLossReasonsSaved] = useState(false);
  const [dealActions, setDealActions] = useState<string[]>(getDealActions);
  const [dealActionsSaved, setDealActionsSaved] = useState(false);
  const [accessRoles, setAccessRoles] = useState<AccessRole[]>(getAccessRoles);
  const [accessRolesSaved, setAccessRolesSaved] = useState(false);
  const [activeSection, setActiveSection] = useState<
    "company" | "pipeline" | "deals" | "tags" | "access"
  >("company");
  const [leadTags, setLeadTags] = useState<LeadTagConfig[]>(getLeadTags);
  const [leadTagsSaved, setLeadTagsSaved] = useState(false);
  const [leadTagsSaving, setLeadTagsSaving] = useState(false);
  const [leadTagsError, setLeadTagsError] = useState("");
  const [remoteSettingsError,setRemoteSettingsError]=useState("");
  useEffect(() => setDraft(profile), [profile]);
  useEffect(()=>{if(!authenticated)return;let active=true;Promise.all([loadRemoteCommercialSettings(),loadRemoteAccessRoles()]).then(([commercial,roles])=>{if(!active)return;setLossReasons(commercial.lossReasons);setDealActions(commercial.dealActions);if(roles.length)setAccessRoles(roles as AccessRole[])}).catch(error=>{if(active)setRemoteSettingsError(error instanceof Error?error.message:'Não foi possível carregar as configurações remotas.')});return()=>{active=false}},[authenticated]);
  const logo = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () =>
      setDraft((current) => ({ ...current, logoUrl: String(reader.result) }));
    reader.readAsDataURL(file);
  };
  const addPipeline = () => {
    const id = `pipeline-${Date.now()}`;
    setPipelines((current) => [
      ...current,
      {
        id,
        name: "Nova pipeline",
        stages: [{ id: `stage-${Date.now()}`, name: "Nova etapa" }],
      },
    ]);
    setEditingId(id);
  };
  const updatePipeline = (id: string, name: string) =>
    setPipelines((current) =>
      current.map((item) => (item.id === id ? { ...item, name } : item)),
    );
  const addStage = (pipelineId: string) =>
    setPipelines((current) =>
      current.map((item) =>
        item.id === pipelineId
          ? {
              ...item,
              stages: [
                ...item.stages,
                { id: `stage-${Date.now()}`, name: "Nova etapa" },
              ],
            }
          : item,
      ),
    );
  const updateStage = (pipelineId: string, stageId: string, name: string) =>
    setPipelines((current) =>
      current.map((item) =>
        item.id === pipelineId
          ? {
              ...item,
              stages: item.stages.map((stage) =>
                stage.id === stageId ? { ...stage, name } : stage,
              ),
            }
          : item,
      ),
    );
  const removeStage = (pipelineId: string, stageId: string) =>
    setPipelines((current) =>
      current.map((item) =>
        item.id === pipelineId && item.stages.length > 1
          ? {
              ...item,
              stages: item.stages.filter((stage) => stage.id !== stageId),
            }
          : item,
      ),
    );
  const removePipeline = (id: string) =>
    setPipelines((current) =>
      current.length > 1 ? current.filter((item) => item.id !== id) : current,
    );
  const addAccessRole = () =>
    setAccessRoles((current) => [
      ...current,
      { id: `role-${Date.now()}`, name: "Nova função", permissions: ["leads"] },
    ]);
  const updateAccessRole = (id: string, change: Partial<AccessRole>) =>
    setAccessRoles((current) =>
      current.map((role) => (role.id === id ? { ...role, ...change } : role)),
    );
  const togglePermission = (role: AccessRole, permission: AccessPermission) => {
    if (role.protected) return;
    updateAccessRole(role.id, {
      permissions: role.permissions.includes(permission)
        ? role.permissions.filter((item) => item !== permission)
        : [...role.permissions, permission],
    });
  };
  const updateLeadTag = (id: string, change: Partial<LeadTagConfig>) =>
    setLeadTags((current) =>
      current.map((tag) => (tag.id === id ? { ...tag, ...change } : tag)),
    );
  const settingsItems = [
    {
      id: "company" as const,
      label: "Empresa",
      description: "Identidade do workspace",
      icon: Building2,
    },
    {
      id: "pipeline" as const,
      label: "Pipeline",
      description: "Etapas do processo comercial",
      icon: Columns3,
    },
    {
      id: "deals" as const,
      label: "Negociações",
      description: "Perdas e próximas ações",
      icon: Handshake,
    },
    {
      id: "tags" as const,
      label: "Leads e tags",
      description: "Classificação dos contatos",
      icon: Tags,
    },
    {
      id: "access" as const,
      label: "Equipe e acesso",
      description: "Funções e permissões",
      icon: ShieldCheck,
    },
  ];
  return (
    <>
      <PageHeader
        title="Configurações"
        subtitle="Administre a empresa, o processo comercial, os leads e os acessos em um só lugar."
      />
      <div className="settings-layout">
        <nav
          className="settings-nav surface"
          aria-label="Seções das configurações"
        >
          <div>
            <strong>Central administrativa</strong>
            <span>Selecione uma categoria</span>
          </div>
          {settingsItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                aria-label={item.label}
                className={activeSection === item.id ? "active" : ""}
                aria-current={activeSection === item.id ? "page" : undefined}
                onClick={() => setActiveSection(item.id)}
              >
                <Icon size={18} />
                <span>
                  <b>{item.label}</b>
                  <small>{item.description}</small>
                </span>
              </button>
            );
          })}
        </nav>
        <main className="settings-content">
          {remoteSettingsError&&<p className="save-feedback error" role="alert">{remoteSettingsError}</p>}
          {activeSection === "company" && (
            <section className="surface panel-body company-settings">
              <div>
                <h2>Perfil da empresa</h2>
                <p>Essas informações aparecem na identificação do workspace.</p>
              </div>
              <div className="company-logo-editor">
                <span>
                  <img src={draft.logoUrl} alt="Prévia do símbolo da empresa" />
                </span>
                <div>
                  <strong>Logo ou símbolo</strong>
                  <small>PNG, JPG ou SVG. Recomendado: formato quadrado.</small>
                  <label className="btn secondary">
                    <ImagePlus size={16} />
                    Alterar imagem
                    <input
                      aria-label="Alterar imagem"
                      type="file"
                      accept="image/png,image/jpeg,image/svg+xml"
                      disabled={authenticated}
                      onChange={logo}
                    />
                  </label>
                </div>
              </div>
              <div className="form-grid">
                <label className="field">
                  <span>NOME DA EMPRESA</span>
                  <input
                    aria-label="NOME DA EMPRESA"
                    value={draft.name}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        name: event.target.value,
                      }))
                    }
                  />
                </label>
                <label className="field">
                  <span>TAGLINE</span>
                  <input
                    aria-label="TAGLINE"
                    disabled={authenticated}
                    value={draft.tagline}
                    onChange={(event) =>
                      setDraft((current) => ({
                        ...current,
                        tagline: event.target.value,
                      }))
                    }
                  />
                </label>
              </div>
              <div className="settings-actions">
                <button
                  className="btn primary"
                  disabled={profileSaving}
                  onClick={async () => {
                    setProfileSaving(true);
                    setSaved(false);
                    setProfileError("");
                    try {
                      const persisted = await onSave(draft);
                      if (persisted) setDraft(persisted);
                      setSaved(true);
                      setTimeout(() => setSaved(false), 1800);
                    } catch (error) {
                      setProfileError(
                        error instanceof Error
                          ? error.message
                          : "Não foi possível salvar o perfil.",
                      );
                    } finally {
                      setProfileSaving(false);
                    }
                  }}
                >
                  <Save size={16} />
                  {profileSaving ? "Salvando..." : "Salvar perfil"}
                </button>
                {saved && <span>Alterações salvas</span>}
                {profileError && (
                  <span className="save-feedback error" role="alert">
                    {profileError}
                  </span>
                )}
              </div>
            </section>
          )}
          {activeSection === "pipeline" && (
            <section className="surface panel-body pipeline-settings">
              <div className="settings-section-head">
                <div>
                  <h2>Configurações de pipelines</h2>
                  <p>
                    Crie pipelines e personalize as etapas conforme o processo
                    comercial da empresa.
                  </p>
                </div>
                <button className="btn secondary" onClick={addPipeline}>
                  <Plus size={16} />
                  Nova pipeline
                </button>
              </div>
              <div className="active-pipeline-list">
                {pipelines.map((pipeline) => (
                  <article
                    className={`active-pipeline-card ${editingId === pipeline.id ? "editing" : ""}`}
                    key={pipeline.id}
                  >
                    <div>
                      <span className="pipeline-active-tag">Ativa</span>
                      <strong>{pipeline.name}</strong>
                      <small>
                        {pipeline.stages.length}{" "}
                        {pipeline.stages.length === 1 ? "etapa" : "etapas"} ·{" "}
                        {pipeline.stages.map((stage) => stage.name).join(" → ")}
                      </small>
                    </div>
                    <div className="pipeline-card-actions">
                      <button
                        className="btn secondary"
                        onClick={() =>
                          setEditingId(
                            editingId === pipeline.id ? null : pipeline.id,
                          )
                        }
                      >
                        <Pencil size={15} />
                        {editingId === pipeline.id ? "Fechar edição" : "Editar"}
                      </button>
                      <button
                        className="pipeline-delete-button"
                        aria-label={`Excluir pipeline ${pipeline.name}`}
                        disabled={pipelines.length === 1}
                        onClick={() => {
                          removePipeline(pipeline.id);
                          if (editingId === pipeline.id) setEditingId(null);
                        }}
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                    {editingId === pipeline.id && (
                      <div className="pipeline-inline-editor">
                        <label>
                          <span>NOME DA PIPELINE</span>
                          <input
                            value={pipeline.name}
                            onChange={(event) =>
                              updatePipeline(pipeline.id, event.target.value)
                            }
                          />
                        </label>
                        <div className="pipeline-stage-editor">
                          <strong>ETAPAS DA PIPELINE</strong>
                          {pipeline.stages.map((stage, index) => (
                            <div className="pipeline-stage-row" key={stage.id}>
                              <b>{index + 1}</b>
                              <input
                                aria-label={`Etapa ${index + 1} de ${pipeline.name}`}
                                value={stage.name}
                                onChange={(event) =>
                                  updateStage(
                                    pipeline.id,
                                    stage.id,
                                    event.target.value,
                                  )
                                }
                              />
                              <button
                                aria-label={`Excluir etapa ${stage.name}`}
                                disabled={pipeline.stages.length === 1}
                                onClick={() =>
                                  removeStage(pipeline.id, stage.id)
                                }
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          ))}
                          <button
                            className="add-pipeline-stage"
                            onClick={() => addStage(pipeline.id)}
                          >
                            <Plus size={15} />
                            Adicionar etapa
                          </button>
                        </div>
                      </div>
                    )}
                  </article>
                ))}
              </div>
              <div className="settings-actions">
                <button
                  className="btn primary"
                  disabled={pipelineSaving}
                  onClick={async () => {
                    setPipelineSaving(true);
                    setPipelineSaved(false);
                    setPipelineError("");
                    try {
                      await savePipelines(pipelines);
                      setPipelines(getPipelines());
                      setPipelineSaved(true);
                      setTimeout(() => setPipelineSaved(false), 2500);
                    } catch (error) {
                      setPipelineError(
                        error instanceof Error
                          ? error.message
                          : "Não foi possível salvar as pipelines.",
                      );
                    } finally {
                      setPipelineSaving(false);
                    }
                  }}
                >
                  <Save size={16} />
                  {pipelineSaving ? "Salvando..." : "Salvar pipelines"}
                </button>
                {pipelineSaved && (
                  <span className="save-feedback" role="status">
                    Pipelines salvas com sucesso
                  </span>
                )}
                {pipelineError && (
                  <span className="save-feedback error" role="alert">
                    {pipelineError}
                  </span>
                )}
              </div>
            </section>
          )}
          {activeSection === "deals" && (
            <div className="settings-stack">
              <section className="surface panel-body loss-reasons-settings">
                <div className="settings-section-head">
                  <div>
                    <h2>Motivos de perda</h2>
                    <p>
                      Configure as opções apresentadas ao marcar uma negociação
                      como perdida.
                    </p>
                  </div>
                  <button
                    className="btn secondary"
                    onClick={() =>
                      setLossReasons((current) => [...current, "Novo motivo"])
                    }
                  >
                    <Plus size={16} />
                    Adicionar motivo
                  </button>
                </div>
                <div className="reason-settings-list">
                  {lossReasons.map((reason, index) => (
                    <div className="reason-setting-row" key={index}>
                      <input
                        aria-label={`Motivo de perda ${index + 1}`}
                        value={reason}
                        onChange={(event) =>
                          setLossReasons((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? event.target.value : item,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        aria-label={`Excluir motivo de perda ${reason}`}
                        disabled={lossReasons.length === 1}
                        onClick={() =>
                          setLossReasons((current) =>
                            current.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="settings-actions">
                  <button
                    className="btn primary"
                    onClick={async()=>{setRemoteSettingsError('');try{if(authenticated)setLossReasons(await saveRemoteCommercialSetting('loss_reasons',lossReasons));else{saveLossReasons(lossReasons);setLossReasons(getLossReasons())}setLossReasonsSaved(true);setTimeout(()=>setLossReasonsSaved(false),2500)}catch(error){setRemoteSettingsError(error instanceof Error?error.message:'Não foi possível salvar os motivos.')}}}
                  >
                    <Save size={16} />
                    Salvar motivos de perda
                  </button>
                  {lossReasonsSaved && (
                    <span role="status">Motivos de perda salvos</span>
                  )}
                </div>
              </section>
              <section className="surface panel-body deal-actions-settings">
                <div className="settings-section-head">
                  <div>
                    <h2>Ações da negociação</h2>
                    <p>
                      Somente administradores podem adicionar, editar ou excluir
                      as próximas ações disponíveis.
                    </p>
                  </div>
                  <button
                    className="btn secondary"
                    onClick={() =>
                      setDealActions((current) => [...current, "Nova ação"])
                    }
                  >
                    <Plus size={16} />
                    Adicionar ação
                  </button>
                </div>
                <div className="reason-settings-list">
                  {dealActions.map((action, index) => (
                    <div className="reason-setting-row" key={index}>
                      <input
                        aria-label={`Ação da negociação ${index + 1}`}
                        value={action}
                        onChange={(event) =>
                          setDealActions((current) =>
                            current.map((item, itemIndex) =>
                              itemIndex === index ? event.target.value : item,
                            ),
                          )
                        }
                      />
                      <button
                        type="button"
                        aria-label={`Excluir ação ${action}`}
                        disabled={dealActions.length === 1}
                        onClick={() =>
                          setDealActions((current) =>
                            current.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          )
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="settings-actions">
                  <button
                    className="btn primary"
                    onClick={async()=>{setRemoteSettingsError('');try{if(authenticated)setDealActions(await saveRemoteCommercialSetting('deal_actions',dealActions));else{saveDealActions(dealActions);setDealActions(getDealActions())}setDealActionsSaved(true);setTimeout(()=>setDealActionsSaved(false),2500)}catch(error){setRemoteSettingsError(error instanceof Error?error.message:'Não foi possível salvar as ações.')}}}
                  >
                    <Save size={16} />
                    Salvar ações
                  </button>
                  {dealActionsSaved && (
                    <span role="status">Ações da negociação salvas</span>
                  )}
                </div>
              </section>
            </div>
          )}
          {activeSection === "tags" && (
            <section className="surface panel-body lead-tags-settings">
              <div className="settings-section-head">
                <div>
                  <h2>Tags de lead</h2>
                  <p>
                    Crie a classificação oficial usada nos perfis, filtros,
                    listas e automações.
                  </p>
                </div>
                <button
                  className="btn secondary"
                  onClick={() =>
                    setLeadTags((current) => [
                      ...current,
                      {
                        id: `tag-${Date.now()}`,
                        name: "Nova tag",
                        color: "#6366F1",
                      },
                    ])
                  }
                >
                  <Plus size={16} />
                  Nova tag
                </button>
              </div>
              <div className="lead-tag-list">
                {leadTags.map((tag, index) => (
                  <div className="lead-tag-row" key={tag.id}>
                    <span
                      className="lead-tag-preview"
                      style={{ backgroundColor: tag.color }}
                    ></span>
                    <input
                      className="lead-tag-color"
                      aria-label={`Cor da tag ${tag.name}`}
                      type="color"
                      value={tag.color}
                      onChange={(event) =>
                        updateLeadTag(tag.id, { color: event.target.value })
                      }
                    />
                    <input
                      aria-label={`Nome da tag ${index + 1}`}
                      value={tag.name}
                      onChange={(event) =>
                        updateLeadTag(tag.id, { name: event.target.value })
                      }
                    />
                    <button
                      type="button"
                      aria-label={`Excluir tag ${tag.name}`}
                      disabled={leadTags.length === 1}
                      onClick={() =>
                        setLeadTags((current) =>
                          current.filter((item) => item.id !== tag.id),
                        )
                      }
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                ))}
              </div>
              <div className="settings-note">
                <Tags size={17} />
                <div>
                  <strong>Catálogo único de tags</strong>
                  <span>
                    As tags salvas ficam disponíveis nos filtros da Pipeline,
                    listas de segmentação e automações. Status e origem
                    continuam separados.
                  </span>
                </div>
              </div>
              <div className="settings-actions">
                <button
                  className="btn primary"
                  disabled={leadTagsSaving}
                  onClick={async () => {
                    setLeadTagsError("");
                    setLeadTagsSaving(true);
                    try {
                      await saveLeadTags(leadTags);
                      setLeadTags(getLeadTags());
                      setLeadTagsSaved(true);
                      setTimeout(() => setLeadTagsSaved(false), 2500);
                    } catch (cause) {
                      setLeadTagsError(cause instanceof Error ? cause.message : "Não foi possível salvar as tags.");
                    } finally {
                      setLeadTagsSaving(false);
                    }
                  }}
                >
                  <Save size={16} />
                  {leadTagsSaving ? "Salvando..." : "Salvar tags"}
                </button>
                {leadTagsError && <span role="alert">{leadTagsError}</span>}
                {leadTagsSaved && (
                  <span role="status">Tags salvas com sucesso</span>
                )}
              </div>
            </section>
          )}
          {activeSection === "access" && (
            <section className="surface panel-body access-roles-settings">
              <div className="settings-section-head">
                <div>
                  <h2>Funções e níveis de acesso</h2>
                  <p>
                    O administrador define quais áreas do CRM cada função pode
                    acessar.
                  </p>
                </div>
                <button className="btn secondary" disabled={authenticated} onClick={addAccessRole}>
                  <Plus size={16} />
                  Nova função
                </button>
              </div>
              <div className="access-role-list">
                {accessRoles.map((role) => (
                  <article className="access-role-card" key={role.id}>
                    <header>
                      <input
                        aria-label={`Nome da função ${role.name}`}
                        value={role.name}
                        readOnly={role.protected||authenticated}
                        onChange={(event) =>
                          updateAccessRole(role.id, {
                            name: event.target.value,
                          })
                        }
                      />
                      {role.protected||authenticated ? (
                        <span>{role.protected?'ACESSO TOTAL':'FUNÇÃO PADRÃO'}</span>
                      ) : (
                        <button
                          aria-label={`Excluir função ${role.name}`}
                          onClick={() =>
                            setAccessRoles((current) =>
                              current.filter((item) => item.id !== role.id),
                            )
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </header>
                    <div className="access-permission-grid">
                      {(
                        Object.entries(permissionLabels) as [
                          AccessPermission,
                          string,
                        ][]
                      ).map(([permission, label]) => (
                        <label key={permission}>
                          <input
                            type="checkbox"
                            aria-label={`${role.name}: ${label}`}
                            checked={role.permissions.includes(permission)}
                            disabled={role.protected||(authenticated&&!isRemoteRolePermissionAvailable(role.id,permission))}
                            onChange={() => togglePermission(role, permission)}
                          />
                          <span>{label}</span>
                        </label>
                      ))}
                    </div>
                  </article>
                ))}
              </div>
              <div className="settings-actions">
                <button
                  className="btn primary"
                  onClick={async()=>{setRemoteSettingsError('');try{if(authenticated)setAccessRoles(await saveRemoteAccessRoles(accessRoles) as AccessRole[]);else{saveAccessRoles(accessRoles);setAccessRoles(getAccessRoles())}setAccessRolesSaved(true);setTimeout(()=>setAccessRolesSaved(false),2500)}catch(error){setRemoteSettingsError(error instanceof Error?error.message:'Não foi possível salvar os acessos.')}}}
                >
                  <Save size={16} />
                  Salvar funções e acessos
                </button>
                {accessRolesSaved && (
                  <span role="status">Funções e níveis de acesso salvos</span>
                )}
              </div>
            </section>
          )}
        </main>
      </div>
    </>
  );
}
