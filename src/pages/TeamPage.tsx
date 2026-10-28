import {Pencil,Plus,Settings2,Trash2,UserMinus,X} from 'lucide-react';
import {useEffect,useState,type FormEvent} from 'react';
import {PageHeader} from '../components/common/PageHeader';
import {DataTable} from '../components/common/DataTable';
import {Modal} from '../components/common/Modal';
import {memberWorkload} from '../data/mockCrmData';
import {getPresenceOptions,savePresenceOptions,type PresenceOption} from '../lib/presence';
import {crmApi} from '../lib/api';
import {getAccessRoles,subscribeAccessRoles} from '../lib/accessRoles';
import {getRemoteSnapshot,getRemoteWorkspaceId} from '../lib/remoteCrm';

type BaseMember=(typeof memberWorkload)[number];
type MemberRow=Omit<BaseMember,'status'>&{status:string;inactiveReason?:string;inactiveUntil?:string};
type RemoteMembership={workspace_id:string;user_id:string;role:string;active:boolean;joined_at:string};
type RemoteInvitation={id:string;workspace_id:string;email:string;role:string;status:'pending';expires_at:string;created_at:string};
type Dialog='invite'|'edit'|'inactivate'|'delete'|'reasons'|null;

const defaultReasons=['Férias','Licença','Afastamento médico','Suspensão','Outro'];
const remoteRoles=[['owner','Proprietário'],['admin','Administrador'],['sdr','SDR'],['closer','Closer'],['viewer','Visualizador']] as const;
const roleLabel=(role:string)=>remoteRoles.find(([value])=>value===role)?.[1]||role;

