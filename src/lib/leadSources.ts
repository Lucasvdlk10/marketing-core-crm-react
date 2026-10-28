export const defaultLeadSources=['Indicação','Landing page','Google Ads','Instagram','LinkedIn','Evento','Site institucional','Outro'];
const storageKey='marketing_core_lead_sources';
let remoteSources:string[]|null=null;
const clean=(values:unknown)=>Array.isArray(values)?[...new Set(values.map(String).map(item=>item.trim()).filter(Boolean))]:[];
export const getLeadSources=()=>remoteSources||(()=>{try{const stored=clean(JSON.parse(localStorage.getItem(storageKey)||'[]'));return stored.length?stored:defaultLeadSources}catch{return defaultLeadSources}})();
export const saveLeadSources=(values:string[])=>{const next=clean(values);if(!next.length)throw Error('Mantenha pelo menos uma origem.');localStorage.setItem(storageKey,JSON.stringify(next));window.dispatchEvent(new Event('marketing-core-lead-sources-updated'));return next};
export const setRemoteLeadSources=(values:string[])=>{remoteSources=clean(values);window.dispatchEvent(new Event('marketing-core-lead-sources-updated'))};
