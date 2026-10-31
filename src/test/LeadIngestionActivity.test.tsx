import {cleanup,render,screen,waitFor} from '@testing-library/react';
import {afterEach,beforeEach,describe,expect,it,vi} from 'vitest';
import {LeadProfileDrawer} from '../components/contacts/LeadProfileDrawer';
import type {MockLead} from '../data/mockCrmData';

const state=vi.hoisted(()=>({events:[] as Array<{id:string;kind:string;body:string;created_at:string}>,load:vi.fn()}));
vi.mock('../lib/leadRecords',()=>({
  deleteLeadRecord:vi.fn(),getAllLeadTags:()=>[],
  getLeadRecord:(lead:MockLead)=>({lead,tags:[],notes:[]}),saveLeadRecord:vi.fn(),
}));
vi.mock('../lib/remoteCrm',()=>({
  isRemoteMode:()=>true,
  listRemoteContactActivities:(id:string)=>state.load(id),
}));
vi.mock('../lib/effectivePermissions',()=>({currentCapability:()=>false}));

const lead:MockLead={id:'contact-synthetic',name:'Lead Sintético',email:'lead@example.test',phone:'31999990000',company:'Empresa Teste',source:'Site',campaign:'chat-captacao',consent:true,consentAt:'2026-10-30T12:00:00Z',status:'Novo',createdAt:'30/10/2026'};

afterEach(()=>cleanup());
beforeEach(()=>{state.events=[];state.load.mockReset().mockImplementation(async()=>state.events)});

describe('remote ingestion activities in lead profile',()=>{
  it('shows every field from each received payload as a separate timeline event',async()=>{
    state.events=[
      {id:'event-1',kind:'ingest',body:JSON.stringify({source:'chat-captacao',submission_id:'submission-1',empresa:'Empresa Teste'}),created_at:'2026-10-30T12:00:00Z'},
      {id:'event-2',kind:'ingest',body:JSON.stringify({submission_id:'submission-1',sintoma:'Campo recebido na etapa seguinte',utm_source:'newsletter'}),created_at:'2026-10-30T12:01:00Z'},
    ];

    render(<LeadProfileDrawer lead={lead} onClose={vi.fn()}/>);

    await waitFor(()=>expect(screen.getAllByText('Recebimento de lead')).toHaveLength(2));
    expect(state.load).toHaveBeenCalledWith('contact-synthetic');
    expect(screen.getByText('sintoma')).toBeInTheDocument();
    expect(screen.getByText('Campo recebido na etapa seguinte')).toBeInTheDocument();
    expect(screen.getByText('utm_source')).toBeInTheDocument();
    expect(screen.getByText('newsletter')).toBeInTheDocument();
    expect(screen.getByText('empresa')).toBeInTheDocument();
    expect(screen.getAllByText('chat-captacao').length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText('Consentimento: Sim')).toBeInTheDocument();
  });
});
