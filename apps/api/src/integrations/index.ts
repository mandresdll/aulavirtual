import type { Env } from '../config/env.js';
import { DisabledAiAssistant, type AiAssistant } from './ai-assistant/port.js';
import { MockCertificateValidator } from './certificate-validator/mock.js';
import type { CertificateValidator } from './certificate-validator/port.js';
import { SgaCertificateValidator } from './certificate-validator/sga.js';
import { MockIdentityProvider } from './identity/mock.js';
import { OidcIdentityProvider } from './identity/oidc.js';
import type { IdentityProvider } from './identity/port.js';
import { MockInvoicingGateway } from './invoicing/mock.js';
import { PendingInvoicingGateway } from './invoicing/pending.js';
import type { InvoicingGateway } from './invoicing/port.js';
import { MockLmsGateway } from './lms/mock.js';
import { MoodleLmsGateway } from './lms/moodle.js';
import type { LmsGateway } from './lms/port.js';
import { MemoryMailer } from './mailer/memory.js';
import type { Mailer } from './mailer/port.js';
import { SmtpMailer } from './mailer/smtp.js';
import { MockPaymentGateway } from './payment-gateway/mock.js';
import type { PaymentGateway } from './payment-gateway/port.js';
import { WebpayPaymentGateway } from './payment-gateway/webpay.js';
import { HttpSgaGateway } from './sga/http.js';
import { MockSgaGateway } from './sga/mock.js';
import type { SgaGateway } from './sga/port.js';

export interface Integrations {
  paymentGateway: PaymentGateway;
  lms: LmsGateway;
  identity: IdentityProvider;
  sga: SgaGateway;
  certificateValidator: CertificateValidator;
  invoicing: InvoicingGateway;
  mailer: Mailer;
  aiAssistant: AiAssistant;
}

/**
 * Elige cada adaptador según las variables `*_DRIVER`. `parseEnv` ya garantizó que las
 * variables del adaptador real existen; `required` solo protege contra un uso directo sin validar.
 */
function required(env: Env, name: keyof Env): string {
  const value = env[name];
  if (typeof value !== 'string' || value === '') {
    throw new Error(`Missing required environment variable ${name}`);
  }
  return value;
}

export function createIntegrations(env: Env): Integrations {
  return {
    paymentGateway:
      env.PAYMENT_GATEWAY_DRIVER === 'webpay'
        ? new WebpayPaymentGateway({
            environment: env.WEBPAY_ENVIRONMENT,
            commerceCode: required(env, 'WEBPAY_COMMERCE_CODE'),
            apiKey: required(env, 'WEBPAY_API_KEY'),
          })
        : new MockPaymentGateway({ redirectBaseUrl: env.PUBLIC_API_URL }),

    lms:
      env.LMS_DRIVER === 'moodle'
        ? new MoodleLmsGateway({
            url: required(env, 'MOODLE_URL'),
            token: required(env, 'MOODLE_TOKEN'),
            studentRoleId: env.MOODLE_STUDENT_ROLE_ID,
          })
        : new MockLmsGateway(),

    identity:
      env.IDENTITY_DRIVER === 'oidc'
        ? new OidcIdentityProvider({
            issuerUrl: required(env, 'OIDC_ISSUER_URL'),
            clientId: required(env, 'OIDC_CLIENT_ID'),
            clientSecret: required(env, 'OIDC_CLIENT_SECRET'),
            redirectUri: required(env, 'OIDC_REDIRECT_URI'),
            scopes: env.OIDC_SCOPES,
          })
        : // Mismo origen que la SPA: la cookie de sesión y el retorno pasan por /api de la web.
          new MockIdentityProvider({ baseUrl: env.PUBLIC_WEB_URL }),

    sga:
      env.SGA_DRIVER === 'http'
        ? new HttpSgaGateway({
            baseUrl: required(env, 'SGA_API_URL'),
            token: required(env, 'SGA_API_TOKEN'),
          })
        : new MockSgaGateway(),

    certificateValidator:
      env.CERTIFICATE_VALIDATOR_DRIVER === 'sga'
        ? new SgaCertificateValidator({
            baseUrl: required(env, 'CERTIFICATE_VALIDATOR_URL'),
            token: required(env, 'CERTIFICATE_VALIDATOR_TOKEN'),
          })
        : new MockCertificateValidator(),

    invoicing:
      env.INVOICING_DRIVER === 'mock'
        ? new MockInvoicingGateway()
        : new PendingInvoicingGateway(env.INVOICING_DRIVER),

    mailer:
      env.MAILER_DRIVER === 'memory'
        ? new MemoryMailer()
        : new SmtpMailer({
            host: env.SMTP_HOST,
            port: env.SMTP_PORT,
            secure: env.SMTP_SECURE,
            ...(env.SMTP_USER ? { user: env.SMTP_USER } : {}),
            ...(env.SMTP_PASSWORD ? { password: env.SMTP_PASSWORD } : {}),
            from: env.MAIL_FROM,
          }),

    aiAssistant: new DisabledAiAssistant(),
  };
}
