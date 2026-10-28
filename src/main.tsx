import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import './styles.css';

const loadedBundle=document.querySelector<HTMLScriptElement>('script[type="module"]')?.src;
if(loadedBundle)setInterval(async()=>{try{const html=await fetch(`./?version=${Date.now()}`,{cache:'no-store'}).then(response=>response.text());const next=html.match(/<script[^>]+type="module"[^>]+src="([^"]+)"/i)?.[1];if(next&&new URL(next,location.href).href!==loadedBundle)location.reload()}catch{}},2500);

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
