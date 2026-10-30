export type LossReportDeal={id:string;contact_id:string;name:string;value:string|number;status:string;loss_reason?:string|null;lost_at?:string|null;updated_at?:string|null;created_at?:string|null};
export type LossReportContact={id:string;name:string};
export type LossReportRow={reason:string;count:number;percent:number;leads:Array<{id:string;dealId:string;name:string;dealName:string;value:number}>};
export type CalendarRange={from:string;to:string};

const dateKey=(date:Date)=>`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
const shiftDays=(date:Date,amount:number)=>new Date(date.getFullYear(),date.getMonth(),date.getDate()+amount);

export function getCalendarPeriodRange(preset:string,now=new Date(),customFrom?:string,customTo?:string):CalendarRange|null{
  if(preset==='custom')return customFrom&&customTo&&customFrom<=customTo?{from:customFrom,to:customTo}:null;
  if(preset==='today'||preset==='1')return{from:dateKey(now),to:dateKey(now)};
  if(preset==='yesterday'||preset==='2'){const day=dateKey(shiftDays(now,-1));return{from:day,to:day}}
  if(preset==='month')return{from:dateKey(new Date(now.getFullYear(),now.getMonth(),1)),to:dateKey(now)};
  if(preset==='previous-month')return{from:dateKey(new Date(now.getFullYear(),now.getMonth()-1,1)),to:dateKey(new Date(now.getFullYear(),now.getMonth(),0))};
  const days=Number(preset);
  if(!Number.isInteger(days)||days<1)return null;
  return{from:dateKey(shiftDays(now,1-days)),to:dateKey(now)};
}

const localDateKey=(value:string)=>{
  const date=new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  return dateKey(date);
};

export function buildLossReport(deals:LossReportDeal[],contacts:LossReportContact[],configuredReasons:string[],from:string,to:string){
  const contactById=new Map(contacts.map(contact=>[contact.id,contact]));
  const lost=deals.filter(deal=>{
    if(deal.status!=='lost')return false;
    const timestamp=deal.lost_at||deal.updated_at||deal.created_at;
    if(!timestamp)return false;
    const day=localDateKey(timestamp);
    return Boolean(day&&day>=from&&day<=to);
  });
  const groups=new Map<string,LossReportDeal[]>();
  for(const raw of configuredReasons){const reason=raw.trim();if(reason&&!groups.has(reason))groups.set(reason,[])}
  for(const deal of lost){const reason=deal.loss_reason?.trim()||'Sem motivo informado';groups.set(reason,[...(groups.get(reason)||[]),deal])}
  const totalLeads=new Set(lost.map(deal=>deal.contact_id)).size;
  const rows=[...groups.entries()].map(([reason,items])=>{
    const uniqueLeads=new Set(items.map(item=>item.contact_id));
    const leads=[...items.reduce((byContact,deal)=>{
      const current=byContact.get(deal.contact_id);
      if(current){current.dealIds.push(deal.id);current.dealNames.add(deal.name);current.value+=Number(deal.value)||0}
      else byContact.set(deal.contact_id,{id:deal.contact_id,dealIds:[deal.id],name:contactById.get(deal.contact_id)?.name||deal.name,dealNames:new Set([deal.name]),value:Number(deal.value)||0});
      return byContact;
    },new Map<string,{id:string;dealIds:string[];name:string;dealNames:Set<string>;value:number}>()).values()].map(lead=>({id:lead.id,dealId:lead.dealIds.join(','),name:lead.name,dealName:[...lead.dealNames].join(', '),value:lead.value}));
    return{reason,count:uniqueLeads.size,percent:totalLeads?Math.round(uniqueLeads.size/totalLeads*100):0,leads};
  }).sort((a,b)=>b.count-a.count||a.reason.localeCompare(b.reason,'pt-BR'));
  return{rows,totalLeads,impact:lost.reduce((sum,deal)=>sum+(Number(deal.value)||0),0),lostDeals:lost.length};
}