export function TeamPage({preview=false}:{preview?:boolean}){
  const[members,setMembers]=useState<MemberRow[]>(()=>preview?memberWorkload.map(item=>({...item})):[]);
  const[statusOpen,setStatusOpen]=useState(false);
  const[statuses,setStatuses]=useState<PresenceOption[]>(getPresenceOptions);
  const[accessRoles,setAccessRoles]=useState(getAccessRoles);
  const[dialog,setDialog]=useState<Dialog>(null);
  const[selected,setSelected]=useState<MemberRow|null>(null);
  const[editName,setEditName]=useState('');
  const[editEmail,setEditEmail]=useState('');
  const[editRole,setEditRole]=useState('');
  const[resetNotice,setResetNotice]=useState('');
  const[reasons,setReasons]=useState(defaultReasons);
  const[draftReasons,setDraftReasons]=useState(defaultReasons);
  const[inactiveReason,setInactiveReason]=useState('');
  const[inactiveFrom,setInactiveFrom]=useState(()=>new Date().toISOString().slice(0,10));
  const[inactiveUntil,setInactiveUntil]=useState('');
  const[redistributeTo,setRedistributeTo]=useState('');
  const[inviteName,setInviteName]=useState('');
  const[inviteEmail,setInviteEmail]=useState('');
  const[inviteRole,setInviteRole]=useState(preview?'SDR':'sdr');
  const[invitations,setInvitations]=useState<RemoteInvitation[]>([]);
  const[loading,setLoading]=useState(!preview);
  const[submitting,setSubmitting]=useState(false);
  const[pageError,setPageError]=useState('');
  useEffect(()=>subscribeAccessRoles(()=>setAccessRoles(getAccessRoles())),[]);
  const loadRemote=async()=>{if(preview)return;if(!crmApi)throw Error('Supabase não configurado.');const workspace=getRemoteWorkspaceId();if(!workspace)throw Error('Workspace ativo não encontrado.');const [remoteMembers,pending]=await Promise.all([
    crmApi.request(`/rest/v1/core_memberships?select=workspace_id,user_id,role,active,joined_at&workspace_id=eq.${encodeURIComponent(workspace)}&order=joined_at.asc`) as Promise<RemoteMembership[]>,
    crmApi.request(`/rest/v1/core_invitations?select=id,workspace_id,email,role,status,expires_at,created_at&workspace_id=eq.${encodeURIComponent(workspace)}&status=eq.pending&order=created_at.desc`) as Promise<RemoteInvitation[]>,
  ]);const names=new Map((getRemoteSnapshot()?.members||[]).map(item=>[item.user_id,item.full_name]));setMembers(remoteMembers.map((member,index)=>({id:member.user_id,name:names.get(member.user_id)||'Membro',email:'',role:roleLabel(member.role),status:member.active?'Ativo':'Inativo',color:['#5578E8','#37A67E','#9A6AE8','#D98941'][index%4],tasks:[],activeTasks:0,assignedLeads:0})));setInvitations(pending)};
  useEffect(()=>{if(preview)return;let active=true;setLoading(true);loadRemote().catch(error=>{if(active)setPageError(error instanceof Error?error.message:'Não foi possível carregar a equipe.')}).finally(()=>{if(active)setLoading(false)});return()=>{active=false}},[preview]);

  const updateStatus=(index:number,field:'name'|'color',value:string)=>setStatuses(current=>current.map((item,itemIndex)=>itemIndex===index?{...item,[field]:value}:item));
  const openMemberDialog=(type:Dialog,row:MemberRow)=>{setSelected(row);setDialog(type);setEditName(row.name);setEditEmail(row.email);setEditRole(row.role);setResetNotice('');setInactiveReason('');setInactiveUntil('');setRedistributeTo('')};
  const closeDialog=()=>{setDialog(null);setSelected(null);setResetNotice('')};
  const saveEdit=(event:FormEvent)=>{event.preventDefault();if(!selected)return;setMembers(current=>current.map(member=>member.id===selected.id?{...member,name:editName.trim(),email:editEmail.trim(),role:editRole.trim()}:member));closeDialog()};
  const requestPasswordReset=async()=>{if(!selected)return;try{if(crmApi)await crmApi.recover(selected.email);setResetNotice('E-mail de redefinição solicitado. A pessoa receberá as instruções para criar uma nova senha.')}catch(error){setResetNotice(error instanceof Error?error.message:'Não foi possível solicitar a redefinição.')}};
  const confirmInactivation=(event:FormEvent)=>{event.preventDefault();if(!selected||!inactiveReason||!inactiveUntil||!redistributeTo)return;const leadCount=selected.assignedLeads;setMembers(current=>current.map(member=>member.id===selected.id?{...member,status:'Inativo',inactiveReason,inactiveUntil,assignedLeads:0,activeTasks:0}:member.id===redistributeTo?{...member,assignedLeads:member.assignedLeads+leadCount}:member));closeDialog()};
  const confirmDelete=()=>{if(!selected)return;setMembers(current=>current.filter(member=>member.id!==selected.id));closeDialog()};
  const invite=async(event:FormEvent)=>{event.preventDefault();if(preview){const newMember:MemberRow={id:`member-${Date.now()}`,name:inviteName.trim(),email:inviteEmail.trim(),role:inviteRole,status:'Ativo',color:'#5578E8',tasks:[],activeTasks:0,assignedLeads:0};setMembers(current=>[...current,newMember]);setInviteName('');setInviteEmail('');setInviteRole('SDR');closeDialog();return}if(!crmApi)return;setSubmitting(true);setPageError('');try{await crmApi.invokeFunction('core-invite-member',{workspace_id:getRemoteWorkspaceId(),email:inviteEmail.trim().toLowerCase(),role:inviteRole,action:'invite'});await loadRemote();setInviteName('');setInviteEmail('');setInviteRole('sdr');closeDialog()}catch(error){setPageError(error instanceof Error?error.message:'Não foi possível enviar o convite.')}finally{setSubmitting(false)}};
  const revokeInvitation=async(invitation:RemoteInvitation)=>{if(!crmApi)return;setPageError('');try{await crmApi.invokeFunction('core-invite-member',{action:'revoke_invite',invitation_id:invitation.id});await loadRemote()}catch(error){setPageError(error instanceof Error?error.message:'Não foi possível revogar o convite.')}};
  const resendInvitation=async(invitation:RemoteInvitation)=>{if(!crmApi)return;setPageError('');try{await crmApi.invokeFunction('core-invite-member',{workspace_id:invitation.workspace_id,email:invitation.email,role:invitation.role,action:'invite'});await loadRemote()}catch(error){setPageError(error instanceof Error?error.message:'Não foi possível reenviar o convite.')}};
  const activeMembers=members.filter(member=>member.status==='Ativo').length;

  return <>
    <PageHeader title="Equipe & acessos" subtitle="Membros, papéis e permissões do workspace." actions={<>
      {preview&&<button className="btn secondary" onClick={()=>setStatusOpen(true)}><Settings2 size={16}/>Configurar status</button>}
      {preview&&<button className="btn secondary" onClick={()=>{setDraftReasons(reasons);setDialog('reasons')}}><Settings2 size={16}/>Configurar motivos</button>}
      <button className="btn primary" onClick={()=>setDialog('invite')}>Convidar membro</button>
    </>}/>
    {pageError&&<p className="save-feedback" role="alert">{pageError}</p>}
    {!preview&&loading&&<p role="status">Carregando equipe…</p>}
    {preview&&<div className="team-summary"><div><strong>{members.length} membros</strong><span>{activeMembers} ativos agora</span></div><div><strong>{members.reduce((sum,item)=>sum+item.activeTasks,0)} tarefas</strong><span>Em aberto</span></div><div><strong>{members.reduce((sum,item)=>sum+item.assignedLeads,0)} leads</strong><span>Com responsáveis definidos</span></div></div>}
    <section className="surface"><DataTable<MemberRow> className="team-table" columns={[
      {key:'name',label:'MEMBRO',render:row=><div className="member-cell"><span style={{background:row.color}}>{row.name.split(' ').map(item=>item[0]).join('').slice(0,2)}</span><div><strong>{row.name}</strong><small>{row.email}</small>{row.status==='Inativo'&&<small>Inativo até {row.inactiveUntil?.split('-').reverse().join('/')} · {row.inactiveReason}</small>}</div></div>},
      {key:'role',label:'FUNÇÃO'},
      {key:'assignedLeads',label:'LEADS ATIVOS'},
      {key:'activeTasks',label:'TAREFAS ABERTAS'},
      {key:'status',label:'STATUS',render:row=><span className={`status-tag ${row.status==='Ativo'?'cliente':'ausente'}`}>{row.status}</span>},
      {key:'actions',label:'AÇÕES',render:row=>preview?<div className="member-actions"><button aria-label={`Editar ${row.name}`} title="Editar" onClick={()=>openMemberDialog('edit',row)}><Pencil size={15}/></button><button aria-label={`Inativar ${row.name}`} title="Inativar" disabled={row.status==='Inativo'} onClick={()=>openMemberDialog('inactivate',row)}><UserMinus size={15}/></button><button aria-label={`Excluir ${row.name}`} title="Excluir" onClick={()=>openMemberDialog('delete',row)}><Trash2 size={15}/></button></div>:<span>—</span>}
    ]} rows={members}/></section>
    {!preview&&invitations.length>0&&<section className="surface"><h2>Convites pendentes</h2><DataTable<RemoteInvitation> className="team-table" columns={[
      {key:'email',label:'E-MAIL'},
      {key:'role',label:'FUNÇÃO',render:row=>roleLabel(row.role)},
      {key:'status',label:'STATUS',render:()=> <span className="status-tag ausente">Pendente</span>},
      {key:'expires_at',label:'EXPIRA EM',render:row=>new Date(row.expires_at).toLocaleDateString('pt-BR')},
      {key:'actions',label:'AÇÕES',render:row=><div className="member-actions"><button onClick={()=>resendInvitation(row)}>Reenviar</button><button aria-label={`Revogar convite ${row.email}`} onClick={()=>revokeInvitation(row)}>Revogar</button></div>},
    ]} rows={invitations}/></section>}

    <Modal title="Convidar membro" open={dialog==='invite'} onClose={closeDialog}><form onSubmit={invite}><div className="form-grid">{preview&&<label className="field full"><span>Nome</span><input required value={inviteName} onChange={event=>setInviteName(event.target.value)}/></label>}<label className="field full"><span>E-mail</span><input required type="email" value={inviteEmail} onChange={event=>setInviteEmail(event.target.value)}/></label><label className="field full"><span>Função</span><select aria-label="Função do novo membro" required value={inviteRole} onChange={event=>setInviteRole(event.target.value)}>{preview?accessRoles.map(role=><option key={role.id} value={role.name}>{role.name}</option>):remoteRoles.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label></div><div className="modal-actions"><button type="button" className="btn" onClick={closeDialog}>Cancelar</button><button className="btn primary" disabled={submitting} type="submit">{submitting?'Enviando…':'Enviar convite'}</button></div></form></Modal>

    <Modal title="Editar membro" open={dialog==='edit'} onClose={closeDialog}><form onSubmit={saveEdit}><div className="form-grid"><label className="field full"><span>Nome</span><input value={editName} onChange={event=>setEditName(event.target.value)}/></label><label className="field full"><span>E-mail</span><input type="email" value={editEmail} onChange={event=>setEditEmail(event.target.value)}/></label><label className="field full"><span>Função</span><select aria-label="Função do membro" value={editRole} onChange={event=>setEditRole(event.target.value)}>{accessRoles.map(role=><option key={role.id} value={role.name}>{role.name}</option>)}</select></label></div><div className="password-reset-box"><div><strong>Redefinição de senha</strong><span>Enviaremos um e-mail para que o membro defina uma nova senha.</span></div><button type="button" className="btn" onClick={requestPasswordReset}>Enviar e-mail de redefinição</button></div>{resetNotice&&<p className="save-feedback" role="status">{resetNotice}</p>}<div className="modal-actions"><button type="button" className="btn" onClick={closeDialog}>Cancelar</button><button className="btn primary" type="submit">Salvar alterações</button></div></form></Modal>

    <Modal title="Inativar membro" open={dialog==='inactivate'} onClose={closeDialog}><form onSubmit={confirmInactivation}><p className="inactivation-warning">Durante o período, o usuário será removido das distribuições e automações, não receberá novos leads nem poderá receber tarefas.</p><div className="form-grid"><label className="field full"><span>Motivo da inativação</span><select aria-label="Motivo da inativação" required value={inactiveReason} onChange={event=>setInactiveReason(event.target.value)}><option value="">Selecione</option>{reasons.map(reason=><option key={reason}>{reason}</option>)}</select></label><label className="field"><span>Inativo a partir de</span><input aria-label="Inativo a partir de" type="date" required value={inactiveFrom} onChange={event=>setInactiveFrom(event.target.value)}/></label><label className="field"><span>Inativo até</span><input aria-label="Inativo até" type="date" required min={inactiveFrom} value={inactiveUntil} onChange={event=>setInactiveUntil(event.target.value)}/></label><label className="field full"><span>Redistribuir leads ativos para</span><select aria-label="Redistribuir leads ativos para" required value={redistributeTo} onChange={event=>setRedistributeTo(event.target.value)}><option value="">Selecione um responsável</option>{members.filter(member=>member.id!==selected?.id&&member.status==='Ativo').map(member=><option value={member.id} key={member.id}>{member.name}</option>)}</select></label></div><div className="redistribution-summary"><strong>{selected?.assignedLeads??0} leads ativos serão redistribuídos</strong><span>Somente leads ainda abertos na pipeline. Negócios ganhos ou perdidos permanecem no histórico do responsável original.</span></div><div className="modal-actions"><button type="button" className="btn" onClick={closeDialog}>Cancelar</button><button className="btn danger" type="submit">Confirmar inativação</button></div></form></Modal>

    <Modal title="Excluir membro" open={dialog==='delete'} onClose={closeDialog}><p>Esta ação remove o acesso de <strong>{selected?.name}</strong>. Para férias ou afastamentos temporários, use a inativação.</p><div className="modal-actions"><button className="btn" onClick={closeDialog}>Cancelar</button><button className="btn danger" onClick={confirmDelete}>Excluir usuário</button></div></Modal>

    <Modal title="Configurar motivos de inativação" open={dialog==='reasons'} onClose={closeDialog}><div className="reason-settings-list">{draftReasons.map((reason,index)=><div className="reason-setting-row" key={`${reason}-${index}`}><input aria-label={`Motivo ${index+1}`} value={reason} onChange={event=>setDraftReasons(current=>current.map((item,itemIndex)=>itemIndex===index?event.target.value:item))}/><button aria-label={`Excluir motivo ${reason}`} disabled={draftReasons.length===1} onClick={()=>setDraftReasons(current=>current.filter((_,itemIndex)=>itemIndex!==index))}><Trash2 size={15}/></button></div>)}<button className="add-status" onClick={()=>setDraftReasons(current=>[...current,'Novo motivo'])}><Plus size={16}/>Adicionar motivo</button></div><div className="modal-actions"><button className="btn" onClick={closeDialog}>Cancelar</button><button className="btn primary" onClick={()=>{setReasons(draftReasons.filter(reason=>reason.trim()));closeDialog()}}>Salvar motivos</button></div></Modal>

    {statusOpen&&<div className="modal-backdrop" role="presentation"><section className="status-settings-modal" role="dialog" aria-modal="true" aria-label="Configurar status da equipe"><header><div><h2>Status da equipe</h2><p>Edite o nome e a cor usados para indicar a disponibilidade dos usuários.</p></div><button aria-label="Fechar" onClick={()=>setStatusOpen(false)}><X size={18}/></button></header><div className="status-settings-list">{statuses.map((status,index)=><div className="status-settings-row" key={status.id}><span className="status-color-preview" style={{background:status.color}}/><label><span>NOME DO STATUS</span><input value={status.name} maxLength={24} onChange={event=>updateStatus(index,'name',event.target.value)}/></label><label><span>COR DE INDICAÇÃO</span><div className="color-control"><input type="color" aria-label={`Cor de ${status.name}`} value={status.color} onChange={event=>updateStatus(index,'color',event.target.value.toUpperCase())}/><input value={status.color} maxLength={7} onChange={event=>updateStatus(index,'color',event.target.value)}/></div></label><button className="delete-status" aria-label={`Excluir status ${status.name}`} disabled={statuses.length===1} onClick={()=>setStatuses(current=>current.filter(item=>item.id!==status.id))}><Trash2 size={16}/></button></div>)}<button className="add-status" onClick={()=>setStatuses(current=>[...current,{id:`custom-${Date.now()}`,name:'Novo status',color:'#4F7EF7'}])}><Plus size={16}/>Adicionar status</button></div><footer><button className="btn secondary" onClick={()=>{setStatuses(getPresenceOptions());setStatusOpen(false)}}>Cancelar</button><button className="btn primary" onClick={()=>{savePresenceOptions(statuses);setStatusOpen(false)}}>Salvar status</button></footer></section></div>}
  </>;
}