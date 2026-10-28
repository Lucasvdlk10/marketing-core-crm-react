import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe,expect,it} from 'vitest';
import {IntegrationsPage} from '../pages/IntegrationsPage';

describe('IntegrationsPage',()=>{
  it('exibe as integrações solicitadas e abre a configuração',async()=>{
    const user=userEvent.setup();
    render(<IntegrationsPage/>);

    for(const name of ['Google Calendário','API','Webhook','Facebook','Google Ads','Plugin WordPress'])expect(screen.getByRole('heading',{name})).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:'Configurar Webhook'}));
    expect(screen.getByRole('heading',{name:'Configurar Webhook'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Voltar para integrações'})).toBeInTheDocument();
    expect(screen.queryByLabelText('URL do Webhook')).not.toBeInTheDocument();
    expect(screen.getByText(/configuração ainda não está disponível/i)).toBeInTheDocument();
    expect(screen.getByRole('button',{name:'Conexão indisponível'})).toBeDisabled();
  });
});
