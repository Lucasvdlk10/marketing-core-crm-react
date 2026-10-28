import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  Columns3,
  CheckSquare,
  CalendarDays,
  Megaphone,
  ContactRound,
  Zap,
  BarChart3,
  Link,
  UserCog,
  Settings,
} from "lucide-react";
const groups = [
  [
    "PRINCIPAL",
    [
      ["dashboard", "Visão geral", LayoutDashboard],
      ["contacts", "Leads & contatos", Users],
      ["pipeline", "Pipeline comercial", Columns3],
    ],
  ],
  [
    "OPERAÇÃO",
    [
      ["tasks", "Tarefas", CheckSquare],
      ["calendar", "Calendário", CalendarDays],
      ["campaigns", "Campanhas", Megaphone],
    ],
  ],
  [
    "INTELIGÊNCIA",
    [
      ["segments", "Listas de segmentação", ContactRound],
      ["automations", "Automações", Zap],
      ["reports", "Relatórios", BarChart3],
    ],
  ],
  [
    "GESTÃO",
    [
      ["integrations", "Integrações", Link],
      ["team", "Equipe & acessos", UserCog],
      ["settings", "Configurações", Settings],
    ],
  ],
] as const;
export type WorkspaceIdentity = {
  name: string;
  tagline: string;
  logoUrl: string;
};
export function Sidebar({
  workspace,
  role,
}: {
  workspace: WorkspaceIdentity;
  role: "admin" | "employee";
}) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <img src="./assets/core-mark.svg" alt="Marketing Core" />
        <div>
          <b>marketing core</b>
          <small>CRM / SYSTEM</small>
        </div>
      </div>
      <div className="workspace-identity">
        <span className="ws-logo">
          <img src={workspace.logoUrl} alt={`Símbolo de ${workspace.name}`} />
        </span>
        <span className="name">
          <strong>{workspace.name}</strong>
          <small>{workspace.tagline}</small>
        </span>
      </div>
      {groups.map(([group, items]) => {
        const visible = items.filter(
          ([id]) =>
            !(["team", "settings"] as string[]).includes(id) ||
            role === "admin",
        );
        return visible.length ? (
          <div key={group}>
            <div className="sidebar-title">{group}</div>
            <nav className="nav-list">
              {visible.map(([id, label, Icon]) => (
                <NavLink
                  data-testid={`nav-${id}`}
                  key={id}
                  to={`/${id}`}
                  className={({ isActive }) =>
                    `nav-item ${isActive ? "active" : ""}`
                  }
                >
                  <Icon size={18} />
                  {label}
                </NavLink>
              ))}
            </nav>
          </div>
        ) : null;
      })}
    </aside>
  );
}
