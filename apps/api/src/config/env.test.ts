import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ConfigError, EnvSchema, parseEnv } from './env.js';

const base = {
  DATABASE_URL: 'postgresql://user:secret-password@localhost:5432/app',
  REDIS_URL: 'redis://localhost:6379',
};

function configError(source: Record<string, string>): ConfigError {
  try {
    parseEnv(source);
  } catch (error) {
    if (error instanceof ConfigError) return error;
    throw error;
  }
  throw new Error('Expected ConfigError');
}

describe('parseEnv', () => {
  it('applies safe defaults: mock adapters and development mode', () => {
    const env = parseEnv(base);
    expect(env).toMatchObject({
      APP_ENV: 'development',
      PORT: 3000,
      PAYMENT_GATEWAY_DRIVER: 'mock',
      LMS_DRIVER: 'mock',
      TRUST_PROXY: false,
    });
  });

  it('coerces numbers, booleans and comma-separated lists', () => {
    const env = parseEnv({
      ...base,
      PORT: '8080',
      TRUST_PROXY: 'true',
      CORS_ORIGINS: 'https://a.cl, https://b.cl',
    });
    expect(env.PORT).toBe(8080);
    expect(env.TRUST_PROXY).toBe(true);
    expect(env.CORS_ORIGINS).toEqual(['https://a.cl', 'https://b.cl']);
  });

  it('treats empty strings as undefined', () => {
    const env = parseEnv({ ...base, SMTP_USER: '', PORT: '' });
    expect(env.SMTP_USER).toBeUndefined();
    expect(env.PORT).toBe(3000);
  });

  it('requires the database and Redis URLs', () => {
    const error = configError({});
    expect(error.issues.join('\n')).toMatch(/DATABASE_URL/);
    expect(error.issues.join('\n')).toMatch(/REDIS_URL/);
  });

  it('requires the credentials of each real adapter', () => {
    const error = configError({ ...base, PAYMENT_GATEWAY_DRIVER: 'webpay', LMS_DRIVER: 'moodle' });
    const text = error.issues.join('\n');
    expect(text).toMatch(/WEBPAY_COMMERCE_CODE: Obligatoria/);
    expect(text).toMatch(/WEBPAY_API_KEY/);
    expect(text).toMatch(/MOODLE_URL/);
    expect(text).toMatch(/MOODLE_TOKEN/);
  });

  it('blocks mock adapters in production unless explicitly allowed', () => {
    expect(configError({ ...base, APP_ENV: 'production' }).issues.join('\n')).toMatch(
      /PAYMENT_GATEWAY_DRIVER: No se permiten adaptadores simulados/,
    );
    expect(parseEnv({ ...base, APP_ENV: 'production', ALLOW_MOCK_ADAPTERS: 'true' }).APP_ENV).toBe(
      'production',
    );
  });

  it('documents every variable in .env.example and the example is valid', () => {
    const example = readFileSync(new URL('../../../../.env.example', import.meta.url), 'utf8');
    const documented = new Map(
      example
        .split(/\r?\n/)
        .map((line) => /^([A-Z0-9_]+)=(.*)$/.exec(line))
        .filter((match): match is RegExpExecArray => match !== null)
        .map((match) => [match[1] as string, match[2] as string]),
    );
    const missing = Object.keys(EnvSchema.shape).filter((name) => !documented.has(name));
    expect(missing).toEqual([]);
    expect(() => parseEnv(Object.fromEntries(documented))).not.toThrow();
  });

  it('never includes variable values in the error message', () => {
    const error = configError({ ...base, REDIS_URL: 'not-a-url', PORT: 'abc' });
    expect(error.message).not.toContain('secret-password');
    expect(error.message).not.toContain('not-a-url');
  });
});
