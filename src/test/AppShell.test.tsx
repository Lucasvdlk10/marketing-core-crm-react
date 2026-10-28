import { render, screen,waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter,useLocation } from 'react-router-dom';
import { beforeEach,describe, expect, it,vi } from 'vitest';
import { AppShell } from '../components/layout/AppShell';

const LocationProbe=()=>{const location=useLocation();return <span data-testid="current-location">{location.pathname}</span>};
const routes = ['dashboard','contacts','pipeline','tasks','calendar','campaigns','segments','automations','reports','integrations','team','settings'];

describe('AppShell', () => {
  beforeEach(()=>localStorage.removeItem('marketing_core_notifications'));
  it('oferece todas as rotas aprovadas na navegação', () => {
    render(<MemoryRouter><AppShell workspace={{name:'Marketing Core',tagline:'Estratégia, dados e crescimento',logoUrl:'./assets/core-mark.svg'}} userName="Lucas"><div>conteúdo</div></AppShell></MemoryRouter>);
    for (const route of routes) expect(screen.getByTestId(`nav-${route}`)).toBeInTheDocument();
  });

  it('oculta equipe e acessos para funcionários',()=>{
    render(<MemoryRouter><AppShell role="employee" workspace={{name:'Marketing Core',tagline:'Estratégia, dados e crescimento',logoUrl:'./assets/core-mark.svg'}} userName="Funcionário"><div>conteúdo</div></AppShell></MemoryRouter>);
    expect(screen.queryByTestId('nav-team')).not.toBeInTheDocument();
  });

  it('oculta módulos que foram retirados das permissões do usuário',()=>{
    render(<MemoryRouter><AppShell role="employee" visibleModules={new Set(['dashboard','contacts','tasks'])} workspace={{name:'Marketing Core',tagline:'Estratégia, dados e crescimento',logoUrl:'./assets/core-mark.svg'}} userName="SDR"><div>conteúdo</div></AppShell></MemoryRouter>);
    expect(screen.getByTestId('nav-dashboard')).toBeInTheDocument();
    expect(screen.getByTestId('nav-contacts')).toBeInTheDocument();
    expect(screen.queryByTestId('nav-automations')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-integrations')).not.toBeInTheDocument();
    expect(screen.queryByTestId('nav-settings')).not.toBeInTheDocument();
  });

  it('abre a janela de notificações abaixo do sino',async()=>{
    const user=userEvent.setup();
    render(<MemoryRouter><AppShell workspace={{name:'Marketing Core',tagline:'Estratégia, dados e crescimento',logoUrl:'./assets/core-mark.svg'}} userName="Lucas"><div>conteúdo</div></AppShell></MemoryRouter>);
    await user.click(screen.getByRole('button',{name:'Notificações'}));
    expect(screen.getByRole('dialog',{name:'Notificações do CRM'})).toBeInTheDocument();
    expect(screen.getByText('Novo lead recebido')).toBeInTheDocument();
    expect(screen.getByText('3 não lidas')).toBeInTheDocument();
  });

  it('leva para a tela relacionada ao clicar em uma notificação',async()=>{const user=userEvent.setup();render(<MemoryRouter initialEntries={['/dashboard']}><AppShell workspace={{name:'Marketing Core',tagline:'Estratégia, dados e crescimento',logoUrl:'./assets/core-mark.svg'}} userName="Lucas"><LocationProbe/></AppShell></MemoryRouter>);await user.click(screen.getByRole('button',{name:'Notificações'}));await user.click(screen.getByRole('button',{name:/Novo lead recebido/}));await waitFor(()=>expect(screen.getByTestId('current-location')).toHaveTextContent('/contacts'))});

  it('abre a central com todas as notificações',async()=>{const user=userEvent.setup();render(<MemoryRouter initialEntries={['/dashboard']}><AppShell workspace={{name:'Marketing Core',tagline:'Estratégia, dados e crescimento',logoUrl:'./assets/core-mark.svg'}} userName="Lucas"><LocationProbe/></AppShell></MemoryRouter>);await user.click(screen.getByRole('button',{name:'Notificações'}));await user.click(screen.getByRole('button',{name:'Ver central de notificações'}));expect(screen.getByTestId('current-location')).toHaveTextContent('/notifications')});

  it('pesquisa leads globalmente por CPF e abre o perfil encontrado',async()=>{
    const user=userEvent.setup();
    render(<MemoryRouter><AppShell workspace={{name:'Marketing Core',tagline:'Estratégia, dados e crescimento',logoUrl:'./assets/core-mark.svg'}} userName="Lucas"><div>conteúdo</div></AppShell></MemoryRouter>);
    const search=screen.getByRole('textbox',{name:'Busca global'});
    await user.type(search,'100.000.000-10');
    expect(screen.getByRole('listbox',{name:'Resultados da busca global'})).toBeInTheDocument();
    await user.click(screen.getByRole('option',{name:'Abrir lead Ana Almeida'}));
    expect(screen.getByRole('dialog',{name:'Detalhes de Ana Almeida'})).toBeInTheDocument();
  });

  it('abre o menu do usuário e encerra a sessão',async()=>{
    const user=userEvent.setup();const logout=vi.fn();
    render(<MemoryRouter><AppShell workspace={{name:'Marketing Core',tagline:'Estratégia, dados e crescimento',logoUrl:'./assets/core-mark.svg'}} userName="Lucas" onLogout={logout}><div>conteúdo</div></AppShell></MemoryRouter>);
    await user.click(screen.getByRole('button',{name:'Menu do usuário'}));
    expect(screen.getByRole('menu',{name:'Opções do usuário'})).toBeInTheDocument();
    expect(screen.getByText('Editar perfil')).toBeInTheDocument();
    await user.click(screen.getByRole('menuitem',{name:/Sair/}));
    expect(logout).toHaveBeenCalledOnce();
  });
});
