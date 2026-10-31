#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import {randomBytes,randomUUID} from 'node:crypto';
import {readFileSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const EXPECTED_REF='nsrwjtgzluadienwtnxt';
export const PREVIOUS_MIGRATION='20261031023137';
export const REQUIRED_MIGRATION='20261031033521';
export const APPROVED_BASELINE_MIGRATIONS=Object.freeze([
  '202610160001',
  '202610180001','202610180002','202610180003','202610180004','202610180005',
  '202610190006','202610190007','202610190008','202610190009','202610190010','202610190011','202610190012','202610190013','202610190014','202610190015','202610190016','202610190017','202610190018','202610190019','202610190020','202610190021','202610190022','202610190023','202610190024','202610190025','202610190026','202610190027',
  '202610270001',
  '202610280001','202610280002','202610280003','202610280004','202610280005','202610280006','202610280007','202610280008','202610280009','202610280010','202610280011','202610280012','202610280013','202610280014','202610280015','202610280016',
  '202610290001','202610290002','202610290003','202610290004','202610290005','202610290006','202610290007',
  '202610300001','202610300002','202610300003','202610300004','202610300005','202610300006','202610300007','202610300008',
  '20261031012321','20261031023137'
]);
const APPROVED_MIGRATIONS=new Set([...APPROVED_BASELINE_MIGRATIONS,REQUIRED_MIGRATION]);
const MIGRATION_LIST_ARGS=['migration','list','--linked','--output-format','json'];

function parseJsonObject(output,label){
  if(typeof output!=='string')throw new Error(`${label} did not return text JSON`);
  const start=output.indexOf('{');
  if(start<0)throw new Error(`${label} returned no JSON object`);
  let depth=0,quoted=false,escaped=false;
  for(let index=start;index<output.length;index++){
    const char=output[index];
    if(quoted){
      if(escaped)escaped=false;
      else if(char==='\\')escaped=true;
      else if(char==='"')quoted=false;
      continue;
    }
    if(char==='"'){quoted=true;continue;}
    if(char==='{')depth++;
    else if(char==='}'&&--depth===0){
      try{return JSON.parse(output.slice(start,index+1));}
      catch(error){throw new Error(`${label} returned invalid JSON: ${error instanceof Error?error.message:String(error)}`);}
    }
  }
  throw new Error(`${label} returned incomplete JSON`);
}

function migrationRows(payload){
  const parsed=typeof payload==='string'?parseJsonObject(payload,'Migration list'):payload;
  if(!Array.isArray(parsed?.migrations))throw new Error('Migration list has no migrations array');
  return parsed.migrations.map(row=>({local:String(row?.local||''),remote:String(row?.remote||'')}));
}

function assertExactVersionSet(actual,expected,label){
  const missing=[...expected].filter(version=>!actual.has(version)).sort();
  const extra=[...actual].filter(version=>!expected.has(version)).sort();
  if(missing.length||extra.length)throw new Error(`${label} migration set mismatch (missing: ${missing.join(',')||'none'}; extra: ${extra.join(',')||'none'})`);
}

export function assertMigrationState(payload,{afterPush=false,resumeAfterContracts=false}={}){
  const rows=migrationRows(payload);
  const localRows=rows.map(row=>row.local).filter(Boolean);
  const remoteRows=rows.map(row=>row.remote).filter(Boolean);
  const local=new Set(localRows);
  const remote=new Set(remoteRows);
  if(local.size!==localRows.length||remote.size!==remoteRows.length)throw new Error('Migration list contains duplicate versions');
  if(!APPROVED_BASELINE_MIGRATIONS.includes(PREVIOUS_MIGRATION))throw new Error(`Pinned baseline omits required base migration ${PREVIOUS_MIGRATION}`);
  for(const version of new Set([...local,...remote])){
    if(!APPROVED_MIGRATIONS.has(version))throw new Error(`Unexpected migration ${version}; not in explicit release allowlist`);
  }
  for(const row of rows){
    if(row.local&&row.remote&&row.local!==row.remote)
      throw new Error(`Migration history diverges: local ${row.local} vs remote ${row.remote}`);
    if(row.remote&&!row.local)
      throw new Error(`Remote-only migration ${row.remote}; reconcile before deployment`);
    if(row.local&&!row.remote&&(!afterPush&&!resumeAfterContracts&&row.local===REQUIRED_MIGRATION))continue;
    if(row.local&&!row.remote)throw new Error(`Unexpected pending migration ${row.local}`);
  }
  const expectedLocal=new Set([...APPROVED_BASELINE_MIGRATIONS,REQUIRED_MIGRATION]);
  assertExactVersionSet(local,expectedLocal,'Local');
  if(afterPush||resumeAfterContracts){
    assertExactVersionSet(remote,expectedLocal,'Remote');
  }else{
    const remoteAtBase=new Set(APPROVED_BASELINE_MIGRATIONS);
    if(!sameVersionSet(remote,remoteAtBase)&&!sameVersionSet(remote,expectedLocal))
      throw new Error(`Remote migration set must equal the pinned baseline, optionally plus ${REQUIRED_MIGRATION}`);
  }
  if(afterPush&&!remote.has(REQUIRED_MIGRATION))
    throw new Error(`Migration ${REQUIRED_MIGRATION} is not applied remotely`);
  return {local,remote};
}

function sameVersionSet(left,right){
  return left.size===right.size&&[...left].every(version=>right.has(version));
}

export function assertFunctionState(payload){
  const parsed=typeof payload==='string'?parseJsonObject(payload,'Function list'):payload;
  if(!Array.isArray(parsed?.functions))throw new Error('Function list has no functions array');
  const fn=parsed.functions.find(item=>item?.slug==='core-webhook-v2');
  if(!fn)throw new Error('core-webhook-v2 is missing after deployment');
  if(fn.status!=='ACTIVE')throw new Error(`core-webhook-v2 is not ACTIVE (status=${String(fn.status)})`);
  if(fn.verify_jwt!==false)throw new Error('core-webhook-v2 must keep verify_jwt=false for its custom authentication');
  if(!Number.isInteger(fn.version)||fn.version<7)throw new Error(`core-webhook-v2 version is not the expected v7+ (version=${String(fn.version)})`);
  return fn;
}

const DATABASE_QUERY_ARGS=['db','query','--linked','--output-format','json'];
const RATE_RESIDUE_FIELDS=[
  'workspace_count','user_count','profile_count','membership_count','webhook_count','rate_count','vault_secret_count',
  'audit_log_count','platform_audit_count','contact_count','ingestion_count','activity_count','deal_count','automation_event_count'
];

function sqlLiteral(value){return `'${String(value).replace(/'/g,"''")}'`;}
function queryRows(output,label){
  const parsed=parseJsonObject(output,label);
  if(!Array.isArray(parsed?.rows))throw new Error(`${label} returned no rows array`);
  return parsed.rows;
}
function rateProbeContext(){
  const actorId=randomUUID().toLowerCase();
  const workspaceId=randomUUID().toLowerCase();
  const webhookId=randomUUID().toLowerCase();
  const compactWorkspace=workspaceId.replaceAll('-','');
  return {
    actorId,workspaceId,webhookId,
    email:`webhook-rate-probe-${actorId.replaceAll('-','')}@example.invalid`,
    workspaceName:`Synthetic webhook rate probe ${workspaceId.slice(0,8)}`,
    workspaceSlug:`rate-probe-${compactWorkspace}`,
    webhookName:`Synthetic rate probe ${webhookId.slice(0,8)}`,
    publicId:randomBytes(16).toString('hex'),
    token:randomBytes(32).toString('hex'),
    secretName:`crm_webhook_${webhookId}`
  };
}
function phaseSql(phase,body){return `-- LEIA_RATE_LIMIT_PHASE: ${phase}\n${body}`;}
function rateSetupSql(probe){
  const actor=sqlLiteral(probe.actorId),workspace=sqlLiteral(probe.workspaceId),webhook=sqlLiteral(probe.webhookId);
  const email=sqlLiteral(probe.email),workspaceName=sqlLiteral(probe.workspaceName),slug=sqlLiteral(probe.workspaceSlug);
  const webhookName=sqlLiteral(probe.webhookName),publicId=sqlLiteral(probe.publicId),secretName=sqlLiteral(probe.secretName);
  const token=sqlLiteral(probe.token);
  return phaseSql('setup',`DO $rate_setup$
DECLARE
  v_token text := ${token};
  v_secret_id uuid;
BEGIN
  IF EXISTS(SELECT 1 FROM auth.users WHERE id=${actor}::uuid OR email=${email})
    OR EXISTS(SELECT 1 FROM public.core_workspaces WHERE id=${workspace}::uuid OR slug=${slug})
    OR EXISTS(SELECT 1 FROM core_private.workspace_webhooks WHERE id=${webhook}::uuid OR public_id=${publicId})
    OR EXISTS(SELECT 1 FROM vault.secrets WHERE name=${secretName}) THEN
    RAISE EXCEPTION 'Synthetic rate probe identifier collision';
  END IF;
  INSERT INTO auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data)
  VALUES('00000000-0000-0000-0000-000000000000'::uuid,${actor}::uuid,'authenticated','authenticated',${email},'',now(),'{}'::jsonb,'{}'::jsonb);
  INSERT INTO public.core_workspaces(id,name,slug,created_by,state)
  VALUES(${workspace}::uuid,${workspaceName},${slug},${actor}::uuid,'active');
  SELECT vault.create_secret(v_token,${secretName},'Synthetic rate-limit probe token') INTO v_secret_id;
  IF v_secret_id IS NULL THEN RAISE EXCEPTION 'Synthetic rate probe secret creation failed'; END IF;
  INSERT INTO core_private.workspace_webhooks(id,public_id,workspace_id,name,token_digest,vault_secret_id,created_by)
  VALUES(${webhook}::uuid,${publicId},${workspace}::uuid,${webhookName},extensions.digest(pg_catalog.convert_to(v_token,'UTF8'),'sha256'),v_secret_id,${actor}::uuid);
END
$rate_setup$;`);
}
function rateAuthorizeSql(probe){
  return phaseSql('authorize',`DO $rate_authorize$
DECLARE
  v_attempt integer;
  v_result jsonb;
BEGIN
  PERFORM set_config('request.jwt.claim.role','service_role',true);
  FOR v_attempt IN 1..60 LOOP
    v_result:=public.core_workspace_webhook_authorize_v2(${sqlLiteral(probe.publicId)},${sqlLiteral(probe.token)});
    IF v_result->>'workspace_id' IS DISTINCT FROM ${sqlLiteral(probe.workspaceId)}
      OR v_result->>'webhook_id' IS DISTINCT FROM ${sqlLiteral(probe.webhookId)}
      OR v_result->>'rate_limited' IS NOT NULL THEN
      RAISE EXCEPTION 'Synthetic authorization % of 60 was denied or returned the wrong identity',v_attempt;
    END IF;
  END LOOP;
  v_result:=public.core_workspace_webhook_authorize_v2(${sqlLiteral(probe.publicId)},${sqlLiteral(probe.token)});
  IF v_result->>'rate_limited' IS DISTINCT FROM 'true'
    OR coalesce((v_result->>'retry_after_seconds')::integer,0)<1 THEN
    RAISE EXCEPTION '61st synthetic authorization did not return structured rate denial';
  END IF;
END
$rate_authorize$;`);
}
function rateVerifySql(probe){
  return phaseSql('verify',`SELECT count(*)::integer AS bucket_count,coalesce(max(hits),0)::integer AS hits
FROM core_private.workspace_webhook_rate WHERE webhook_id=${sqlLiteral(probe.webhookId)}::uuid;`);
}
function rateCleanupSql(probe){
  const actor=sqlLiteral(probe.actorId),workspace=sqlLiteral(probe.workspaceId),webhook=sqlLiteral(probe.webhookId);
  const workspaceName=sqlLiteral(probe.workspaceName),workspaceSlug=sqlLiteral(probe.workspaceSlug);
  const webhookName=sqlLiteral(probe.webhookName),publicId=sqlLiteral(probe.publicId),email=sqlLiteral(probe.email);
  const token=sqlLiteral(probe.token);
  const tokenDigest=`extensions.digest(pg_catalog.convert_to(${token},'UTF8'),'sha256')`;
  const exactWebhook=`id=${webhook}::uuid AND workspace_id=${workspace}::uuid AND public_id=${publicId} AND name=${webhookName} AND created_by=${actor}::uuid AND token_digest=${tokenDigest}`;
  const exactWebhookAliased=`webhook.id=${webhook}::uuid AND webhook.workspace_id=${workspace}::uuid AND webhook.public_id=${publicId} AND webhook.name=${webhookName} AND webhook.created_by=${actor}::uuid AND webhook.token_digest=${tokenDigest}`;
  return phaseSql('cleanup',`DO $rate_cleanup$
DECLARE
  v_secret_id uuid;
  v_owned boolean;
  v_webhook_owned boolean;
BEGIN
  SELECT EXISTS(SELECT 1 FROM public.core_workspaces WHERE id=${workspace}::uuid AND created_by=${actor}::uuid AND slug=${workspaceSlug} AND name=${workspaceName}) INTO v_owned;
  v_webhook_owned := false;
  IF v_owned THEN
    SELECT vault_secret_id INTO v_secret_id FROM core_private.workspace_webhooks WHERE ${exactWebhook} FOR UPDATE;
    v_webhook_owned := FOUND;
  END IF;
  IF v_owned AND v_webhook_owned THEN
    IF v_secret_id IS NULL THEN RAISE EXCEPTION 'Synthetic webhook secret id missing; cleanup failed'; END IF;
    DELETE FROM core_private.workspace_webhook_rate AS rate USING core_private.workspace_webhooks AS webhook
      WHERE rate.webhook_id=webhook.id AND ${exactWebhookAliased};
    DELETE FROM core_private.workspace_webhooks WHERE ${exactWebhook};
    DELETE FROM vault.secrets WHERE id=v_secret_id;
    DELETE FROM public.core_workspaces WHERE id=${workspace}::uuid AND created_by=${actor}::uuid AND slug=${workspaceSlug} AND name=${workspaceName};
    DELETE FROM public.core_user_profiles WHERE user_id=${actor}::uuid;
    DELETE FROM auth.users WHERE id=${actor}::uuid AND email=${email};
  END IF;
END
$rate_cleanup$;`);
}
function rateResidueSql(probe){
  const actor=sqlLiteral(probe.actorId),workspace=sqlLiteral(probe.workspaceId),webhook=sqlLiteral(probe.webhookId);
  const email=sqlLiteral(probe.email),secretName=sqlLiteral(probe.secretName),slug=sqlLiteral(probe.workspaceSlug);
  return phaseSql('residue',`SELECT
  (SELECT count(*)::integer FROM public.core_workspaces WHERE id=${workspace}::uuid AND slug=${slug}) AS workspace_count,
  (SELECT count(*)::integer FROM auth.users WHERE id=${actor}::uuid AND email=${email}) AS user_count,
  (SELECT count(*)::integer FROM public.core_user_profiles WHERE user_id=${actor}::uuid) AS profile_count,
  (SELECT count(*)::integer FROM public.core_memberships WHERE workspace_id=${workspace}::uuid OR user_id=${actor}::uuid) AS membership_count,
  (SELECT count(*)::integer FROM core_private.workspace_webhooks WHERE id=${webhook}::uuid AND workspace_id=${workspace}::uuid) AS webhook_count,
  (SELECT count(*)::integer FROM core_private.workspace_webhook_rate WHERE webhook_id=${webhook}::uuid) AS rate_count,
  (SELECT count(*)::integer FROM vault.secrets WHERE name=${secretName}) AS vault_secret_count,
  (SELECT count(*)::integer FROM public.core_audit_logs WHERE workspace_id=${workspace}::uuid) AS audit_log_count,
  (SELECT count(*)::integer FROM core_private.platform_audit WHERE workspace_id=${workspace}::uuid) AS platform_audit_count,
  (SELECT count(*)::integer FROM public.core_contacts WHERE workspace_id=${workspace}::uuid OR email=${email}) AS contact_count,
  (SELECT count(*)::integer FROM public.core_ingestion_events WHERE workspace_id=${workspace}::uuid) AS ingestion_count,
  (SELECT count(*)::integer FROM public.core_activities WHERE workspace_id=${workspace}::uuid) AS activity_count,
  (SELECT count(*)::integer FROM public.core_deals WHERE workspace_id=${workspace}::uuid) AS deal_count,
  (SELECT count(*)::integer FROM public.core_automation_events WHERE workspace_id=${workspace}::uuid) AS automation_event_count;`);
}
function assertRateResidueCleared(output){
  const rows=queryRows(output,'Rate-probe residue readback');
  if(rows.length!==1)throw new Error('Rate-probe residue readback must return exactly one row');
  const row=rows[0];
  const residuals=RATE_RESIDUE_FIELDS.filter(field=>!Number.isSafeInteger(Number(row?.[field]))||Number(row[field])!==0);
  if(residuals.length)throw new Error(`Synthetic rate probe left residue in: ${residuals.join(', ')}`);
}
function runRateLimitContract(execute,createContext=rateProbeContext){
  let probe;
  let operationError=null;
  let setupAttempted=false;
  try{
    probe=createContext();
    setupAttempted=true;
    try{execute(DATABASE_QUERY_ARGS,rateSetupSql(probe));}
    catch{throw new Error('Synthetic rate probe setup failed; deployment blocked');}
    try{execute(DATABASE_QUERY_ARGS,rateAuthorizeSql(probe));}
    catch{throw new Error('Synthetic 60/61 authorization phase failed; deployment blocked');}
    let readback;
    try{readback=execute(DATABASE_QUERY_ARGS,rateVerifySql(probe));}
    catch{throw new Error('Committed rate-counter readback failed; deployment blocked');}
    const rows=queryRows(readback,'Committed rate-counter readback');
    if(rows.length!==1||Number(rows[0]?.bucket_count)!==1||Number(rows[0]?.hits)!==61)
      throw new Error(`Expected committed rate counter hits=61 in one bucket; got hits=${String(rows[0]?.hits)}, buckets=${String(rows[0]?.bucket_count)}`);
  }catch(error){operationError=error;}
  finally{
    if(setupAttempted){
      let cleanupFailed=false;
      let residueFailed=false;
      try{execute(DATABASE_QUERY_ARGS,rateCleanupSql(probe));}catch{cleanupFailed=true;}
      try{assertRateResidueCleared(execute(DATABASE_QUERY_ARGS,rateResidueSql(probe)));}catch{residueFailed=true;}
      if(cleanupFailed||residueFailed)
        throw new Error(`Synthetic rate-probe cleanup or zero-residue verification failed; deployment blocked (cleanup_failed=${cleanupFailed}, residue_check_failed=${residueFailed})`);
    }
  }
  if(operationError)throw operationError;
  return {successfulAuthorizations:60,deniedAuthorizations:1,committedHits:61,cleanupVerified:true};
}

function executeSupabase(root,args,input){
  const command=process.platform==='win32'?'supabase.exe':'supabase';
  const options={cwd:root,encoding:'utf8',shell:false,windowsHide:true};
  if(typeof input==='string')options.input=input;
  const result=spawnSync(command,args,options);
  const label=args.slice(0,3).join(' ');
  if(result.error)throw new Error(`Could not run Supabase CLI (${label}): ${result.error.message}`);
  if(result.status!==0)throw new Error(`Supabase CLI failed (${label}, exit ${result.status})`);
  return result.stdout||'';
}

export function runRelease({root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),execute:injectedExecute,deploy=true,resumeAfterContracts=false,createRateProbeContext=rateProbeContext}={}){
  const run=injectedExecute||((args,input)=>executeSupabase(root,args,input));
  const projectRefPath=path.join(root,'supabase','.temp','project-ref');
  let linkedRef='';
  try{linkedRef=readFileSync(projectRefPath,'utf8').trim();}
  catch{throw new Error(`Missing linked project ref file: ${projectRefPath}`);}
  if(linkedRef!==EXPECTED_REF)throw new Error(`Refusing deployment: linked Supabase project ref is ${linkedRef||'(empty)'}, expected ${EXPECTED_REF}`);

  const before=run(MIGRATION_LIST_ARGS);
  const initialState=assertMigrationState(before,{afterPush:false,resumeAfterContracts});
  if(!resumeAfterContracts){
    if(initialState.remote.has(REQUIRED_MIGRATION))throw new Error(`Migration ${REQUIRED_MIGRATION} is already applied; use --resume-after-contracts only after exact alignment`);
    run(['db','push','--linked','--yes']);
    const after=run(MIGRATION_LIST_ARGS);
    assertMigrationState(after,{afterPush:true});
  }
  const rateLimitContract=runRateLimitContract(run,createRateProbeContext);
  run(['db','query','--linked','--file','supabase/tests/20261031033521_webhook_rate_limit_match_guard.sql']);
  if(!deploy)return {projectRef:EXPECTED_REF,migration:REQUIRED_MIGRATION,contractsVerified:true,rateLimitContract,deployed:false};

  run(['functions','deploy','core-webhook-v2','--project-ref',EXPECTED_REF,'--no-verify-jwt']);
  const listed=run(['functions','list','--project-ref',EXPECTED_REF,'--output-format','json']);
  const fn=assertFunctionState(listed);
  return {projectRef:EXPECTED_REF,migration:REQUIRED_MIGRATION,functionVersion:fn.version,verifyJwt:fn.verify_jwt,contractsVerified:true,rateLimitContract,deployed:true};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{
    const args=process.argv.slice(2);
    if(args.some(arg=>arg!=='--contracts-only'&&arg!=='--resume-after-contracts'))throw new Error(`Unknown release argument: ${args.find(arg=>arg!=='--contracts-only'&&arg!=='--resume-after-contracts')}`);
    const result=runRelease({deploy:!args.includes('--contracts-only'),resumeAfterContracts:args.includes('--resume-after-contracts')});
    const contract=result.rateLimitContract;
    const contractSummary=`${contract.successfulAuthorizations} accepted + ${contract.deniedAuthorizations} denied, committed_hits=${contract.committedHits}, cleanup=${contract.cleanupVerified?'zero-residue':'failed'}`;
    if(result.deployed){
      process.stdout.write(`Verified core-webhook-v2 release: ${result.projectRef}, migration ${result.migration}, function v${result.functionVersion}, verify_jwt=${result.verifyJwt}; rate-limit ${contractSummary}\n`);
    }else{
      process.stdout.write(`Verified core-webhook-v2 database contracts only: ${result.projectRef}, migration ${result.migration}; rate-limit ${contractSummary}; Edge deployment skipped\n`);
    }
  }catch(error){
    process.stderr.write(`Deployment gate failed: ${error instanceof Error?error.message:String(error)}\n`);
    process.exitCode=1;
  }
}
