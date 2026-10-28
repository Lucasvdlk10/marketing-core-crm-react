import {beforeEach,describe,expect,it,vi} from 'vitest';

const remote=vi.hoisted(()=>({mode:true,mark:vi.fn(),markAll:vi.fn(),snapshot:vi.fn()}));
vi.mock('../lib/remoteCrm',()=>({
  isRemoteMode:()=>remote.mode,
  getRemoteSnapshot:remote.snapshot,
  markRemoteNotificationRead:remote.mark,
  markAllRemoteNotificationsRead:remote.markAll,
}));
import {markAllNotificationsRead,markNotificationRead} from '../lib/notifications';

describe('persistência de notificações',()=>{
  beforeEach(()=>{remote.mark.mockReset();remote.markAll.mockReset();remote.snapshot.mockReturnValue({notifications:[{id:'n1',title:'Um',body:'',created_at:new Date().toISOString(),read_at:null,kind:'task',task_id:null},{id:'n2',title:'Dois',body:'',created_at:new Date().toISOString(),read_at:null,kind:'task',task_id:null}]})});
  it('aguarda a persistência remota antes de devolver o estado lido',async()=>{
    let release!:()=>void;remote.mark.mockReturnValue(new Promise<void>(resolve=>{release=resolve}));
    const pending=markNotificationRead('n1');
    expect(remote.mark).toHaveBeenCalledWith('n1');
    let settled=false;void pending.then(()=>{settled=true});await Promise.resolve();expect(settled).toBe(false);
    release();await expect(pending).resolves.toEqual(expect.arrayContaining([expect.objectContaining({id:'n1',read:true})]));
  });
  it('propaga falha remota e usa o lote de RPCs individuais aguardado',async()=>{
    remote.markAll.mockRejectedValue(new Error('Falha no Supabase'));
    await expect(markAllNotificationsRead()).rejects.toThrow('Falha no Supabase');
    expect(remote.markAll).toHaveBeenCalledWith(['n1','n2']);
  });
});