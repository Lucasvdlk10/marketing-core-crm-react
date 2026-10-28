export type DealLossRecord={dealId:string;dealName:string;leadName:string;reason:string;notes?:string;value:number;lostAt:string};
const key='marketing_core_deal_loss_records';
export const getDealLossRecords=():DealLossRecord[]=>{try{const value=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(value)?value:[]}catch{return[]}};
export const saveDealLossRecord=(record:DealLossRecord)=>{localStorage.setItem(key,JSON.stringify([record,...getDealLossRecords().filter(item=>item.dealId!==record.dealId)]));window.dispatchEvent(new Event('marketing-core-deal-loss-records-updated'))};
