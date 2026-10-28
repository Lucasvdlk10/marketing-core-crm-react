import type { ReactNode } from 'react';
export function PageHeader({title,subtitle,actions}:{title:string;subtitle:string;actions?:ReactNode}){return <div className="page-intro"><div><div className="eyebrow">MARKETING CORE CRM</div><h1>{title}</h1><p>{subtitle}</p></div>{actions&&<div className="header-actions">{actions}</div>}</div>}
export function EmptyState({title,body}:{title:string;body:string}){return <div className="surface empty"><h3>{title}</h3><p>{body}</p></div>}
