export const esc=(v:unknown)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
export const brl=(v:unknown)=>new Intl.NumberFormat('pt-BR',{style:'currency',currency:'BRL',maximumFractionDigits:0}).format(Number(v||0));
export const dt=(value:unknown)=>value?new Date(String(value)).toLocaleDateString('pt-BR',{day:'2-digit',month:'short',year:'numeric'}):'—';
export const shortDt=(value:unknown)=>value?new Date(String(value)).toLocaleDateString('pt-BR',{day:'2-digit',month:'short'}):'—';
export const initials=(n:string)=>String(n||'?').split(' ').filter(Boolean).slice(0,2).map(s=>s[0]?.toUpperCase()).join('');
export const dateInput=(date:unknown)=>date?String(date).slice(0,10):'';
export const icon=(name:string,size=19)=>{
 const p:Record<string,string>={
 grid:'<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 users:'<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
 user:'<circle cx="12" cy="8" r="4"/><path d="M4 21a8 8 0 0 1 16 0"/>',
 columns:'<rect width="18" height="18" x="3" y="3" rx="2"/><path d="M9 3v18m6-18v18"/>',
 check:'<path d="m20 6-11 11-5-5"/>',checksquare:'<rect x="3" y="3" width="18" height="18" rx="2"/><path d="m8 12 3 3 5-6"/>',
 calendar:'<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
 chart:'<path d="M3 3v18h18M7 16v-4M12 16V8M17 16V5"/>',
 link:'<path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1l-1.7 1.7M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"/>',
 settings:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .4 1.9l.1.1-2 2-1-.5a2 2 0 0 0-1.9.4l-.5 1.1h-3l-.4-1a2 2 0 0 0-1.9-.5l-1 .5-2-2 .5-1a2 2 0 0 0-.4-1.9L5 14.5v-3l1-.5a2 2 0 0 0 .4-1.9l-.5-1 2-2 1 .5a2 2 0 0 0 1.9-.4l.5-1.1h3l.4 1a2 2 0 0 0 1.9.5l1-.5 2 2-.5 1a2 2 0 0 0 .4 1.9l1.1.5v3z"/>',
 search:'<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',plus:'<path d="M12 5v14M5 12h14"/>',
 chev:'<path d="m7 10 5 5 5-5"/>',right:'<path d="m9 18 6-6-6-6"/>',left:'<path d="m15 18-6-6 6-6"/>',
 close:'<path d="M18 6 6 18M6 6l12 12"/>',logout:'<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4m7 14 5-5-5-5m5 5H9"/>',
 bolt:'<path d="m13 2-3 8H5l8 12 2-8h4L13 2z"/>',megaphone:'<path d="m3 11 18-6v14L3 13v-2ZM7 14l2 7h4l-3-6"/>',
 alert:'<circle cx="12" cy="12" r="10"/><path d="M12 7v5m0 4h.01"/>',download:'<path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4"/>',
 filter:'<path d="M4 5h16l-6 7v7l-4 2v-9L4 5z"/>',mail:'<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>',
 activity:'<path d="M3 12h4l3-8 4 16 3-8h4"/>',clock:'<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 menu:'<path d="M4 6h16M4 12h16M4 18h16"/>',more:'<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
 building:'<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M9 21v-5h6v5M7 8h1m4 0h1m4 0h1M7 12h1m4 0h1m4 0h1"/>',
 inbox:'<path d="M4 4h16l2 10v6H2v-6L4 4ZM2 14h6l2 3h4l2-3h6"/>',
 sparkle:'<path d="m12 2 2.3 7.7L22 12l-7.7 2.3L12 22l-2.3-7.7L2 12l7.7-2.3L12 2Z"/>',
 edit:'<path d="m4 20 4.5-.8 11-11a2.5 2.5 0 0 0-3.5-3.5l-11 11L4 20Z"/>',trash:'<path d="M4 7h16M10 11v7m4-7v7M6 7l1 14h10l1-14M9 7V4h6v3"/>',
 external:'<path d="M13 4h7v7m0-7-9 9M20 14v6H4V4h6"/>',
 info:'<circle cx="12" cy="12" r="10"/><path d="M12 11v6m0-10h.01"/>',
 shield:'<path d="m12 2 8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4Z"/><path d="m8 12 3 3 5-6"/>'};
 return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${p[name]||p.grid}</svg>`;
};
export function pill(text:string,variant='slate'){return `<span class="pill ${variant}">${esc(text)}</span>`}
export function empty(title:string,body:string,symbol='inbox'){return `<div class="empty"><div class="empty-icon">${icon(symbol,27)}</div><h3>${esc(title)}</h3><p>${esc(body)}</p></div>`}
export function formField(name:string,label:string,value:any='',type='text',more=''){return `<label class="field"><span>${esc(label)}</span><input name="${esc(name)}" type="${esc(type)}" value="${esc(value)}" ${more}></label>`}
export function selectField(name:string,label:string,options:[string,string][],value=''){return `<label class="field"><span>${esc(label)}</span><select name="${esc(name)}">${options.map(([val,text])=>`<option value="${esc(val)}" ${val===value?'selected':''}>${esc(text)}</option>`).join('')}</select></label>`}
export const statusMap:Record<string,string>={new:'Novo',contacted:'Contactado',qualified:'Qualificado',customer:'Cliente',lost:'Perdido',open:'Aberto',won:'Ganho',todo:'Pendente',done:'Concluído',planned:'Planejada',active:'Ativa',paused:'Pausada',finished:'Finalizada'};
export function statusPill(status:string){const k:Record<string,string>={new:'cyan',contacted:'violet',qualified:'blue',customer:'green',lost:'red',won:'green',open:'cyan',todo:'amber',done:'green',active:'green',paused:'amber'};return pill(statusMap[status]||status,k[status]||'slate')}
