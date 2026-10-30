import {jsPDF} from 'jspdf';
import writeXlsxFile from 'write-excel-file/browser';

export type ExportValue=string|number;
export type ExportTable={title:string;headers:string[];rows:ExportValue[][]};

const downloadBlob=(blob:Blob,fileName:string)=>{const url=URL.createObjectURL(blob);const link=document.createElement('a');link.href=url;link.download=fileName;link.click();URL.revokeObjectURL(url)};

export function exportCsv(table:ExportTable,fileName:string){
  const lines=[[table.title],[],table.headers,...table.rows].map(row=>row.map(value=>`"${String(value).replaceAll('"','""')}"`).join(';'));
  downloadBlob(new Blob(['\ufeff'+lines.join('\n')],{type:'text/csv;charset=utf-8'}),`${fileName}.csv`);
}

export async function exportXlsx(table:ExportTable,fileName:string,options:{includeTitle?:boolean}={}){
  const body=[
    table.headers.map(value=>({value,fontWeight:'bold' as const,backgroundColor:'#EAF0F8'})),
    ...table.rows.map(row=>row.map(value=>({value}))),
  ];
  const data=options.includeTitle===false?body:[[{value:table.title,fontWeight:'bold' as const}],[],...body];
  await writeXlsxFile(data).toFile(`${fileName}.xlsx`);
}

export function exportPdf(table:ExportTable,fileName:string){
  const pdf=new jsPDF({orientation:'landscape',unit:'pt',format:'a4'});
  pdf.setFontSize(18);pdf.text(table.title,40,42);
  pdf.setFontSize(9);
  const pageWidth=pdf.internal.pageSize.getWidth()-80;
  const columnWidth=pageWidth/Math.max(1,table.headers.length);
  let y=74;
  pdf.setFillColor(234,240,248);pdf.rect(40,y-14,pageWidth,22,'F');
  table.headers.forEach((header,index)=>pdf.text(String(header).slice(0,28),42+index*columnWidth,y));
  y+=25;
  table.rows.forEach(row=>{if(y>pdf.internal.pageSize.getHeight()-35){pdf.addPage();y=40}row.forEach((value,index)=>pdf.text(String(value).slice(0,30),42+index*columnWidth,y));y+=18});
  pdf.save(`${fileName}.pdf`);
}
