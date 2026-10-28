import { useEffect, useRef, useState } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { crmApi, configured, type Session } from "./lib/api";
import { LoginScreen } from "./components/auth/LoginScreen";
import { NewPasswordScreen } from "./components/auth/NewPasswordScreen";
import { AppShell } from "./components/layout/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { ContactsPage } from "./pages/ContactsPage";
import { PipelinePage } from "./pages/PipelinePage";
import { TasksPage } from "./pages/TasksPage";
import { CalendarPage } from "./pages/CalendarPage";
import { CampaignsPage } from "./pages/CampaignsPage";
import { SegmentsPage } from "./pages/SegmentsPage";
import { AutomationsPage } from "./pages/AutomationsPage";
import { ReportsPage } from "./pages/ReportsPage";
import { IntegrationsPage } from "./pages/IntegrationsPage";
import { TeamPage } from "./pages/TeamPage";
import { SettingsPage, type CompanyProfile } from "./pages/SettingsPage";
import { NotificationsPage } from "./pages/NotificationsPage";
import {
  bootstrapRemoteCrm,
  clearRemoteSnapshot,
  getRemoteSnapshot,
  restoreRemoteSnapshot,
  updateRemoteWorkspaceName,
} from "./lib/remoteCrm";
import { canManageSettings, canManageTeam } from "./lib/authorization";
import { startIdleSession } from "./lib/idleLogout";
import { recordSessionAudit } from "./lib/sessionAudit";
import { IdlePresencePrompt } from "./components/common/IdlePresencePrompt";
export function App() {
  const [session, setSession] = useState<Session | null>(
    () => crmApi?.loadSession() ?? null,
  );
  const [recoveryMode, setRecoveryMode] = useState(
    () => new URLSearchParams(location.hash.slice(1)).get("type") === "recovery",
  );
  const previewMode = false;
  const [error, setError] = useState("");
  const [remoteReady, setRemoteReady] = useState(()=>Boolean(session&&restoreRemoteSnapshot(session)));
  const [remoteLoading, setRemoteLoading] = useState(()=>Boolean(session&&!getRemoteSnapshot()));
  const [idlePrompt, setIdlePrompt] = useState(false);
  const idleController = useRef<ReturnType<typeof startIdleSession> | null>(
    null,
  );
  const [company, setCompany] = useState<CompanyProfile>(() => {
    const defaults = {
      name: "Marketing Core",
      tagline: "Estratégia, dados e crescimento",
      logoUrl: "./assets/core-mark.svg",
    };
    if (session) return {...defaults,name:getRemoteSnapshot()?.workspace.name||defaults.name};
    try {
      return JSON.parse(localStorage.getItem("marketing_core_company_profile") || "null") || defaults;
    } catch {
      return defaults;
    }
  });
  const rawRole = String(
    getRemoteSnapshot()?.membership.role ||
      (session?.user as any)?.app_metadata?.role ||
      (session?.user as any)?.role ||
      "",
  ).toLowerCase();
  const canManageTeamRoute = previewMode || canManageTeam(rawRole);
  const canManageSettingsRoute = previewMode || canManageSettings(rawRole);
  const accessRole: "admin" | "employee" =
    canManageTeamRoute && canManageSettingsRoute ? "admin" : "employee";
  const currentUser = previewMode
    ? "Modo de visualização"
    : String((session?.user as any)?.email || "Usuário");
  useEffect(() => {
    if (!recoveryMode) return;
    if (!crmApi) {
      setError("Configuração de staging indisponível.");
      setRecoveryMode(false);
      return;
    }
    const api = crmApi;
    api.captureRecoverySession().then((captured) => {
      if (captured) setSession(api.getSession());
    }).catch((cause) => {
      setError(cause instanceof Error ? cause.message : "Não foi possível validar o link de recuperação.");
      setRecoveryMode(false);
    });
  }, [recoveryMode]);
  useEffect(() => {
    if (!session || recoveryMode) {
      setRemoteReady(false);
      setRemoteLoading(false);
      return;
    }
    let active = true;
    const hadSnapshot=Boolean(getRemoteSnapshot());
    setRemoteLoading(!hadSnapshot);
    bootstrapRemoteCrm(session)
      .then((snapshot) => {
        if (!active) return;
        setCompany((current) => ({
          ...current,
          name: snapshot.workspace.name,
        }));
        setRemoteReady(true);
        setError("");
      })
      .catch((cause) => {
        if (active) {
          if(!hadSnapshot)setRemoteReady(false);
          setError(
            cause instanceof Error
              ? cause.message
              : "Não foi possível carregar o workspace do Supabase.",
          );
        }
      })
      .finally(() => {
        if (active) setRemoteLoading(false);
      });
    return () => {
      active = false;
    };
  }, [session, recoveryMode]);
  useEffect(() => {
    if ((!session && !previewMode) || recoveryMode) return;
    recordSessionAudit(currentUser, "login");
    const controller = startIdleSession({
      onPrompt: () => {
        recordSessionAudit(currentUser, "idle_prompt");
        setIdlePrompt(true);
      },
      onLogout: (reason) => {
        recordSessionAudit(
          currentUser,
          reason === "timeout" ? "logout_timeout" : "logout_declared_offline",
          20,
        );
        setIdlePrompt(false);
        crmApi?.setSession(null);
        clearRemoteSnapshot();
        setSession(null);
        setError(
          reason === "timeout"
            ? "Sessão encerrada após 20 minutos de inatividade."
            : "Sessão encerrada e os 20 minutos anteriores foram registrados como offline.",
        );
      },
    });
    idleController.current = controller;
    return () => {
      controller.stop();
      idleController.current = null;
    };
  }, [session]);
  if (recoveryMode)
    return (
      <NewPasswordScreen
        error={error}
        onSubmit={async (password) => {
          if (!crmApi) throw Error("Staging não configurado");
          await crmApi.updatePassword(password);
          crmApi.setSession(null);
          clearRemoteSnapshot();
          setSession(null);
          setRecoveryMode(false);
          setError("Senha atualizada. Entre com sua nova senha.");
        }}
      />
    );
  if (!session)
    return (
      <LoginScreen
        error={
          error ||
          (!configured() ? "Configuração de staging indisponível." : "")
        }
        onLogin={async (e, p) => {
          if (!crmApi) throw Error("Staging não configurado");
          try {
            setSession(await crmApi.signIn(e, p));
            setError("");
          } catch (x) {
            setError(
              x instanceof Error ? x.message : "Não foi possível entrar.",
            );
          }
        }}
        onRecover={async (email) => {
          if (!email) {
            setError("Informe seu e-mail para recuperar o acesso.");
            return;
          }
          try {
            await crmApi?.recover(email);
            setError(
              "Se o e-mail estiver cadastrado, o link de recuperação será enviado.",
            );
          } catch (x) {
            setError(x instanceof Error ? x.message : "Falha na recuperação.");
          }
        }}
      />
    );
  if (session && !remoteReady)
    return (
      <div className="remote-bootstrap">
        <div className="surface branded-bootstrap">
          {remoteLoading&&<div className="brand-loader" aria-label="Carregando CRM"><span/><span/><span/><img src="./assets/core-mark.svg" alt="Marketing Core"/></div>}
          <strong>
            {remoteLoading
              ? "Preparando seu CRM…"
              : "Não foi possível carregar o workspace"}
          </strong>
          <p>
            {remoteLoading
              ? "Sincronizando os dados do workspace com segurança."
              : error}
          </p>
          {!remoteLoading && (
            <button
              className="btn primary"
              onClick={() => {
                clearRemoteSnapshot();
                crmApi?.setSession(null);
                setSession(null);
                setError("");
              }}
            >
              Voltar ao login
            </button>
          )}
        </div>
      </div>
    );
  return (
    <HashRouter>
      <AppShell
        workspace={company}
        role={accessRole}
        userName={currentUser}
        onLogout={() => {
          recordSessionAudit(currentUser, "logout_manual");
          clearRemoteSnapshot();
          crmApi?.setSession(null);
          setSession(null);
        }}
      >
        <Routes>
          <Route
            path="/dashboard"
            element={<DashboardPage preview={previewMode} />}
          />
          <Route
            path="/contacts"
            element={<ContactsPage preview={previewMode} />}
          />
          <Route
            path="/pipeline"
            element={<PipelinePage preview={previewMode} />}
          />
          <Route path="/tasks" element={<TasksPage preview={previewMode} />} />
          <Route
            path="/calendar"
            element={<CalendarPage preview={previewMode} />}
          />
          <Route path="/campaigns" element={<CampaignsPage />} />
          <Route path="/segments" element={<SegmentsPage />} />
          <Route path="/automations" element={<AutomationsPage />} />
          <Route path="/reports" element={<ReportsPage />} />
          <Route path="/integrations" element={<IntegrationsPage />} />
          <Route path="/notifications" element={<NotificationsPage />} />
          <Route
            path="/team"
            element={
              canManageTeamRoute ? (
                <TeamPage preview={previewMode} />
              ) : (
                <Navigate to="/dashboard" replace />
              )
            }
          />
          <Route
            path="/settings"
            element={
              canManageSettingsRoute ? (
                <SettingsPage
                  authenticated
                  profile={company}
                  onSave={async (next) => {
                    const workspace = await updateRemoteWorkspaceName(
                      next.name,
                    );
                    const persisted = { ...next, name: workspace.name };
                    setCompany(persisted);
                    return persisted;
                  }}
                />
              ) : (
                <Navigate to="/dashboard" replace />
              )
            }
          />
          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </AppShell>
      {idlePrompt && (
        <IdlePresencePrompt
          onYes={() => {
            recordSessionAudit(currentUser, "idle_answer_yes");
            setIdlePrompt(false);
            idleController.current?.confirmPresent();
          }}
          onNo={() => {
            recordSessionAudit(currentUser, "idle_answer_no", 20);
            idleController.current?.declareOffline();
          }}
        />
      )}
    </HashRouter>
  );
}
