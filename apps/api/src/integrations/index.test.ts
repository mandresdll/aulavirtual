import { describe, expect, it } from 'vitest';
import { testEnv } from '../test-support.js';
import { AdapterNotImplementedError } from './errors.js';
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

  it('real adapters not yet implemented fail loudly instead of pretending to work', async () => {
    const integrations = createIntegrations(
      testEnv({ LMS_DRIVER: 'moodle', MOODLE_URL: 'https://aula.example.cl', MOODLE_TOKEN: 't' }),
    );
    await expect(integrations.lms.findUserByEmail('a@example.com')).rejects.toBeInstanceOf(
      AdapterNotImplementedError,
    );
  });
});
