import {expect,it,vi} from 'vitest';

const toFile=vi.hoisted(()=>vi.fn());
const writeXlsxFile=vi.hoisted(()=>vi.fn(()=>({toFile})));
vi.mock('write-excel-file/browser',()=>({default:writeXlsxFile}));

import {exportXlsx} from '../lib/exportReport';

it('exports an import model with headers in the first worksheet row',async()=>{
 await exportXlsx({
  title:'Modelo de importação de leads',
  headers:['Nome','Telefone','Origem'],
  rows:[['Ana Souza','(31) 99999-9999','Indicação']],
 },'modelo-importacao-leads-marketing-core',{includeTitle:false});

 expect(writeXlsxFile).toHaveBeenCalledWith([
  [
   {value:'Nome',fontWeight:'bold',backgroundColor:'#EAF0F8'},
   {value:'Telefone',fontWeight:'bold',backgroundColor:'#EAF0F8'},
   {value:'Origem',fontWeight:'bold',backgroundColor:'#EAF0F8'},
  ],
  [{value:'Ana Souza'},{value:'(31) 99999-9999'},{value:'Indicação'}],
 ]);
 expect(toFile).toHaveBeenCalledWith('modelo-importacao-leads-marketing-core.xlsx');
});
