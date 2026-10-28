import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {LeadImportPage} from '../components/contacts/LeadImportPage';

it('removes an attached lead spreadsheet so another file can be selected',async()=>{
 const user=userEvent.setup();
 render(<LeadImportPage onBack={()=>{}} onImport={vi.fn()}/>);
 const input=screen.getByLabelText('Arquivo de leads') as HTMLInputElement;
 await user.upload(input,new File(['Nome,Telefone,Origem\nLead,(31) 99999-9999,Evento'],'planilha-errada.csv',{type:'text/csv'}));
 expect(await screen.findByText('planilha-errada.csv')).toBeInTheDocument();
 expect(screen.getByRole('heading',{name:'Mapeamento dos campos'})).toBeInTheDocument();
 await user.click(screen.getByRole('button',{name:'Remover arquivo planilha-errada.csv'}));
 expect(screen.queryByText('planilha-errada.csv')).not.toBeInTheDocument();
 expect(screen.queryByRole('heading',{name:'Mapeamento dos campos'})).not.toBeInTheDocument();
 expect(input.value).toBe('');
});
