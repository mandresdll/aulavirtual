import { describe, expect, it } from 'vitest';
import { SgaCertificateValidator } from './sga.js';

const certificate = {
  code: 'ABCD-EFGH-JKMN',
  holderName: 'Ana Soto',
  courseTitle: 'Excel',
  hours: 20,
  issuedAt: new Date('2026-06-01T12:00:00Z'),
  verificationUrl: 'https://cursos.example.cl/verificar/ABCD-EFGH-JKMN',
};

function validator(status: number, body: unknown = {}) {
  const calls: { url: string; init?: RequestInit | undefined }[] = [];
  const instance = new SgaCertificateValidator({
    baseUrl: 'https://sga.example.cl/api',
    token: 'service-token',
    fetch: async (input, init) => {
      calls.push({ url: String(input), init });
      return new Response(status === 204 ? null : JSON.stringify(body), { status });
    },
  });
  return { instance, calls };
}

describe('SgaCertificateValidator', () => {
  it('publishes a certificate with the service token', async () => {
    const { instance, calls } = validator(201, { externalId: 'SGA-9' });
    expect(await instance.register(certificate)).toEqual({ externalId: 'SGA-9' });
    expect(calls[0]?.url).toBe('https://sga.example.cl/api/certificates');
    expect(new Headers(calls[0]?.init?.headers).get('authorization')).toBe('Bearer service-token');
    expect(JSON.parse(String(calls[0]?.init?.body))).toMatchObject({
      code: certificate.code,
      issuedAt: '2026-06-01T12:00:00.000Z',
    });
  });

  it('treats an already published certificate as done', async () => {
    const { instance } = validator(409);
    await expect(instance.register(certificate)).resolves.toEqual({
      externalId: certificate.code,
    });
  });

  it('revokes with the reason', async () => {
    const { instance, calls } = validator(204);
    await instance.revoke({ code: certificate.code, reason: 'Error en los datos' });
    expect(calls[0]?.url).toBe('https://sga.example.cl/api/certificates/ABCD-EFGH-JKMN/revoke');
  });

  it('reports server errors as retryable and rejections as definitive', async () => {
    await expect(validator(503).instance.register(certificate)).rejects.toMatchObject({
      retryable: true,
    });
    await expect(validator(422).instance.register(certificate)).rejects.toMatchObject({
      retryable: false,
    });
  });
});
