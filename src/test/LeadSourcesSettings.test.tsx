import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,expect,it} from 'vitest';
import {SettingsPage} from '../pages/SettingsPage';
import {ContactsPage} from '../pages/ContactsPage';
const profile={name:'Marketing Core',tagline:'Estratégia',logoUrl:'./assets/core-mark.svg'};
beforeEach(()=>localStorage.removeItem('marketing_core_lead_sources'));
it('allows administrators to add, edit and delete lead sources',async()=>{const user=userEvent.setup();render(<SettingsPage profile={profile} onSave={()=>{}}/>);await user.click(screen.getByRole('button',{name:'Leads'}));expect(screen.getByRole('heading',{name:'Origens dos leads'})).toBeInTheDocument();await user.click(screen.getByRole('button',{name:'Adicionar origem'}));const input=screen.getByLabelText('Origem 9');await user.clear(input);await user.type(input,'WhatsApp orgânico');await user.click(screen.getByRole('button',{name:'Salvar origens'}));expect(localStorage.getItem('marketing_core_lead_sources')).toContain('WhatsApp orgânico');await user.click(screen.getByRole('button',{name:'Excluir origem WhatsApp orgânico'}));expect(screen.queryByDisplayValue('WhatsApp orgânico')).not.toBeInTheDocument()});
it('uses customized sources in new lead registration',async()=>{localStorage.setItem('marketing_core_lead_sources',JSON.stringify(['Parceria estratégica','Evento local']));const user=userEvent.setup();render(<ContactsPage/>);await user.click(screen.getByRole('button',{name:/Novo lead/i}));expect(screen.getByRole('option',{name:'Parceria estratégica'})).toBeInTheDocument();expect(screen.queryByRole('option',{name:'Google Ads'})).not.toBeInTheDocument()});
