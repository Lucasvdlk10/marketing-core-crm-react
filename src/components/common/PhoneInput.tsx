import {useEffect,useMemo,useRef,useState} from 'react';
import {AsYouType,isValidPhoneNumber,parsePhoneNumberFromString,type CountryCode} from 'libphonenumber-js';

type Country={code:CountryCode;flag:string;dial:string;name:string};
const countries:Country[]=[
 {code:'BR',flag:'🇧🇷',dial:'+55',name:'Brasil'},
 {code:'US',flag:'🇺🇸',dial:'+1',name:'Estados Unidos'},
 {code:'PT',flag:'🇵🇹',dial:'+351',name:'Portugal'},
 {code:'AR',flag:'🇦🇷',dial:'+54',name:'Argentina'},
 {code:'MX',flag:'🇲🇽',dial:'+52',name:'México'},
 {code:'CO',flag:'🇨🇴',dial:'+57',name:'Colômbia'},
 {code:'CL',flag:'🇨🇱',dial:'+56',name:'Chile'},
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
export function PhoneInput({value,onChange,required=false,disabled=false,id}:{value:string;onChange:(value:string)=>void;required?:boolean;disabled?:boolean;id?:string}){
 const initial=useMemo(()=>countries.find(item=>value.startsWith(item.dial))||countries[0],[value]);
 const[countryCode,setCountryCode]=useState<CountryCode>(initial.code);const[touched,setTouched]=useState(false);const[overflow,setOverflow]=useState(false);const inputRef=useRef<HTMLInputElement>(null);const country=countries.find(item=>item.code===countryCode)||countries[0];const national=nationalDigits(value,country).slice(0,15);const formatted=new AsYouType(country.code).input(national);const validationError=validationMessage(country,national);const error=overflow?'Digite somente 11 dígitos.':validationError;
 useEffect(()=>{inputRef.current?.setCustomValidity(validationError)},[validationError]);
 const changeCountry=(next:CountryCode)=>{const selected=countries.find(item=>item.code===next)||countries[0];setCountryCode(next);setTouched(false);setOverflow(false);onChange(national?`${selected.dial} ${new AsYouType(selected.code).input(national)}`:'')};
 const changeNumber=(raw:string)=>{const entered=digits(raw);const limit=country.code==='BR'?11:15;const next=entered.slice(0,limit);setOverflow(country.code==='BR'&&entered.length>limit);const display=new AsYouType(country.code).input(next);onChange(next?`${country.dial} ${display}`:'')};
 return <div className="phone-input"><select aria-label="Código do país" value={country.code} disabled={disabled} onChange={event=>changeCountry(event.target.value as CountryCode)}>{countries.map(item=><option key={item.code} value={item.code}>{item.flag} {item.dial} · {item.name}</option>)}</select><div className="phone-number-field"><input ref={inputRef} id={id} aria-label="Telefone" aria-invalid={Boolean(error)} required={required} disabled={disabled} inputMode="tel" autoComplete="tel-national" value={formatted} placeholder={country.code==='BR'?'(31) 99999-9999':'Número de telefone'} onBlur={()=>setTouched(true)} onChange={event=>changeNumber(event.target.value)}/>{(touched||national.length>=10)&&error&&<small role="alert">{error}</small>}</div></div>;
}
