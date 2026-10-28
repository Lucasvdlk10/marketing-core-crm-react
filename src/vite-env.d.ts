/// <reference types="vite/client" />
interface CoreConfig { url:string; anonKey:string; leadsHubUrl?:string; leadsHubFormToken?:string }
interface Window { CORE_CONFIG?: CoreConfig }
