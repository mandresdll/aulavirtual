import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { buildLoggerOptions, stripQuery } from './logger.js';

function captureLogger() {
  const lines: string[] = [];
  const stream = new Writable({
    write(chunk, _encoding, callback) {
      lines.push(chunk.toString());
      callback();
    },
  });
  const logger = pino(buildLoggerOptions({ LOG_LEVEL: 'info', APP_ENV: 'test' }), stream);
  return { logger, lines };
}

describe('logger', () => {
  it('redacts personal data and secrets', () => {
    const { logger, lines } = captureLogger();
    logger.info(
      {
        buyer: { email: 'persona@example.com', rut: '12345678-5', phone: '+56911111111' },
        payment: { token: 'tok_abc', amount: 1000 },
      },
      'event',
    );
    const output = lines.join('');
    expect(output).not.toContain('persona@example.com');
    expect(output).not.toContain('12345678-5');
    expect(output).not.toContain('tok_abc');
    expect(output).toContain('"amount":1000');
    expect(output).toContain('[REDACTED]');
  });

  it('strips query strings that may carry tokens', () => {
    expect(stripQuery('/api/payments/return?token_ws=abc')).toBe('/api/payments/return');
    expect(stripQuery('/api/health')).toBe('/api/health');
  });
});
