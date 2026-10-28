import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {beforeEach,describe,expect,it} from 'vitest';
import {mockLeads} from '../data/mockCrmData';
import {SegmentsPage} from '../pages/SegmentsPage';

describe('SegmentsPage',()=>{
  beforeEach(()=>{localStorage.removeItem('marketing_core_segment_lists');localStorage.setItem('marketing_core_lead_records',JSON.stringify({'lead-1':{lead:mockLeads[0],tags:['VIP'],notes:[]}}))});
  it('cria uma lista de segmentação usando filtros combinados',async()=>{
    const user=userEvent.setup();
    render(<SegmentsPage/>);

    expect(screen.getByRole('heading',{name:'Listas de segmentação'})).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:/Nova lista/i}));
    expect(screen.getByRole('dialog',{name:'Criar lista de segmentação'})).toBeInTheDocument();

    await user.type(screen.getByLabelText('Nome da lista'),'Leads para reativação');
    await user.selectOptions(screen.getByLabelText('Filtrar lista por tag'),'VIP');
    await user.selectOptions(screen.getByLabelText('Filtrar lista por origem'),'Indicação');
    expect(screen.getByText('2 ativos')).toBeInTheDocument();
    await user.click(screen.getByRole('button',{name:/Criar lista com \d+ leads/}));

    expect(screen.getByText('Leads para reativação')).toBeInTheDocument();
    expect(screen.getByText(/Tag: VIP/)).toBeInTheDocument();
    expect(screen.getByText(/Origem: Indicação/)).toBeInTheDocument();
    expect(screen.queryByRole('dialog',{name:'Criar lista de segmentação'})).not.toBeInTheDocument();
  });
});
