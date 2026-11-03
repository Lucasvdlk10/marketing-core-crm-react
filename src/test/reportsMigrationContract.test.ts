import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe,expect,it} from 'vitest';

const migration=readFileSync(resolve(process.cwd(),'supabase/migrations/20261103140000_reports_analytics_overhaul.sql'),'utf8');

function functionDefinition(name:string){
  const start=migration.toLowerCase().indexOf(`create or replace function public.${name.toLowerCase()}(`);
  expect(start,`missing function ${name}`).toBeGreaterThanOrEqual(0);
  const end=migration.indexOf('$function$;',start);
  expect(end,`missing end marker for ${name}`).toBeGreaterThan(start);
  return migration.slice(start,end+'$function$;'.length).toLowerCase();
}

describe('reports migration contracts',()=>{
  it('decides missing-reason eligibility from structured loss_reason, not free-text notes',()=>{
    const page=functionDefinition('core_reports_lost_deals_page');
    const request=functionDefinition('core_loss_reason_request');
    expect(page).toContain('loss_reason');
    expect(request).toContain('loss_reason');
    expect(page).not.toContain('core_loss_observation_is_blank');
    expect(request).not.toContain('core_loss_observation_is_blank');
  });

  it('serializes duplicate reason requests and only notifies the winning request',()=>{
    const request=functionDefinition('core_loss_reason_request');
    expect(request).toContain('for update of d');
    expect(request).toMatch(/on conflict\s*\(workspace_id,\s*deal_id\)\s*where status\s*=\s*'pending'\s*do nothing/i);
    const conflictBranch=request.indexOf('if v_request_id is null then');
    const conflictBranchEnd=request.indexOf('end if;',conflictBranch);
    const notificationInsert=request.indexOf('insert into public.core_notifications');
    expect(conflictBranch).toBeGreaterThanOrEqual(0);
    expect(request.slice(conflictBranch,conflictBranchEnd)).toContain('already_requested');
    expect(conflictBranchEnd).toBeGreaterThan(conflictBranch);
    expect(notificationInsert).toBeGreaterThan(conflictBranchEnd);
  });

  it('records a loss actor only when the authenticated user has workspace write permission',()=>{
    const trigger=functionDefinition('core_capture_loss_metadata');
    expect(trigger).toContain("public.core_has_permission(new.workspace_id, 'deals.write')");
    expect(trigger).toContain('v_authorized_actor');
    expect(trigger.match(/new\.loss_marked_by\s*:=\s*v_authorized_actor/g)).toHaveLength(2);
  });
});
