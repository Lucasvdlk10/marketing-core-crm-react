const key='marketing_core_deal_actions';
export const defaultDealActions=['Fazer primeiro contato','Agendar reunião','Enviar proposta','Realizar follow-up','Enviar contrato','Aguardar retorno'];
let remoteDealActions:string[]|null=null;
export const setRemoteDealActions=(actions:string[])=>{remoteDealActions=actions;window.dispatchEvent(new Event('marketing-core-deal-actions-updated'))};
export const getDealActions=():string[]=>{if(remoteDealActions)return remoteDealActions;try{const stored=JSON.parse(localStorage.getItem(key)||'null');return Array.isArray(stored)&&stored.length?stored:defaultDealActions}catch{return defaultDealActions}};
export const saveDealActions=(actions:string[])=>{const clean=actions.map(item=>item.trim()).filter(Boolean).filter((item,index,array)=>array.indexOf(item)===index);localStorage.setItem(key,JSON.stringify(clean.length?clean:defaultDealActions));window.dispatchEvent(new Event('marketing-core-deal-actions-updated'))};
export const subscribeDealActions=(listener:()=>void)=>{window.addEventListener('marketing-core-deal-actions-updated',listener);return()=>window.removeEventListener('marketing-core-deal-actions-updated',listener)};
