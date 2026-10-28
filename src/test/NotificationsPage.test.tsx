import {render,screen,waitFor} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {MemoryRouter,useLocation} from 'react-router-dom';
import {beforeEach,describe,expect,it} from 'vitest';
import {NotificationsPage} from '../pages/NotificationsPage';

const LocationProbe=()=>{const location=useLocation();return <span data-testid="location">{location.pathname}{location.search}</span>};
describe('NotificationsPage',()=>{
  beforeEach(()=>localStorage.removeItem('marketing_core_notifications'));
  it('lista todas as notificações e abre a tela relacionada',async()=>{const user=userEvent.setup();render(<MemoryRouter initialEntries={['/notifications']}><NotificationsPage/><LocationProbe/></MemoryRouter>);expect(screen.getByRole('heading',{name:'Central de notificações'})).toBeInTheDocument();expect(screen.getByText('Novo lead recebido')).toBeInTheDocument();expect(screen.getByText('Reunião confirmada')).toBeInTheDocument();await user.click(screen.getByRole('button',{name:/Abrir Tarefa próxima do prazo/}));await waitFor(()=>expect(screen.getByTestId('location')).toHaveTextContent('/tasks?task=task-1'))});
});
