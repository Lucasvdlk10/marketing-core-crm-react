import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { MetricCard } from '../components/common/MetricCard';
import { DataTable } from '../components/common/DataTable';
import { Modal } from '../components/common/Modal';

describe('componentes independentes', () => {
  it('renderiza cartão, tabela e modal acessíveis', () => {
    render(<><MetricCard label="Leads" value="10" footnote="No período" /><DataTable columns={[{key:'name',label:'Nome'}]} rows={[{id:'1',name:'Ana'}]} /><Modal title="Novo contato" open onClose={()=>{}}><form>Campos</form></Modal></>);
    expect(screen.getByText('Leads')).toBeInTheDocument();
    expect(screen.getByRole('table')).toHaveClass('data-table');
    expect(screen.getByRole('table').parentElement).toHaveClass('data-table-wrap');
    expect(screen.getByRole('dialog', { name:'Novo contato' })).toBeInTheDocument();
  });
});
