import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {runRelease,EXPECTED_REF,APPROVED_BASELINE_MIGRATIONS} from './deploy-core-webhook-v2.mjs';

const BASELINE_MIGRATIONS=[
  '202610160001',
  '202610180001','202610180002','202610180003','202610180004','202610180005',
  '202610190006','202610190007','202610190008','202610190009','202610190010','202610190011','202610190012','202610190013','202610190014','202610190015','202610190016','202610190017','202610190018','202610190019','202610190020','202610190021','202610190022','202610190023','202610190024','202610190025','202610190026','202610190027',
  '202610270001',
  '202610280001','202610280002','202610280003','202610280004','202610280005','202610280006','202610280007','202610280008','202610280009','202610280010','202610280011','202610280012','202610280013','202610280014','202610280015','202610280016',
  '202610290001','202610290002','202610290003','202610290004','202610290005','202610290006','202610290007',
  '202610300001','202610300002','202610300003','202610300004','202610300005','202610300006','202610300007','202610300008',
  '20261031012321','20261031023137'
];
assert.equal(BASELINE_MIGRATIONS.length,62,'Pin the exact linked project migration baseline');
assert.deepEqual(APPROVED_BASELINE_MIGRATIONS,BASELINE_MIGRATIONS,'Release allowlist must match the reviewed remote baseline');

function fixtureRoot(projectRef=EXPECTED_REF){
  const root=mkdtempSync(path.join(process.env.TMPDIR||os.tmpdir(),'webhook-release-gate-'));
  mkdirSync(path.join(root,'supabase','.temp'),{recursive:true});
  writeFileSync(path.join(root,'supabase','.temp','project-ref'),projectRef);
  return root;
}
function migrationState({pending33521=true,extraPending=false,extraAligned=false}={}){
  return {migrations:[
    ...BASELINE_MIGRATIONS.map(version=>({local:version,remote:version})),
    {local:'20261031033521',remote:pending33521?'':'20261031033521'},
    ...(extraPending?[{local:'20261031040000',remote:''}]:[]),
    ...(extraAligned?[{local:'20261031099999',remote:'20261031099999'}]:[])
  ]};
}
const migrationArgs=['migration','list','--linked','--output-format','json'];
const functionState={functions:[{slug:'core-webhook-v2',status:'ACTIVE',version:7,verify_jwt:false}]};

function releaseExecute({rateHits=61,residueRows=null,failPhase=null,extraAligned=false,preApplied=false}={}){
  const calls=[];
  let migrationReads=0;
  const execute=(args,input)=>{
    calls.push({args,input});
    if(args[0]==='migration'){
      migrationReads++;
      return JSON.stringify(migrationState({pending33521:preApplied?false:migrationReads===1,extraAligned}));
    }
    if(args[0]==='functions'&&args[1]==='list')return JSON.stringify(functionState);
    if(args[0]==='db'&&args[1]==='query'&&args.includes('--file'))return JSON.stringify({rows:[{result:'PASS'}]});
    if(args[0]==='db'&&args[1]==='query'){
      const phase=input?.match(/-- LEIA_RATE_LIMIT_PHASE: ([a-z-]+)/)?.[1];
      if(!phase)return '';
      if(failPhase===phase)throw new Error(`synthetic ${phase} failure`);
      if(phase==='verify')return JSON.stringify({rows:[{bucket_count:1,hits:rateHits}]});
      if(phase==='residue')return JSON.stringify({rows:[residueRows??{workspace_count:0,user_count:0,profile_count:0,membership_count:0,webhook_count:0,rate_count:0,vault_secret_count:0,audit_log_count:0,platform_audit_count:0,contact_count:0,ingestion_count:0,activity_count:0,deal_count:0,automation_event_count:0}]});
      return JSON.stringify({rows:[]});
    }
    return '';
  };
  return {calls,execute};
}

