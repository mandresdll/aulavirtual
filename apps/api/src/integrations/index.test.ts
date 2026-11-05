import { describe, expect, it } from 'vitest';
import { testEnv } from '../test-support.js';
import { createIntegrations } from './index.js';

describe('createIntegrations', () => {
  it('uses mock adapters by default', () => {
    const integrations = createIntegrations(testEnv());
    expect(integrations.paymentGateway.provider).toBe('mock');
    expect(integrations.lms.provider).toBe('mock');
    expect(integrations.identity.provider).toBe('mock');
    expect(integrations.sga.provider).toBe('mock');
    expect(integrations.certificateValidator.provider).toBe('mock');
    expect(integrations.invoicing.provider).toBe('mock');
    expect(integrations.mailer.provider).toBe('memory');
    expect(integrations.aiAssistant.enabled).toBe(false);
  });

  it('selects real adapters from the *_DRIVER variables', () => {
    const integrations = createIntegrations(
      testEnv({
        PAYMENT_GATEWAY_DRIVER: 'webpay',
        WEBPAY_COMMERCE_CODE: 'code',
        WEBPAY_API_KEY: 'key',
        LMS_DRIVER: 'moodle',
        MOODLE_URL: 'https://aula.example.cl',
        MOODLE_TOKEN: 'token',
        INVOICING_DRIVER: 'export',
        MAILER_DRIVER: 'smtp',
      }),
    );
    expect(integrations.paymentGateway.provider).toBe('webpay');
    expect(integrations.lms.provider).toBe('moodle');
    expect(integrations.invoicing.provider).toBe('export');
    expect(integrations.mailer.provider).toBe('smtp');
  });

  it('delivers documents by file only with the export driver', () => {
    const exported = createIntegrations(testEnv({ INVOICING_DRIVER: 'export' }));
    expect(exported.invoicing.deliversByFile).toBe(true);
    const http = createIntegrations(
      testEnv({
        INVOICING_DRIVER: 'http',
        INVOICING_API_URL: 'https://boletas.example.cl',
        INVOICING_API_TOKEN: 'token',
      }),
    );
    expect(http.invoicing.provider).toBe('http');
    expect(http.invoicing.deliversByFile).toBe(false);
  });
});
