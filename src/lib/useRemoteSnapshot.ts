import {useSyncExternalStore} from 'react';
import {getRemoteSnapshot,REMOTE_UPDATED_EVENT} from './remoteCrm';

let version=0;
const subscribe=(notify:()=>void)=>{const listener=()=>{version+=1;notify()};window.addEventListener(REMOTE_UPDATED_EVENT,listener);return()=>window.removeEventListener(REMOTE_UPDATED_EVENT,listener)};
const getVersion=()=>version;

export function useRemoteSnapshot(){useSyncExternalStore(subscribe,getVersion,getVersion);return getRemoteSnapshot()}
