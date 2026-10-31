import {describe,expect,it} from 'vitest';
import {fallbackIdempotency,normalizeLeadPayload} from '../../supabase/functions/_shared/lead';

const partialLeadPayload={
  source:'chat-captacao',
  page:'https://marketingcore.com.br/',
  submission_id:'submission-synthetic-001',
  nome:'Lead Sintético',
  telefone:'+5531999990000',
  email:'lead.sintetico@example.com',
  empresa:'Empresa de teste',
  sintoma:'Dado de teste',
  estrutura_atual:'Equipe sintética',
  objetivo:'Validar o recebimento',
  consentimento:'sim',
  consent:'1',
  utm_source:'newsletter',
  extra_nested:{step:2,labels:['parte-a','parte-b']},
};

describe('normalizeLeadPayload',()=>{
  it('maps known Portuguese fields and retains all received fields for the activity event',()=>{
    const normalized=normalizeLeadPayload(partialLeadPayload);

    expect(normalized.company).toBe('Empresa de teste');
    expect(normalized.consent).toBe(true);
    expect(normalized.raw_fields).toEqual(partialLeadPayload);
    expect(normalized.raw_fields).not.toBe(partialLeadPayload);
  });

  it('retains sparse follow-up submissions as separate payloads without filling absent fields',()=>{
    const followUp={source:'chat-captacao',submission_id:'submission-synthetic-001',sintoma:'Campo recebido depois'};
    const normalized=normalizeLeadPayload(followUp);

    expect(normalized.raw_fields).toEqual(followUp);
    expect(normalized.raw_fields).not.toHaveProperty('email');
    expect(normalized.raw_fields).not.toHaveProperty('empresa');
  });

  it('accepts an identity-free partial only when it carries a submission id',()=>{
    expect(()=>normalizeLeadPayload({sintoma:'sem vínculo'})).toThrow('Invalid lead identity');
    expect(normalizeLeadPayload({submission_id:'submission-synthetic-001',sintoma:'Campo avulso'}).has_identity).toBe(false);
  });

  it('deduplicates exact retries but distinguishes partial events reusing one idempotency header',async()=>{
    const first=JSON.stringify({submission_id:'submission-synthetic-001',empresa:'Empresa A'});
    const next=JSON.stringify({submission_id:'submission-synthetic-001',objetivo:'Meta B'});

    expect(await fallbackIdempotency(first,'same-request-header')).toBe(await fallbackIdempotency(first,'same-request-header'));
    expect(await fallbackIdempotency(first,'same-request-header')).not.toBe(await fallbackIdempotency(next,'same-request-header'));
    expect(await fallbackIdempotency(first,'request-header-one')).not.toBe(await fallbackIdempotency(first,'request-header-two'));
    expect(await fallbackIdempotency(first,'lead-ingestion-v1:body')).not.toBe(await fallbackIdempotency(first));
  });
});
