import { describe, expect, it, vi } from 'vitest';
import { createCrmApi } from '../lib/api';

describe('contratos da API', () => {
  it('usa a URL pública configurada com o caminho do GitHub Pages na recuperação', async()=>{
    const fetcher=vi.fn().mockResolvedValue(new Response('{}',{status:200}));
    const api=createCrmApi({url:'https://staging.example.com',anonKey:'public-key-that-is-long-enough',appUrl:'https://lucasvdlk10.github.io/marketing-core-crm-react/'},fetcher);
    await api.recover('maykelly@example.com');
    const body=JSON.parse(String(fetcher.mock.calls[0][1]?.body));
    expect(body.options.redirect_to).toBe('https://lucasvdlk10.github.io/marketing-core-crm-react/');
  });

  it('captura a sessão de recuperação do hash e limpa apenas os parâmetros sensíveis da URL', async () => {
    history.replaceState(null,'','/?campaign=crm#access_token=access&refresh_token=refresh&expires_in=3600&type=recovery');
    const api=createCrmApi({url:'https://staging.example.com',anonKey:'public-key-that-is-long-enough'},vi.fn());

    await expect(api.captureRecoverySession()).resolves.toBe(true);

    expect(api.getSession()).toMatchObject({access_token:'access',refresh_token:'refresh'});
    expect(location.search).toBe('?campaign=crm');
    expect(location.hash).toBe('');
    expect(sessionStorage.getItem('marketing_core_session_v1')).toContain('access');
  });

  it('ignora hashes comuns do HashRouter ao procurar callback de recuperação', async () => {
    history.replaceState(null,'','/#/dashboard');
    const api=createCrmApi({url:'https://staging.example.com',anonKey:'public-key-that-is-long-enough'},vi.fn());
    await expect(api.captureRecoverySession()).resolves.toBe(false);
    expect(location.hash).toBe('#/dashboard');
  });

  it('atualiza a senha pelo endpoint autenticado do Supabase', async () => {
    const fetcher=vi.fn().mockResolvedValue(new Response(JSON.stringify({id:'user-1'}),{status:200}));
    const api=createCrmApi({url:'https://staging.example.com',anonKey:'public-key-that-is-long-enough'},fetcher);
    api.setSession({access_token:'access',refresh_token:'refresh',expires_at:9999999999});
    await api.updatePassword('nova-senha-segura');
    expect(fetcher).toHaveBeenCalledWith('https://staging.example.com/auth/v1/user',expect.objectContaining({method:'PUT',body:JSON.stringify({password:'nova-senha-segura'})}));
  });

  it('envia login ao endpoint Supabase Auth de staging', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ access_token:'a', refresh_token:'r', expires_in:3600 }), { status:200 }));
    const api = createCrmApi({ url:'https://staging.example.com', anonKey:'public-key-that-is-long-enough' }, fetcher);
    await api.signIn('pessoa@example.com','senha');
    expect(fetcher).toHaveBeenCalledWith('https://staging.example.com/auth/v1/token?grant_type=password', expect.objectContaining({ method:'POST' }));
    expect(sessionStorage.getItem('marketing_core_session_v1')).toContain('refresh_token');
    expect(localStorage.getItem('marketing_core_session_v1')).toBeNull();
  });

  it('mantém workspace_id e ordenação explícita em listagens', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('[]', { status:200 }));
    const api = createCrmApi({ url:'https://staging.example.com', anonKey:'public-key-that-is-long-enough' }, fetcher);
    api.setSession({ access_token:'a', refresh_token:'r', expires_at:9999999999 });
    await api.list('core_contacts','workspace-1');
    expect(String(fetcher.mock.calls[0][0])).toContain('workspace_id=eq.workspace-1');
  });

  it('renova a sessão antes de uma chamada autenticada quando o token expirou', async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({access_token:'novo',refresh_token:'novo-refresh',expires_in:3600}),{status:200}))
      .mockResolvedValueOnce(new Response('[]',{status:200}));
    const api=createCrmApi({url:'https://staging.example.com',anonKey:'public-key-that-is-long-enough'},fetcher);
    api.setSession({access_token:'antigo',refresh_token:'refresh',expires_at:1});
    await api.list('core_contacts','workspace-1');
    expect(String(fetcher.mock.calls[0][0])).toContain('grant_type=refresh_token');
    expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('authorization')).toBe('Bearer novo');
  });

  it('renova uma única vez quando requisições paralelas encontram token expirado', async () => {
    const fetcher=vi.fn(async(url:string)=>String(url).includes('refresh_token')?new Response(JSON.stringify({access_token:'novo',refresh_token:'novo-refresh',expires_in:3600}),{status:200}):new Response('[]',{status:200}));
    const api=createCrmApi({url:'https://staging.example.com',anonKey:'public-key-that-is-long-enough'},fetcher as typeof fetch);
    api.setSession({access_token:'antigo',refresh_token:'refresh',expires_at:1});
    await Promise.all([api.list('core_contacts','workspace-1'),api.list('core_tasks','workspace-1')]);
    expect(fetcher.mock.calls.filter(([url])=>String(url).includes('grant_type=refresh_token'))).toHaveLength(1);
  });

  it('aguarda e repete uma vez quando o Supabase rejeita JWT recém-emitido como futuro', async () => {
    vi.useFakeTimers();
    try {
      const fetcher=vi.fn()
        .mockResolvedValueOnce(new Response(JSON.stringify({message:'JWT issued at future'}),{status:401}))
        .mockResolvedValueOnce(new Response('[]',{status:200}));
      const api=createCrmApi({url:'https://staging.example.com',anonKey:'public-key-that-is-long-enough'},fetcher);
      api.setSession({access_token:'novo',refresh_token:'refresh',expires_at:9999999999});
      const pending=api.list('core_contacts','workspace-1');
      await vi.advanceTimersByTimeAsync(2000);
      await expect(pending).resolves.toEqual([]);
      expect(fetcher).toHaveBeenCalledTimes(2);
      expect(new Headers(fetcher.mock.calls[1][1]?.headers).get('authorization')).toBe('Bearer novo');
    } finally {
      vi.useRealTimers();
    }
  });
});
