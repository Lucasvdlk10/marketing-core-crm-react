import type { ReactNode } from 'react';
export function MetricCard({label,value,footnote,icon}:{label:string;value:string;footnote:string;icon?:ReactNode}){return <article className="metric"><div className="metric-top"><span>{label}</span><div className="metric-icon">{icon}</div></div><strong>{value}</strong><div className="metric-foot">{footnote}</div></article>}
