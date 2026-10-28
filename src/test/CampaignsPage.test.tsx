import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {describe,expect,it} from 'vitest';
import {CampaignsPage} from '../pages/CampaignsPage';

describe('CampaignsPage',()=>{
  it('permite alternar entre os canais de campanha pelo menu superior',async()=>{
    const user=userEvent.setup();
    render(<CampaignsPage/>);
    expect(screen.getByRole('tab',{name:'Visão geral'})).toHaveAttribute('aria-selected','true');
    expect(screen.getByRole('tab',{name:'E-mail marketing'})).toBeInTheDocument();
    expect(screen.getByRole('tab',{name:'Disparo de WhatsApp'})).toBeInTheDocument();
    expect(screen.getByRole('tab',{name:'Facebook Ads'})).toBeInTheDocument();
    expect(screen.getByRole('tab',{name:'Google Ads'})).toBeInTheDocument();
    await user.click(screen.getByRole('tab',{name:'Disparo de WhatsApp'}));
    expect(screen.getByRole('tab',{name:'Disparo de WhatsApp'})).toHaveAttribute('aria-selected','true');
    expect(screen.getByRole('heading',{name:'Campanhas de WhatsApp'})).toBeInTheDocument();
    expect(screen.getByRole('button',{name:/Nova campanha de WhatsApp$/})).toBeEnabled();
  });
});
