import {crmApi} from './api';
import {getRemoteWorkspaceId} from './remoteCrm';

export type WebhookSummary={id:string;public_id:string;name:string;url:string;enabled:boolean;created_at:string;last_used_at:string|null};
export type CreatedWebhook=WebhookSummary&{token:string};

type WebhookResponse={webhooks?:WebhookSummary[];webhook?:CreatedWebhook;token?:string;ok?:boolean};

async function call(body:Record<string,unknown>){
 if(!crmApi)throw Error('Conexão segura indisponível.');
 const workspace_id=getRemoteWorkspaceId();
 if(!workspace_id)throw Error('Workspace ativo não encontrado.');
 return await crmApi.invokeFunction('core-integration-keys',{workspace_id,...body}) as WebhookResponse;
}
export async function listWebhooks(){return (await call({action:'list_webhooks'})).webhooks||[];}
export async function createWebhook(name:string){const webhook=(await call({action:'create_webhook',name})).webhook;if(!webhook)throw Error('Webhook não retornado pelo servidor.');return webhook;}
export async function revealWebhook(webhook_id:string){const token=(await call({action:'reveal_webhook',webhook_id})).token;if(!token)throw Error('Token não retornado pelo servidor.');return token;}
export async function renameWebhook(webhook_id:string,name:string){await call({action:'rename_webhook',webhook_id,name});}
export async function setWebhookEnabled(webhook_id:string,enabled:boolean){await call({action:'set_webhook_enabled',webhook_id,enabled});}
export async function deleteWebhook(webhook_id:string){await call({action:'delete_webhook',webhook_id});}
