import {beforeEach,describe,expect,it} from 'vitest';
import {getAllLeadTags} from '../lib/leadRecords';

describe('getAllLeadTags',()=>{
  beforeEach(()=>{
    localStorage.removeItem('marketing_core_custom_leads');
    localStorage.removeItem('marketing_core_deleted_leads');
    localStorage.setItem('marketing_core_lead_records',JSON.stringify({
      'lead-1':{lead:{},tags:['Prioridade alta','Cliente'],notes:[]},
      'lead-2':{lead:{},tags:['Retorno pendente','Google Ads'],notes:[]}
    }));
  });

  it('retorna somente tags reais e exclui status e origens dos leads',()=>{
    expect(getAllLeadTags()).toEqual(['Cliente ativo','Prioridade alta','Retorno pendente','VIP']);
  });
});
