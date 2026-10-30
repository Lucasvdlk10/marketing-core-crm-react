import {render,screen} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {expect,it,vi} from 'vitest';
import {LeadImportPage} from '../components/contacts/LeadImportPage';

const readXlsxFile=vi.hoisted(()=>vi.fn());
vi.mock('read-excel-file/browser',()=>({default:readXlsxFile}));
const remote=vi.hoisted(()=>({snapshot:null as any}));
vi.mock('../lib/remoteCrm',()=>({getRemoteSnapshot:()=>remote.snapshot,isRemoteMode:()=>true}));

it('shows the persistent import history below the model download',()=>{
 remote.snapshot={importHistory:[{id:'import-1',file_name:'teste1.csv',source_type:'CSV',total_rows:200,imported_rows:200,failed_rows:0,status:'COMPLETED',created_at:'2026-10-30T10:01:00Z'}]};
 render(<LeadImportPage onBack={()=>{}} onImport={vi.fn()}/>);
 expect(screen.getByRole('heading',{name:'Histórico de importações'})).toBeInTheDocument();
 expect(screen.getByText('teste1.csv')).toBeInTheDocument();
 expect(screen.getByText('200 de 200')).toBeInTheDocument();
 expect(screen.getByText('Concluída')).toBeInTheDocument();
});

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

it('reads the worksheet data returned by the XLSX parser',async()=>{
 const user=userEvent.setup();
 readXlsxFile.mockResolvedValueOnce([{sheet:'Sheet1',data:[['Nome','Telefone','Origem'],['Lead XLSX','(31) 99999-9999','Evento']]}]);
 render(<LeadImportPage onBack={()=>{}} onImport={vi.fn()}/>);
 await user.upload(screen.getByLabelText('Arquivo de leads'),new File(['xlsx'],'modelo.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 expect(await screen.findByRole('heading',{name:'Mapeamento dos campos'})).toBeInTheDocument();
 expect(screen.getByText('1 linhas · 3 campos mapeados')).toBeInTheDocument();
 expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

it('accepts the downloaded XLSX model with title and blank rows before the header',async()=>{
 const user=userEvent.setup();
 readXlsxFile.mockResolvedValueOnce([
  ['Modelo de importação de leads'],
  [],
  ['Nome','Telefone','E-mail','Empresa','Origem','CPF','CNPJ','Status'],
  ['Ana Souza','(31) 99999-9999','ana@empresa.com.br','Empresa Exemplo','Indicação','','','Novo'],
 ]);
 render(<LeadImportPage onBack={()=>{}} onImport={vi.fn()}/>);
 await user.upload(screen.getByLabelText('Arquivo de leads'),new File(['xlsx'],'modelo-importacao-leads-marketing-core.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}));
 expect(await screen.findByRole('heading',{name:'Mapeamento dos campos'})).toBeInTheDocument();
 expect(screen.getByText('1 linhas · 8 campos mapeados')).toBeInTheDocument();
 expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
