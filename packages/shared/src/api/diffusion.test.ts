import { describe, expect, it } from 'vitest';
import { buildUtmLink, LEAD_CONSENT, LeadRequestSchema, parseUtm } from './diffusion.js';

describe('UTM helpers', () => {
  it('reads only the UTM parameters of a URL', () => {
    expect(parseUtm('?utm_source=facebook&utm_campaign=2027&otro=1')).toEqual({
      source: 'facebook',
      campaign: '2027',
    });
    expect(parseUtm('?q=excel')).toBeNull();
  });

  it('ignores values longer than allowed', () => {
    expect(parseUtm(`?utm_source=${'x'.repeat(101)}`)).toBeNull();
  });

  it('builds a link that reads back the same campaign', () => {
    const link = buildUtmLink('https://cursos.example.cl/cursos/excel?a=1', {
      source: 'correo',
      medium: '',
      campaign: 'matrícula 2027',
    });
    expect(link).toContain('a=1');
    expect(link).not.toContain('utm_medium');
    expect(parseUtm(new URL(link).search)).toEqual({
      source: 'correo',
      campaign: 'matrícula 2027',
    });
  });
});

describe('lead request', () => {
  const valid = {
    email: ' Ana@Example.CL ',
    consent: true,
    consentVersion: LEAD_CONSENT.version,
  };

  it('normalizes the email', () => {
    expect(LeadRequestSchema.parse(valid).email).toBe('ana@example.cl');
  });

  it('requires explicit consent', () => {
    expect(LeadRequestSchema.safeParse({ ...valid, consent: false }).success).toBe(false);
    expect(LeadRequestSchema.safeParse({ ...valid, consent: undefined }).success).toBe(false);
  });
});
