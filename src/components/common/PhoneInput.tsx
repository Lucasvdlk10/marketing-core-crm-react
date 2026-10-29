import {useEffect,useMemo,useRef,useState,type KeyboardEvent} from 'react';
import {ChevronDown} from 'lucide-react';
import {AsYouType,isValidPhoneNumber,parsePhoneNumberFromString,type CountryCode} from 'libphonenumber-js';

type Country={code:CountryCode;dial:string;name:string;flagLabel:string};
const countries:Country[]=[
 {code:'BR',dial:'+55',name:'Brasil',flagLabel:'Bandeira do Brasil'},
 {code:'US',dial:'+1',name:'Estados Unidos',flagLabel:'Bandeira dos Estados Unidos'},
 {code:'PT',dial:'+351',name:'Portugal',flagLabel:'Bandeira de Portugal'},
 {code:'AR',dial:'+54',name:'Argentina',flagLabel:'Bandeira da Argentina'},
 {code:'MX',dial:'+52',name:'México',flagLabel:'Bandeira do México'},
 {code:'CO',dial:'+57',name:'Colômbia',flagLabel:'Bandeira da Colômbia'},
 {code:'CL',dial:'+56',name:'Chile',flagLabel:'Bandeira do Chile'},
];
const digits=(value:string)=>value.replace(/\D/g,'');
export const phoneIdentity=(value:string)=>{if(value.trim().startsWith('+')){const parsed=parsePhoneNumberFromString(value);if(parsed)return`${parsed.country||'INT'}:${parsed.nationalNumber}`}const raw=digits(value);return raw.length===10||raw.length===11?`BR:${raw}`:raw};
const nationalDigits=(value:string,country:Country)=>{const raw=digits(value);const dial=digits(country.dial);return raw.startsWith(dial)&&raw.length>dial.length?raw.slice(dial.length):raw};
const validationMessage=(country:Country,national:string)=>{
 if(!national)return'';
 if(country.code==='BR'&&national.length>=3&&national[2]!=='9')return'No Brasil, o celular deve começar com 9 depois do DDD.';
 const full=`${country.dial}${national}`;
 if(national.length>=10&&!isValidPhoneNumber(full,country.code))return country.code==='BR'?'Informe um DDD válido e um celular brasileiro com 11 dígitos.':'Informe um telefone válido para o país selecionado.';
 return'';
};
function CountryFlag({country}:{country:Country}){
 const props={role:'img','aria-label':country.flagLabel,viewBox:'0 0 24 16',className:'country-flag'} as const;
 if(country.code==='BR')return <svg {...props}><rect width="24" height="16" fill="#159447"/><path d="M12 2 22 8 12 14 2 8Z" fill="#F7D33D"/><circle cx="12" cy="8" r="3.25" fill="#2755A5"/></svg>;
 if(country.code==='US')return <svg {...props}><rect width="24" height="16" fill="#fff"/>{[0,2,4,6,8,10,12,14].map(y=><rect key={y} y={y} width="24" height="1" fill="#C83A4B"/>)}<rect width="10" height="8" fill="#31559A"/></svg>;
 if(country.code==='PT')return <svg {...props}><rect width="9" height="16" fill="#1C8B4A"/><rect x="9" width="15" height="16" fill="#D63C42"/><circle cx="9" cy="8" r="2.6" fill="none" stroke="#F4C642" strokeWidth="1.2"/></svg>;
 if(country.code==='AR')return <svg {...props}><rect width="24" height="16" fill="#74B9E8"/><rect y="5.33" width="24" height="5.34" fill="#fff"/><circle cx="12" cy="8" r="1.2" fill="#E9B53A"/></svg>;
 if(country.code==='MX')return <svg {...props}><rect width="8" height="16" fill="#198754"/><rect x="8" width="8" height="16" fill="#fff"/><rect x="16" width="8" height="16" fill="#D33F49"/></svg>;
 if(country.code==='CO')return <svg {...props}><rect width="24" height="8" fill="#F5D23B"/><rect y="8" width="24" height="4" fill="#2655A5"/><rect y="12" width="24" height="4" fill="#C83D4B"/></svg>;
 return <svg {...props}><rect width="24" height="8" fill="#fff"/><rect y="8" width="24" height="8" fill="#D63D49"/><rect width="8" height="8" fill="#28559B"/></svg>;
}
export function PhoneInput({value,onChange,required=false,disabled=false,id}:{value:string;onChange:(value:string)=>void;required?:boolean;disabled?:boolean;id?:string}){
 const initial=useMemo(()=>countries.find(item=>value.startsWith(item.dial))||countries[0],[value]);
 const[countryCode,setCountryCode]=useState<CountryCode>(initial.code);const[touched,setTouched]=useState(false);const[overflow,setOverflow]=useState(false);const[open,setOpen]=useState(false);const inputRef=useRef<HTMLInputElement>(null);const pickerRef=useRef<HTMLDivElement>(null);const country=countries.find(item=>item.code===countryCode)||countries[0];const national=nationalDigits(value,country).slice(0,15);const formatted=new AsYouType(country.code).input(national);const validationError=validationMessage(country,national);const error=overflow?'Digite somente 11 dígitos.':validationError;
 useEffect(()=>{inputRef.current?.setCustomValidity(validationError)},[validationError]);
 useEffect(()=>{const close=(event:MouseEvent)=>{if(!pickerRef.current?.contains(event.target as Node))setOpen(false)};document.addEventListener('mousedown',close);return()=>document.removeEventListener('mousedown',close)},[]);
 const changeCountry=(next:CountryCode)=>{const selected=countries.find(item=>item.code===next)||countries[0];setCountryCode(next);setTouched(false);setOverflow(false);setOpen(false);onChange(national?`${selected.dial} ${new AsYouType(selected.code).input(national)}`:'')};
 const changeNumber=(raw:string)=>{const entered=digits(raw);const limit=country.code==='BR'?11:15;const next=entered.slice(0,limit);setOverflow(country.code==='BR'&&entered.length>limit);const display=new AsYouType(country.code).input(next);onChange(next?`${country.dial} ${display}`:'')};
 const handleKeyDown=(event:KeyboardEvent<HTMLInputElement>)=>{if(event.key!=='Backspace'||event.currentTarget.selectionStart!==event.currentTarget.selectionEnd)return;const cursor=event.currentTarget.selectionStart||0;if(cursor>0&&/\D/.test(formatted[cursor-1]||'')){event.preventDefault();changeNumber(national.slice(0,-1))}};
 return <div className="phone-input"><div className="country-picker" ref={pickerRef}><button type="button" className="country-picker-trigger" role="combobox" aria-label="Código do país" aria-expanded={open} aria-controls="country-options" disabled={disabled} onClick={()=>setOpen(current=>!current)}><CountryFlag country={country}/><span>{country.dial} · {country.name}</span><ChevronDown size={15}/></button>{open&&<div className="country-picker-options" id="country-options" role="listbox" aria-label="Países disponíveis">{countries.map(item=><button type="button" role="option" aria-selected={item.code===country.code} key={item.code} onClick={()=>changeCountry(item.code)}><CountryFlag country={item}/><span>{item.dial} · {item.name}</span></button>)}</div>}</div><div className="phone-number-field"><input ref={inputRef} id={id} aria-label="Telefone" aria-invalid={Boolean(error)} required={required} disabled={disabled} inputMode="tel" autoComplete="tel-national" value={formatted} placeholder={country.code==='BR'?'(31) 99999-9999':'Número de telefone'} onBlur={()=>setTouched(true)} onKeyDown={handleKeyDown} onChange={event=>changeNumber(event.target.value)}/>{(touched||national.length>=10)&&error&&<small role="alert">{error}</small>}</div></div>;
}
