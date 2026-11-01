import { useEffect, useState } from 'react';
import { fetchBasicContactDetail, fetchContactsPage, type ContactSummary, type Cursor } from '../lib/scalableCrmApi';
import { getRemoteWorkspaceId } from '../lib/remoteCrm';

const labels: Record<string, string> = { new: 'Novo', contacted: 'Contatado', qualified: 'Qualificado', customer: 'Cliente', lost: 'Perdido' };

/** Read-only rollout pilot. The existing ContactsPage remains the default. */
export function ContactsServerPage() {
  const workspace = getRemoteWorkspaceId();
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [pageSize, setPageSize] = useState(50);
  const [cursors, setCursors] = useState<(Cursor | undefined)[]>([undefined]);
  const [page, setPage] = useState(0);
  const [rows, setRows] = useState<ContactSummary[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);

  useEffect(() => { const t = setTimeout(() => setSearch(query.trim()), 250); return () => clearTimeout(t); }, [query]);
  useEffect(() => { setCursors([undefined]); setPage(0); }, [search, status, pageSize, workspace]);
  useEffect(() => {
    if (!workspace) return;
    let active = true;
    setLoading(true); setError('');
    void fetchContactsPage({ workspaceId: workspace, limit: pageSize, cursor: cursors[page], filters: { search, status } })
      .then(result => {
        if (!active) return;
        setRows(result.rows); setHasMore(result.has_more);
        const nextCursor = result.next ?? undefined;
        if (nextCursor) setCursors(previous => { const next = [...previous]; next[page + 1] = nextCursor; return next; });
      })
      .catch(cause => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [workspace, page, cursors[page]?.created_at, cursors[page]?.id, pageSize, search, status]);

  if (!workspace) return <p>Escolha uma empresa para consultar os contatos.</p>;
  return <section className="contacts-server-page" aria-label="Prévia de contatos paginados">
    <header><h1>Contatos — prévia paginada</h1><p>Somente leitura; busca e páginas são consultadas no Supabase. A página original continua ativa em Contatos.</p></header>
    <div className="contacts-toolbar">
      <label>Buscar <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Nome, email, telefone, empresa" /></label>
      <label>Status <select value={status} onChange={e => setStatus(e.target.value)}><option value="">Todos</option>{Object.entries(labels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
      <label>Por página <select value={pageSize} onChange={e => setPageSize(Number(e.target.value))}><option value={20}>20</option><option value={50}>50</option><option value={100}>100</option></select></label>
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div aria-live="polite">{loading ? 'Carregando página…' : `${rows.length} registros nesta página`}</div>
    <div style={{ overflowX: 'auto' }}><table><thead><tr><th>Nome</th><th>Empresa</th><th>Email</th><th>Telefone</th><th>Status</th><th>Data</th></tr></thead>
      <tbody>{rows.map(row => <tr key={row.id}><td><button type="button" onClick={() => { void fetchBasicContactDetail(workspace, row.id).then(setSelected).catch(e => setError(String(e))); }}>{row.name}</button></td>
        <td>{row.company || '—'}</td><td>{row.email || '—'}</td><td>{row.phone || '—'}</td><td>{labels[row.status] || row.status}</td><td>{new Date(row.created_at).toLocaleDateString('pt-BR')}</td></tr>)}</tbody>
    </table></div>
    <nav aria-label="Páginas de contatos"><button type="button" disabled={page === 0 || loading} onClick={() => setPage(p => p - 1)}>Anterior</button><span> Página {page + 1} </span><button type="button" disabled={!hasMore || loading} onClick={() => setPage(p => p + 1)}>Próxima</button></nav>
    {selected && <aside role="dialog" aria-label="Detalhes básicos do contato"><button type="button" onClick={() => setSelected(null)}>Fechar</button><h2>{String(selected.name || 'Contato')}</h2><dl>{['email', 'phone', 'company', 'source', 'status'].map(key => <div key={key}><dt>{key}</dt><dd>{String(selected[key] || '—')}</dd></div>)}</dl><small>Prévia básica; notas, documentos, edição, exclusão e importação não fazem parte deste piloto.</small></aside>}
  </section>;
}
