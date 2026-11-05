import { z } from 'zod';

/** Columnas posibles del archivo contable (Q6); `INVOICING_EXPORT_COLUMNS` elige y ordena. */
export const DOCUMENT_COLUMN_KEYS = [
  'folio',
  'tipo',
  'fecha',
  'orden',
  'rut',
  'razon_social',
  'giro',
  'direccion',
  'correo',
  'detalle',
  'neto',
  'iva',
  'exento',
  'total',
  'devuelto',
  'estado',
] as const;

const appEnvs = ['development', 'test', 'staging', 'production'] as const;
const logLevels = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;

const optionalString = z.string().min(1).optional();
const optionalUrl = z.url().optional();
const port = z.coerce.number().int().min(1).max(65_535);
const positiveInt = z.coerce.number().int().positive();
const flag = z.stringbool();
const csv = z.string().transform((value) =>
  value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean),
);

/**
 * Variables de entorno de la API. Toda variable nueva debe agregarse aquí y en `.env.example`.
 */
export const EnvSchema = z
  .object({
    APP_ENV: z.enum(appEnvs).default('development'),
    APP_VERSION: z.string().default('0.0.0-dev'),
    HOST: z.string().default('0.0.0.0'),
    PORT: port.default(3000),
    LOG_LEVEL: z.enum(logLevels).default('info'),
    TRUST_PROXY: flag.default(false),

    PUBLIC_WEB_URL: z.url().default('http://localhost:5173'),
    PUBLIC_API_URL: z.url().default('http://localhost:3000'),
    CORS_ORIGINS: csv.optional(),

    DATABASE_URL: z
      .url()
      .refine((value) => /^postgres(ql)?:\/\//.test(value), 'Debe ser una URL postgresql://'),
    REDIS_URL: z.url().refine((value) => /^rediss?:\/\//.test(value), 'Debe ser una URL redis://'),

    RATE_LIMIT_MAX: positiveInt.default(100),
    RATE_LIMIT_WINDOW_MS: positiveInt.default(60_000),
    AUTH_RATE_LIMIT_MAX: positiveInt.default(10),

    SESSION_IDLE_TIMEOUT_SECONDS: positiveInt.default(1_800),
    SESSION_ABSOLUTE_TIMEOUT_SECONDS: positiveInt.default(28_800),
    SESSION_COOKIE_SECURE: flag.default(true),

    CATALOG_CACHE_TTL_SECONDS: positiveInt.default(60),
    SEATS_CACHE_TTL_SECONDS: positiveInt.default(15),
    SEO_ALLOW_INDEXING: flag.default(false),

    SEAT_RESERVATION_TTL_MINUTES: positiveInt.max(120).default(15),
    CHECKOUT_RATE_LIMIT_MAX: positiveInt.default(30),
    WAITLIST_OFFER_HOURS: positiveInt.max(168).default(24),
    COURSE_RESULT_GRACE_DAYS: positiveInt.max(365).default(30),
    VERIFY_RATE_LIMIT_MAX: positiveInt.default(30),
    LEADS_RATE_LIMIT_MAX: positiveInt.default(10),
    PAGE_VIEW_RATE_LIMIT_MAX: positiveInt.default(60),
    LEAD_RETENTION_DAYS: positiveInt.default(730),

    SELLER_NAME: z
      .string()
      .default('Centro de Formación Técnica Estatal de Magallanes y la Antártica Chilena'),
    SELLER_RUT: z.string().default('Por confirmar'),
    SELLER_ADDRESS: z.string().default('Por confirmar'),
    SELLER_EMAIL: z.string().default('Por confirmar'),
    SELLER_PHONE: z.string().default('Por confirmar'),

    MAILER_DRIVER: z.enum(['smtp', 'memory']).default('smtp'),
    SMTP_HOST: z.string().default('localhost'),
    SMTP_PORT: port.default(1025),
    SMTP_SECURE: flag.default(false),
    SMTP_USER: optionalString,
    SMTP_PASSWORD: optionalString,
    MAIL_FROM: z.string().default('Cursos UTA <no-responder@example.com>'),
    UTA_ALERT_EMAIL: z.email().optional(),

    ALLOW_MOCK_ADAPTERS: flag.default(false),

    PAYMENT_GATEWAY_DRIVER: z.enum(['mock', 'webpay']).default('mock'),
    WEBPAY_ENVIRONMENT: z.enum(['integration', 'production']).default('integration'),
    WEBPAY_COMMERCE_CODE: optionalString,
    WEBPAY_API_KEY: optionalString,

    LMS_DRIVER: z.enum(['mock', 'moodle']).default('mock'),
    MOODLE_URL: optionalUrl,
    MOODLE_TOKEN: optionalString,
    MOODLE_STUDENT_ROLE_ID: positiveInt.default(5),

    IDENTITY_DRIVER: z.enum(['mock', 'oidc']).default('mock'),
    OIDC_ISSUER_URL: optionalUrl,
    OIDC_CLIENT_ID: optionalString,
    OIDC_CLIENT_SECRET: optionalString,
    OIDC_REDIRECT_URI: optionalUrl,
    OIDC_SCOPES: z.string().default('openid profile email'),

    SGA_DRIVER: z.enum(['mock', 'http']).default('mock'),
    SGA_API_URL: optionalUrl,
    SGA_API_TOKEN: optionalString,
    SGA_ROLES_CACHE_TTL_SECONDS: positiveInt.default(300),

    CERTIFICATE_VALIDATOR_DRIVER: z.enum(['mock', 'sga']).default('mock'),
    CERTIFICATE_VALIDATOR_URL: optionalUrl,
    CERTIFICATE_VALIDATOR_TOKEN: optionalString,

    INVOICING_DRIVER: z.enum(['mock', 'export', 'http']).default('mock'),
    INVOICING_API_URL: optionalUrl,
    INVOICING_API_TOKEN: optionalString,
    INVOICING_EXPORT_COLUMNS: csv.pipe(z.array(z.enum(DOCUMENT_COLUMN_KEYS)).min(1)).optional(),
    VAT_RATE_PERCENT: z.coerce.number().min(0).max(100).default(19),

    AI_ASSISTANT_DRIVER: z.enum(['disabled']).default('disabled'),
  })
  .superRefine((env, ctx) => {
    const requireVars = (reason: string, names: (keyof typeof env)[]) => {
      for (const name of names) {
        if (env[name] === undefined) {
          ctx.addIssue({ code: 'custom', path: [name], message: `Obligatoria cuando ${reason}` });
        }
      }
    };

    if (env.PAYMENT_GATEWAY_DRIVER === 'webpay') {
      requireVars('PAYMENT_GATEWAY_DRIVER=webpay', ['WEBPAY_COMMERCE_CODE', 'WEBPAY_API_KEY']);
    }
    if (env.LMS_DRIVER === 'moodle') {
      requireVars('LMS_DRIVER=moodle', ['MOODLE_URL', 'MOODLE_TOKEN']);
    }
    if (env.IDENTITY_DRIVER === 'oidc') {
      requireVars('IDENTITY_DRIVER=oidc', [
        'OIDC_ISSUER_URL',
        'OIDC_CLIENT_ID',
        'OIDC_CLIENT_SECRET',
        'OIDC_REDIRECT_URI',
      ]);
    }
    if (env.SGA_DRIVER === 'http') {
      requireVars('SGA_DRIVER=http', ['SGA_API_URL', 'SGA_API_TOKEN']);
    }
    if (env.CERTIFICATE_VALIDATOR_DRIVER === 'sga') {
      requireVars('CERTIFICATE_VALIDATOR_DRIVER=sga', [
        'CERTIFICATE_VALIDATOR_URL',
        'CERTIFICATE_VALIDATOR_TOKEN',
      ]);
    }
    if (env.INVOICING_DRIVER === 'http') {
      requireVars('INVOICING_DRIVER=http', ['INVOICING_API_URL', 'INVOICING_API_TOKEN']);
    }

    if (env.APP_ENV === 'production' && !env.SESSION_COOKIE_SECURE) {
      ctx.addIssue({
        code: 'custom',
        path: ['SESSION_COOKIE_SECURE'],
        message: 'La cookie de sesión debe ser Secure en producción',
      });
    }

    // En producción, los adaptadores simulados solo se permiten de forma explícita.
    if (env.APP_ENV === 'production' && !env.ALLOW_MOCK_ADAPTERS) {
      const mockDrivers = {
        PAYMENT_GATEWAY_DRIVER: env.PAYMENT_GATEWAY_DRIVER,
        LMS_DRIVER: env.LMS_DRIVER,
        IDENTITY_DRIVER: env.IDENTITY_DRIVER,
        SGA_DRIVER: env.SGA_DRIVER,
        CERTIFICATE_VALIDATOR_DRIVER: env.CERTIFICATE_VALIDATOR_DRIVER,
        INVOICING_DRIVER: env.INVOICING_DRIVER,
        MAILER_DRIVER: env.MAILER_DRIVER,
      };
      for (const [name, value] of Object.entries(mockDrivers)) {
        if (value === 'mock' || value === 'memory') {
          ctx.addIssue({
            code: 'custom',
            path: [name],
            message: 'No se permiten adaptadores simulados en producción (ALLOW_MOCK_ADAPTERS)',
          });
        }
      }
    }
  });

export type Env = z.infer<typeof EnvSchema>;

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Configuración inválida:\n${issues.map((issue) => `  - ${issue}`).join('\n')}`);
    this.name = 'ConfigError';
  }
}

/**
 * Valida las variables de entorno. Las cadenas vacías se tratan como no definidas,
 * para que `FOO=` en un `.env` no cuente como valor. Los mensajes nunca incluyen valores.
 */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const cleaned = Object.fromEntries(
    Object.entries(source).filter(([, value]) => value !== undefined && value.trim() !== ''),
  );
  const result = EnvSchema.safeParse(cleaned);
  if (!result.success) {
    throw new ConfigError(
      result.error.issues.map((issue) => `${issue.path.join('.') || '(raíz)'}: ${issue.message}`),
    );
  }
  return result.data;
}
