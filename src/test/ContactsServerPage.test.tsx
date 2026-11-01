import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactsServerPage } from '../pages/ContactsServerPage';

const { fetchContactsPage, fetchBasicContactDetail } = vi.hoisted(() => ({ fetchContactsPage: vi.fn(), fetchBasicContactDetail: vi.fn() }));
vi.mock('../lib/scalableCrmApi', () => ({ fetchContactsPage, fetchBasicContactDetail }));
vi.mock('../lib/remoteCrm', () => ({ getRemoteWorkspaceId: () => 'workspace-test' }));

const firstPage = { rows: [{ id: 'c1', name: 'Contato Um', company: 'Empresa Um', email: 'um@example.test', phone: null, status: 'new', created_at: '2026-10-01T12:00:00Z' }], has_more: true, next: { created_at: '2026-10-01T12:00:00Z', id: 'c1' } };

describe('ContactsServerPage', () => {
  beforeEach(() => { vi.clearAllMocks(); fetchContactsPage.mockResolvedValue(firstPage); });

  it('usa busca paginada no servidor e não expõe ações de escrita', async () => {
    const user = userEvent.setup();
    render(<ContactsServerPage />);
    expect(await screen.findByText('Contato Um')).toBeInTheDocument();
    expect(fetchContactsPage).toHaveBeenCalledWith(expect.objectContaining({ workspaceId: 'workspace-test', limit: 50, cursor: undefined, filters: { search: '', status: '' } }));
    expect(screen.queryByRole('button', { name: /novo lead|excluir|importar/i })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Próxima' }));
    await waitFor(() => expect(fetchContactsPage).toHaveBeenCalledTimes(2));
    expect(fetchContactsPage).toHaveBeenLastCalledWith(expect.objectContaining({ cursor: firstPage.next }));
  });

  it('consulta os detalhes básicos somente ao selecionar um contato', async () => {
    const user = userEvent.setup();
    fetchBasicContactDetail.mockResolvedValue({ name: 'Contato Um', email: 'um@example.test', phone: null, company: 'Empresa Um', source: 'Evento', status: 'new' });
    render(<ContactsServerPage />);
    await user.click(await screen.findByRole('button', { name: 'Contato Um' }));
    expect(await screen.findByRole('dialog', { name: 'Detalhes básicos do contato' })).toBeInTheDocument();
    expect(fetchBasicContactDetail).toHaveBeenCalledWith('workspace-test', 'c1');
  });
});
