import {render,screen,within} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {SegmentsPage} from '../pages/SegmentsPage';

const rpc=vi.fn();
const snapshot={
 segmentLists:[
  {id:'list-linked',name:'Lista vinculada',description:'Descrição antiga',category:'CUSTOM',created_at:'2026-10-28T00:00:00Z'},
  {id:'list-free',name:'Lista livre',description:'Pode excluir',category:'CUSTOM',created_at:'2026-10-28T00:00:00Z'},
 ],
 segmentMembers:[{list_id:'list-linked',contact_id:'lead-1'}],
};
vi.mock('../lib/remoteCrm',()=>({
 getRemoteWorkspaceId:()=> 'workspace-1',
 isRemoteMode:()=>true,
 remoteRpc:(...args:unknown[])=>rpc(...args),
}));
vi.mock('../lib/useRemoteSnapshot',()=>({useRemoteSnapshot:()=>snapshot}));
vi.mock('../lib/leadRecords',()=>({getAllLeadTags:()=>[],getEffectiveLeads:()=>[],getLeadRecord:()=>({tags:[]})}));

describe('SegmentsPage remote management',()=>{
 beforeEach(()=>{rpc.mockReset();rpc.mockImplementation((name:string)=>name==='core_segment_list_automation_links'?Promise.resolve([{list_id:'list-linked',rule_id:'rule-1',rule_name:'Nutrição de leads',enabled:true}]):Promise.resolve(null))});
 it('indicates automation links and blocks deletion until the list is detached',async()=>{
  render(<SegmentsPage/>);
  const card=screen.getByText('Lista vinculada').closest('article')!;
  const indicator=await within(card).findByLabelText('Vinculada à automação Nutrição de leads');
  expect(indicator).toHaveAttribute('title','Esta lista está vinculada ao fluxo “Nutrição de leads”');
  expect(within(card).getByRole('button',{name:'Excluir Lista vinculada'})).toBeDisabled();
 });
 it('edits remotely and deletes an unlinked list through protected RPCs',async()=>{
  const user=userEvent.setup();render(<SegmentsPage/>);
  await screen.findByLabelText('Vinculada à automação Nutrição de leads');
  await user.click(screen.getByRole('button',{name:'Editar Lista livre'}));
  const name=screen.getByLabelText('Nome da lista');await user.clear(name);await user.type(name,'Lista livre atualizada');
  await user.click(screen.getByRole('button',{name:'Salvar alterações'}));
  expect(rpc).toHaveBeenCalledWith('core_segment_list_update_with_members',expect.objectContaining({p_workspace:'workspace-1',p_list_id:'list-free',p_name:'Lista livre atualizada',p_description:'Pode excluir',p_filters:expect.any(Object),p_contact_ids:[]}));
  await user.click(screen.getByRole('button',{name:'Excluir Lista livre atualizada'}));
  await user.click(screen.getByRole('button',{name:'Confirmar exclusão'}));
  expect(rpc).toHaveBeenCalledWith('core_segment_list_delete',{p_workspace:'workspace-1',p_list_id:'list-free'});
 });
});
