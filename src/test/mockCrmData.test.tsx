import {render,screen} from '@testing-library/react';
import {describe,expect,it} from 'vitest';
import {MemoryRouter} from 'react-router-dom';
import {memberWorkload,mockLeads,mockOpportunities,mockStats,mockTasks,mockTeam,pipelineStages} from '../data/mockCrmData';
import {ContactsPage} from '../pages/ContactsPage';
import {PipelinePage} from '../pages/PipelinePage';

describe('dados fictícios consistentes do CRM',()=>{
 it('mantém os totais usados pelo dashboard, contatos e pipeline',()=>{
  expect(mockLeads).toHaveLength(248);
  expect(mockOpportunities).toHaveLength(64);
  expect(mockStats.won).toBe(31);
  expect(mockStats.revenue).toBe(86400);
  expect(pipelineStages.reduce((total,stage)=>total+stage.items.length,0)).toBe(64);
  expect(mockTeam).toHaveLength(7);
  expect(mockTasks).toHaveLength(21);
  expect(memberWorkload.every(member=>member.tasks.length===3)).toBe(true);
  expect(mockTasks.every(task=>mockLeads.some(lead=>lead.id===task.leadId))).toBe(true);
 });
 it('mostra leads reais de avaliação e oportunidades relacionadas',()=>{
  render(<MemoryRouter><ContactsPage preview/></MemoryRouter>);
  expect(screen.getByText('248 contatos')).toBeInTheDocument();
  expect(screen.getAllByText('Vértice Engenharia').length).toBeGreaterThan(0);
  render(<MemoryRouter><PipelinePage preview/></MemoryRouter>);
  expect(screen.getByText('64 negociações')).toBeInTheDocument();
  expect(screen.getByText(/31 ganhos/)).toBeInTheDocument();
 });
});