test('release checks project ref and refuses unrelated pending migrations before push',()=>{
  const root=fixtureRoot();
  const calls=[];
  try{
    assert.throws(()=>runRelease({root,execute(args){calls.push(args);return JSON.stringify(migrationState({extraPending:true}));}}),/unexpected|pending/i);
    assert.deepEqual(calls,[migrationArgs]);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('default release rejects a pre-applied target; resume requires exact alignment and reruns contracts without push',()=>{
  const root=fixtureRoot();
  try{
    const {calls,execute}=releaseExecute({preApplied:true});
    assert.throws(()=>runRelease({root,execute}),/already applied/i);
    assert.deepEqual(calls.map(call=>call.args),[migrationArgs]);
    for(const extraAligned of [false,true]){
      const state=releaseExecute({preApplied:true,extraAligned});
      if(extraAligned)assert.throws(()=>runRelease({root,execute:state.execute,resumeAfterContracts:true,deploy:false}),/unexpected|migration set/i);
      else{
        const result=runRelease({root,execute:state.execute,resumeAfterContracts:true,deploy:false});
        assert.equal(result.deployed,false);
        assert.equal(state.calls.some(call=>call.args[0]==='db'&&call.args[1]==='push'),false);
        assert.ok(state.calls.some(call=>call.input?.includes('-- LEIA_RATE_LIMIT_PHASE: authorize')));
        assert.ok(state.calls.some(call=>call.args[0]==='db'&&call.args.includes('--file')));
      }
      assert.equal(state.calls.some(call=>call.args[0]==='functions'&&call.args[1]==='deploy'),false);
    }
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('release refuses an unknown migration even when aligned locally and remotely',()=>{
  const root=fixtureRoot();
  const {calls,execute}=releaseExecute({extraAligned:true});
  try{
    assert.throws(()=>runRelease({root,execute}),/unexpected.*migration|migration.*allowlist/i);
    assert.deepEqual(calls.map(call=>call.args),[migrationArgs]);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('release commits the 61st denial, reads hits=61 in a new transaction, then cleans before deployment',()=>{
  const root=fixtureRoot();
  const {calls,execute}=releaseExecute();
  try{
    const result=runRelease({root,execute});
    assert.deepEqual(result.rateLimitContract,{successfulAuthorizations:60,deniedAuthorizations:1,committedHits:61,cleanupVerified:true});
    const phases=calls.map(call=>call.input?.match(/-- LEIA_RATE_LIMIT_PHASE: ([a-z-]+)/)?.[1]).filter(Boolean);
    assert.deepEqual(phases,['setup','authorize','verify','cleanup','residue']);
    const residueIndex=phases.length-1;
    const identityIndex=calls.findIndex(call=>call.args[0]==='db'&&call.args[1]==='query'&&call.args.includes('--file'));
    const deployIndex=calls.findIndex(call=>call.args[0]==='functions'&&call.args[1]==='deploy');
    assert.ok(calls.findIndex(call=>call.input?.includes('-- LEIA_RATE_LIMIT_PHASE: residue'))<identityIndex);
    assert.ok(identityIndex<deployIndex);
    assert.equal(phases[residueIndex],'residue');
    const cleanup=calls.find(call=>call.input?.includes('-- LEIA_RATE_LIMIT_PHASE: cleanup'));
    assert.match(cleanup.input,/SELECT EXISTS\(SELECT 1 FROM public\.core_workspaces[\s\S]*?SELECT vault_secret_id INTO v_secret_id FROM core_private\.workspace_webhooks WHERE/,'workspace ownership is verified before the exact webhook SELECT');
    assert.ok(cleanup.input.includes('IF v_owned AND v_webhook_owned THEN'));
    assert.match(cleanup.input,/token_digest\s*=\s*extensions\.digest\(pg_catalog\.convert_to\(/i);
    assert.match(cleanup.input,/DELETE FROM core_private\.workspace_webhook_rate\s+AS rate\s+USING core_private\.workspace_webhooks\s+AS webhook/i);
    assert.match(cleanup.input,/rate\.webhook_id\s*=\s*webhook\.id/i);
    assert.match(cleanup.input,/DELETE FROM vault\.secrets WHERE id=v_secret_id/i);
    assert.doesNotMatch(cleanup.input,/DELETE FROM vault\.secrets WHERE name=/i);
    const deletes=[...cleanup.input.matchAll(/DELETE FROM\s+[\w.]+([\s\S]*?);/gi)];
    assert.equal(deletes.length,6);
    assert.ok(deletes.every(([,tail])=>/^\s+WHERE\b/i.test(tail)||/^\s+AS\s+\w+\s+USING\b/i.test(tail)),'cleanup deletions must be exact and scoped');
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('rate cleanup reads the exact webhook only inside the owned-workspace guard',()=>{
  const root=fixtureRoot();
  const {calls,execute}=releaseExecute();
  try{
    runRelease({root,execute,deploy:false});
    const cleanup=calls.find(call=>call.input?.includes('-- LEIA_RATE_LIMIT_PHASE: cleanup'))?.input||'';
    const ownedCheck=cleanup.indexOf('SELECT EXISTS(SELECT 1 FROM public.core_workspaces');
    const ownedGate=cleanup.indexOf('IF v_owned THEN');
    const webhookSelect=cleanup.indexOf('SELECT vault_secret_id INTO v_secret_id FROM core_private.workspace_webhooks');
    const ownedGateEnd=cleanup.indexOf('END IF;',ownedGate);
    assert.ok(ownedCheck>=0&&ownedGate>ownedCheck&&webhookSelect>ownedGate&&ownedGateEnd>webhookSelect,'workspace existence/creator check must guard secret lookup');
    const exactSelect=cleanup.slice(webhookSelect,cleanup.indexOf(';',webhookSelect));
    assert.match(exactSelect,/WHERE id=.*workspace_id=.*public_id=.*name=.*created_by=.*token_digest=extensions\.digest/i);
    assert.match(cleanup,/IF v_owned AND v_webhook_owned THEN/);
    assert.match(cleanup,/DELETE FROM core_private\.workspace_webhook_rate AS rate USING core_private\.workspace_webhooks AS webhook/i);
    assert.match(cleanup,/rate\.webhook_id=webhook\.id/i);
    assert.match(cleanup,/DELETE FROM vault\.secrets WHERE id=v_secret_id/i);
    assert.doesNotMatch(cleanup,/DELETE FROM vault\.secrets WHERE name=/i);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('legacy source remains compatible for identified webhooks but excludes API-key events without identity',()=>{
  const fixture=readFileSync(new URL('../supabase/tests/20261031033521_webhook_rate_limit_match_guard.sql',import.meta.url),'utf8');
  const migration=readFileSync(new URL('../supabase/migrations/20261031033521_webhook_rate_limit_and_match_guard.sql',import.meta.url),'utf8');
  assert.match(fixture,/v_specific<>1 or v_other<>0 or v_wildcard<>1 or v_legacy<>1/i,'identified webhook event continues to match the legacy rule');
  assert.match(fixture,/if v_legacy<>0 then raise exception 'API-key event without source_webhook_id matched legacy webhook source'; end if;/i);
  assert.match(fixture,/if v_wildcard<>0 then raise exception 'API-key event without source_webhook_id matched webhook-all'; end if;/i);
  assert.match(migration,/e\.context\s*\?\s*'source_webhook_id'[\s\S]*?source_id.*webhook-lead-created/i,'applied forward migration requires identity for legacy source too');
});

test('rollback fixture checks generated IDs and composite keys for every synthetic artifact class',()=>{
  const fixture=readFileSync(new URL('../supabase/tests/20261031033521_webhook_rate_limit_match_guard.sql',import.meta.url),'utf8');
  const residueBlock=fixture.match(/select\s+([\s\S]*?)\s+into v_residuals;/i)?.[1]||'';
  for(const tableVar of [
    ['public.core_ingestion_events','v_outer_ingestion_ids','uuid[]'],
    ['public.core_activities','v_outer_activity_ids','uuid[]'],
    ['public.core_audit_logs','v_outer_audit_ids','bigint[]'],
    ['core_private.platform_audit','v_outer_platform_audit_ids','bigint[]'],
    ['public.core_automation_events','v_outer_automation_event_ids','uuid[]'],
    ['public.core_automation_deliveries','v_outer_delivery_ids','uuid[]'],
    ['public.core_automation_continuations','v_outer_continuation_ids','uuid[]'],
    ['public.core_contacts','v_outer_contact_ids','uuid[]'],
    ['public.core_deals','v_outer_deal_ids','uuid[]'],
  ]){
    const [table,idArray,arrayType]=tableVar;
    assert.ok(residueBlock.toLowerCase().includes(`from ${table} where id=any(coalesce(${idArray},array[]::${arrayType}))`.toLowerCase()),`${table} must be checked by captured generated IDs`);
  }
  assert.match(residueBlock,/FROM public\.core_lead_submission_links WHERE workspace_id=v_workspace AND submission_id=ANY\(coalesce\(v_outer_submission_ids,array\[\]::text\[\]\)\)/i,'submission-link composite keys must be checked exactly');
  assert.match(residueBlock,/FROM core_private\.workspace_webhook_rate WHERE webhook_id IN \(v_outer_webhook_id,v_outer_other_webhook_id\)/i);
  assert.match(residueBlock,/FROM core_private\.webhook_rate WHERE key_id=v_outer_ingest_key_id/i);
  assert.match(residueBlock,/FROM vault\.secrets WHERE id IN \(v_outer_webhook_secret_id,v_outer_other_webhook_secret_id\)/i);
  assert.match(residueBlock,/FROM public\.core_automation_rule_revisions WHERE id=ANY/i);
});

test('audit front matter states current webhook release status separately from historical ingestion publication',()=>{
  const audit=readFileSync(new URL('../_project_delivery/audit/AUDIT_CURRENT.md',import.meta.url),'utf8').slice(0,1600);
  assert.match(audit,/CURRENT WEBHOOK RELEASE STATUS/i);
  assert.match(audit,/staging validated/i);
  assert.match(audit,/Edge v6 active/i);
  assert.match(audit,/Edge v7[^\n]*pending/i);
  assert.match(audit,/Git publication, Pages, and browser submission pending/i);
  assert.match(audit,/historical ingestion[^\n]*published/i);
});

test('contracts-only release runs database gates but does not deploy the Edge Function',()=>{
  const root=fixtureRoot();
  const {calls,execute}=releaseExecute();
  try{
    const result=runRelease({root,execute,deploy:false});
    assert.equal(result.deployed,false);
    assert.ok(calls.some(call=>call.input?.includes('-- LEIA_RATE_LIMIT_PHASE: residue')));
    assert.ok(calls.some(call=>call.args[0]==='db'&&call.args[1]==='query'&&call.args.includes('--file')));
    assert.equal(calls.some(call=>call.args[0]==='functions'&&call.args[1]==='deploy'),false);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('synthetic webhook token is sent through stdin and never appears in CLI arguments',()=>{
  const root=fixtureRoot();
  const {calls,execute}=releaseExecute();
  try{
    runRelease({root,execute});
    const setup=calls.find(call=>call.input?.includes('-- LEIA_RATE_LIMIT_PHASE: setup'));
    assert.ok(setup,'rate test setup SQL is required');
    const token=setup.input.match(/v_token text := '([a-f0-9]{64})'/)?.[1];
    assert.ok(token,'setup SQL must contain a generated token');
    assert.ok(calls.every(call=>call.args.every(arg=>!String(arg).includes(token))));
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('rate-probe context creation failure causes no setup, query, or Edge deploy',()=>{
  const root=fixtureRoot();
  const {calls,execute}=releaseExecute();
  try{
    assert.throws(()=>runRelease({root,execute,createRateProbeContext(){throw new Error('synthetic context failure');}}),/context/i);
    assert.equal(calls.some(call=>call.args[0]==='db'&&call.args[1]==='query'),false);
    assert.equal(calls.some(call=>call.args[0]==='functions'&&call.args[1]==='deploy'),false);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('release blocks deployment on a bad committed hit count, cleanup failure, or residual rows',()=>{
  const cases=[
    {options:{rateHits:60},pattern:/hits=61|rate.*counter/i,expectedResidueRead:true},
    {options:{failPhase:'authorize'},pattern:/authoriz/i,expectedResidueRead:true},
    {options:{failPhase:'cleanup'},pattern:/cleanup/i,expectedResidueRead:true},
    {options:{residueRows:{workspace_count:0,user_count:0,profile_count:0,membership_count:0,webhook_count:1,rate_count:0,vault_secret_count:0,audit_log_count:0,platform_audit_count:0,contact_count:0,ingestion_count:0,activity_count:0,deal_count:0,automation_event_count:0}},pattern:/residue|cleanup/i,expectedResidueRead:true}
  ];
  for(const scenario of cases){
    const root=fixtureRoot();
    const {calls,execute}=releaseExecute(scenario.options);
    try{
      assert.throws(()=>runRelease({root,execute}),scenario.pattern);
      assert.equal(calls.some(call=>call.args[0]==='functions'&&call.args[1]==='deploy'),false);
      assert.equal(calls.some(call=>call.input?.includes('-- LEIA_RATE_LIMIT_PHASE: residue')),scenario.expectedResidueRead);
    }finally{rmSync(root,{recursive:true,force:true});}
  }
});

test('release fails closed on the wrong linked Supabase project before any CLI call',()=>{
  const root=fixtureRoot('aaaaaaaaaaaaaaaaaaaa');
  const calls=[];
  try{
    assert.throws(()=>runRelease({root,execute(args){calls.push(args);return '{}';}}),/project ref/i);
    assert.equal(calls.length,0);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('release verifies the migration state after push before running contracts and deployment',()=>{
  const root=fixtureRoot();
  const {calls,execute}=releaseExecute();
  try{
    runRelease({root,execute});
    const migrationCalls=calls.filter(call=>call.args[0]==='migration');
    const pushIndex=calls.findIndex(call=>call.args[0]==='db'&&call.args[1]==='push');
    const contractIndex=calls.findIndex(call=>call.args[0]==='db'&&call.args[1]==='query'&&call.args.includes('--file'));
    const deployIndex=calls.findIndex(call=>call.args[0]==='functions'&&call.args[1]==='deploy');
    assert.equal(migrationCalls.length,2);
    assert.equal(migrationCalls[0].args.join(' '),'migration list --linked --output-format json');
    assert.ok(migrationCalls[0].input===undefined);
    assert.ok(pushIndex>calls.indexOf(migrationCalls[0]));
    assert.ok(calls.indexOf(migrationCalls[1])>pushIndex);
    assert.ok(contractIndex>calls.indexOf(migrationCalls[1]));
    assert.ok(deployIndex>contractIndex);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('release refuses to deploy when migration 33521 is still unapplied after push',()=>{
  const root=fixtureRoot();
  const calls=[];
  let migrationReads=0;
  try{
    assert.throws(()=>runRelease({root,execute(args){
      calls.push(args);
      if(args[0]==='migration'){
        migrationReads++;
        return JSON.stringify(migrationState({pending33521:true}));
      }
      return '';
    }}),/not aligned|33521|applied/i);
    assert.equal(calls.filter(args=>args[0]==='functions'&&args[1]==='deploy').length,0);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('release refuses divergent migration history before database push',()=>{
  const root=fixtureRoot();
  const calls=[];
  try{
    assert.throws(()=>runRelease({root,execute(args){
      calls.push(args);
      const swapped=new Map([['20261031023137','20261031012321'],['20261031012321','20261031023137']]);
      return JSON.stringify({migrations:[
        ...BASELINE_MIGRATIONS.filter(version=>!swapped.has(version)).map(version=>({local:version,remote:version})),
        ...[...swapped].map(([local,remote])=>({local,remote})),
        {local:'20261031033521',remote:''}
      ]});
    }}),/diverges/i);
    assert.equal(calls.filter(args=>args[0]==='db').length,0);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('release stops before Edge deployment if the rollback SQL contract fails',()=>{
  const root=fixtureRoot();
  const {calls,execute:baseExecute}=releaseExecute();
  const execute=(args,input)=>{
    if(args[0]==='db'&&args[1]==='query'&&args.includes('--file'))throw new Error('synthetic identity contract failure');
    return baseExecute(args,input);
  };
  try{
    assert.throws(()=>runRelease({root,execute}),/identity contract failure/);
    assert.equal(calls.some(call=>call.args[0]==='functions'&&call.args[1]==='deploy'),false);
  }finally{rmSync(root,{recursive:true,force:true});}
});

test('release requires the deployed webhook function to be active with JWT verification disabled',()=>{
  const root=fixtureRoot();
  const {execute:baseExecute}=releaseExecute();
  const execute=(args,input)=>{
    if(args[0]==='functions'&&args[1]==='list')return JSON.stringify({functions:[{slug:'core-webhook-v2',status:'ACTIVE',version:7,verify_jwt:true}]});
    return baseExecute(args,input);
  };
  try{
    assert.throws(()=>runRelease({root,execute}),/verify_jwt/i);
  }finally{rmSync(root,{recursive:true,force:true});}
});
