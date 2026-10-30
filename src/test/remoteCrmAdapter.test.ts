import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  request: vi.fn(),
  rpc: vi.fn(),
  getSession: vi.fn(),
}));
vi.mock("../lib/api", () => ({ crmApi: api }));

import {
  bootstrapRemoteCrm,
  restoreRemoteSnapshot,
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

  it("loads structured loss reason and loss timestamp with remote deals", async () => {
    await bootstrapRemoteCrm(session);
    expect(api.request).toHaveBeenCalledWith(
      expect.stringContaining("core_deals?select=id,workspace_id,contact_id,pipeline_id,stage_id,name,value,status,loss_reason,lost_at,owner_id,expected_close,notes,created_at,updated_at"),
    );
  });

  it("does not block CRM bootstrap when the member role has no automation permission",async()=>{
    api.request.mockImplementation((path:string)=>path.includes('core_memberships')?[{...membership,role:'closer'}]:respond(path));
    api.rpc.mockImplementation((name:string)=>name==='core_automation_list'?Promise.reject(new Error('Forbidden')):name==='core_dashboard_summary'?{}:[]);
    const snapshot=await bootstrapRemoteCrm(session);
    expect(snapshot.membership.role).toBe('closer');
    expect(snapshot.automations).toEqual([]);
    expect(api.rpc).not.toHaveBeenCalledWith('core_automation_list',expect.anything());
  });

  it("restores the session-scoped snapshot only for the same authenticated user",async()=>{
    await bootstrapRemoteCrm(session);
    expect(sessionStorage.getItem('marketing_core_remote_snapshot_v2')).toContain('workspace-1');
    expect(restoreRemoteSnapshot(session)?.workspace.id).toBe('workspace-1');
    expect(restoreRemoteSnapshot({...session,user:{id:'other-user'}})).toBeNull();
    expect(sessionStorage.getItem('marketing_core_remote_snapshot_v2')).toBeNull();
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
          },
        },
        {
          id: "task-1",
          type: "action",
          subtype: "CREATE_TASK",
          position: { x: 30, y: 40 },
          config: { title: "Follow up" },
        },
      ],
      edges: [{ id: "edge-1", source: "trigger-1", target: "task-1" }],
    });
    expect(automationGraphToUi(graph)).toMatchObject({
      connections: [{ from: "trigger-1", to: "task-1" }],
      nodes: [{ kind: "trigger" }, { kind: "task" }],
    });
  });

  it("round-trips every supported automation action and condition contract", () => {
    const nodes = [
      {id:'trigger',kind:'trigger' as const,label:'Lead entra no fluxo',x:0,y:0},
      {id:'email',kind:'email' as const,label:'Enviar e-mail',x:1,y:1,emailConfig:{subject:'Olá',body:'Bem-vindo'}},
      {id:'whatsapp',kind:'whatsapp' as const,label:'Enviar WhatsApp',x:2,y:2,whatsappConfig:{message:'Oi!'}},
      {id:'wait',kind:'wait' as const,label:'Aguardar',x:3,y:3,waitConfig:{delay:15,unit:'minutes' as const}},
      {id:'stage',kind:'stage' as const,label:'Mover etapa',x:4,y:4,stageConfig:{stageId:'stage-1',stageName:'Qualificação'}},
      {id:'tag',kind:'tag' as const,label:'Adicionar tag',x:5,y:5,tagName:'VIP'},
      {id:'deal',kind:'deal' as const,label:'Criar negociação',x:6,y:6,dealConfig:{assigneeId:'user-1',assigneeLabel:'Pessoa Remota',pipelineId:'pipeline-1',pipelineName:'Pipeline comercial',stageId:'stage-1',stageName:'Qualificação'}},
      {id:'team-deal',kind:'deal' as const,label:'Criar negociação',x:6,y:7,dealConfig:{assigneeId:'team-1',assigneeLabel:'Equipe Vendas',assigneeType:'team' as const,pipelineId:'pipeline-1',pipelineName:'Pipeline comercial',stageId:'stage-1',stageName:'Qualificação',distribution:[{userId:'user-1',label:'Ana',percentage:70},{userId:'user-2',label:'Bia',percentage:30}]}},
      {id:'source-condition',kind:'condition' as const,label:'Condição',x:7,y:7,conditionConfig:{subtype:'SOURCE_EQUALS' as const,value:'Indicação'}},
      {id:'campaign-condition',kind:'condition' as const,label:'Condição',x:8,y:8,conditionConfig:{subtype:'CAMPAIGN_EQUALS' as const,value:'Black Friday'}},
      {id:'stage-condition',kind:'condition' as const,label:'Condição',x:9,y:9,conditionConfig:{subtype:'STAGE_EQUALS' as const,stageId:'stage-2',stageName:'Proposta'}},
    ];
    const graph=automationGraphFromUi(nodes,[]);
    expect(graph.nodes.map(({id,type,subtype,config})=>({id,type,subtype,config}))).toEqual([
      {id:'trigger',type:'trigger',subtype:'LEAD_CREATED',config:{}},
      {id:'email',type:'action',subtype:'SEND_EMAIL',config:{subject:'Olá',body:'Bem-vindo'}},
      {id:'whatsapp',type:'action',subtype:'SEND_WHATSAPP',config:{message:'Oi!'}},
      {id:'wait',type:'action',subtype:'WAIT',config:{delay:15,unit:'minutes'}},
      {id:'stage',type:'action',subtype:'MOVE_STAGE',config:{stage_id:'stage-1'}},
      {id:'tag',type:'action',subtype:'ADD_TAG',config:{tag_name:'VIP'}},
      {id:'deal',type:'action',subtype:'CREATE_DEAL',config:{owner_id:'user-1',pipeline_id:'pipeline-1',stage_id:'stage-1'}},
      {id:'team-deal',type:'action',subtype:'CREATE_DEAL',config:{team_id:'team-1',distribution:[{user_id:'user-1',percentage:70},{user_id:'user-2',percentage:30}],pipeline_id:'pipeline-1',stage_id:'stage-1'}},
      {id:'source-condition',type:'condition',subtype:'SOURCE_EQUALS',config:{value:'Indicação'}},
      {id:'campaign-condition',type:'condition',subtype:'CAMPAIGN_EQUALS',config:{value:'Black Friday'}},
      {id:'stage-condition',type:'condition',subtype:'STAGE_EQUALS',config:{stage_id:'stage-2'}},
    ]);
    expect(automationGraphToUi(graph).nodes).toMatchObject(nodes.map(node=>node.kind==='stage'?{...node,stageConfig:{stageId:node.stageConfig.stageId}}:node.kind==='deal'?{...node,dealConfig:{...node.dealConfig,assigneeLabel:'',distribution:node.dealConfig.distribution?.map(row=>({...row,label:''})),pipelineName:'',stageName:''}}:node.kind==='condition'&&node.conditionConfig.subtype==='STAGE_EQUALS'?{...node,conditionConfig:{subtype:'STAGE_EQUALS',stageId:node.conditionConfig.stageId}}:node));
  });
});
