export const defaultLossReasons=['Preço/orçamento','Sem prioridade no momento','Escolheu um concorrente','Sem retorno do lead','Não possui perfil adequado','Projeto cancelado'];
const key='marketing_core_loss_reasons';
export function getLossReasons():string[]{try{const saved=JSON.parse(localStorage.getItem(key)||'null');return Array.isArray(saved)&&saved.length?saved:defaultLossReasons}catch{return defaultLossReasons}}
export function saveLossReasons(reasons:string[]){const valid=reasons.map(reason=>reason.trim()).filter(Boolean);localStorage.setItem(key,JSON.stringify(valid.length?valid:defaultLossReasons));window.dispatchEvent(new CustomEvent('marketing-core-loss-reasons-updated'))}
