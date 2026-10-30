import {describe,expect,it} from 'vitest';
import {effectiveCapabilities,hasCapability} from '../lib/effectivePermissions';

describe('effective permissions',()=>{
 it('gives the owner unconditional full access',()=>{
  expect(hasCapability('owner',[], 'deals.delete')).toBe(true);
 });
 it('uses configured rows for every non-owner role without a name ceiling',()=>{
  const rows=[{role:'custom_closer',permission:'deals.write',enabled:true},{role:'custom_closer',permission:'contacts.delete',enabled:false}];
  expect(effectiveCapabilities('custom_closer',rows).has('deals.write')).toBe(true);
  expect(hasCapability('custom_closer',rows,'contacts.delete')).toBe(false);
 });
 it('does not treat admin as full unless each capability is enabled',()=>{
  expect(hasCapability('admin',[{role:'admin',permission:'contacts.read',enabled:true}],'deals.write')).toBe(false);
 });
});
