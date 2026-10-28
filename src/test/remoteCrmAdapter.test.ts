import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  request: vi.fn(),
  rpc: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../lib/api", () => ({ crmApi: api }));

import {
  bootstrapRemoteCrm,
  updateRemoteWorkspaceName,
} from "../lib/remoteCrm";
import {
  automationGraphFromUi,
  automationGraphToUi,
} from "../lib/automationGraph";

const session = {
  access_token: "token",
  refresh_token: "refresh",
  expires_at: 9999999999,
  user: { id: "user-1" },
};
const workspace = {
  id: "workspace-1",
  name: "Workspace",
  slug: "workspace",
  state: "active",
  logo_path: null,
  created_at: "2026-01-01T00:00:00Z",
};
const membership = {
  workspace_id: "workspace-1",
  user_id: "user-1",
  role: "owner",
  active: true,
  joined_at: "2026-01-01T00:00:00Z",
};

function respond(path: string) {
  if (path.includes("core_memberships")) return [membership];
  if (path.includes("core_workspaces")) return [workspace];
  return [];
}

describe("authenticated remote adapter", () => {
  beforeEach(() => {
    sessionStorage.clear();
    localStorage.clear();
    api.request.mockReset().mockImplementation(respond);
    api.rpc
      .mockReset()
      .mockImplementation((name: string) =>
        name === "core_member_display_names"
          ? []
          : name === "core_automation_list"
            ? []
            : name === "core_dashboard_summary"
              ? {}
              : {},
      );
    api.getSession.mockReturnValue(session);
  });

  it("uses exact bootstrap RPC arguments and does not suppress required RPC errors", async () => {
    await bootstrapRemoteCrm(session);
    expect(api.rpc).toHaveBeenCalledWith("core_member_display_names", {
      w: "workspace-1",
    });
    expect(api.rpc).toHaveBeenCalledWith("core_automation_list", {
      p_workspace: "workspace-1",
    });
    expect(api.rpc).toHaveBeenCalledWith("core_dashboard_summary", {
      p_workspace: "workspace-1",
    });
    api.rpc.mockImplementation((name: string) =>
      name === "core_automation_list"
        ? Promise.reject(new Error("automation denied"))
        : [],
    );
    await expect(bootstrapRemoteCrm(session)).rejects.toThrow(
      "automation denied",
    );
  });

  it("updates the workspace name and confirms it with a separate read-back", async () => {
    await bootstrapRemoteCrm(session);
    api.request.mockImplementation((path: string, options?: RequestInit) => {
      if (path.includes("core_workspaces") && options?.method === "PATCH")
        return [{ ...workspace, name: "Novo nome" }];
      if (path.includes("core_workspaces"))
        return [{ ...workspace, name: "Novo nome" }];
      return respond(path);
    });
    await expect(
      updateRemoteWorkspaceName(" Novo nome "),
    ).resolves.toMatchObject({ name: "Novo nome" });
    expect(api.request).toHaveBeenCalledWith(
      "/rest/v1/core_workspaces?id=eq.workspace-1",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({ name: "Novo nome" }),
      }),
    );
    expect(api.request).toHaveBeenCalledWith(
      expect.stringContaining(
        "core_workspaces?select=id,name,slug,state,logo_path,created_at&id=eq.workspace-1&limit=1",
      ),
    );
  });

  it("publishes the exact graph-v1 contract and hydrates it back to UI nodes", () => {
    const uiNodes = [
      {
        id: "trigger-1",
        kind: "trigger" as const,
        label: "Lead entra no fluxo",
        x: 10,
        y: 20,
        entrySource: {
          type: "manual" as const,
          id: "manual-created",
          label: "Manual",
        },
      },
      {
        id: "task-1",
        kind: "task" as const,
        label: "Criar tarefa",
        x: 30,
        y: 40,
        taskTemplate: { id: "Follow up", title: "Follow up" },
      },
    ];
    const graph = automationGraphFromUi(uiNodes, [
      { from: "trigger-1", to: "task-1" },
    ]);
    expect(graph).toEqual({
      schema_version: "1",
      nodes: [
        {
          id: "trigger-1",
          type: "trigger",
          subtype: "LEAD_CREATED",
          position: { x: 10, y: 20 },
          config: {
            source_type: "manual",
            source_id: "manual-created",
            source_label: "Manual",
          },
        },
        {
          id: "task-1",
          type: "action",
          subtype: "CREATE_TASK",
          position: { x: 30, y: 40 },
          config: { template_id: "Follow up", template_title: "Follow up" },
        },
      ],
      edges: [{ id: "edge-1", source: "trigger-1", target: "task-1" }],
    });
    expect(automationGraphToUi(graph)).toMatchObject({
      connections: [{ from: "trigger-1", to: "task-1" }],
      nodes: [{ kind: "trigger" }, { kind: "task" }],
    });
  });
});
