# Integraciones externas

Todas las integraciones siguen el patrón **puerto + adaptador real configurable + adaptador
simulado** (regla 2 de [CLAUDE.md](../CLAUDE.md)). Código en `apps/api/src/integrations/`.

- El adaptador se elige con la variable `*_DRIVER`. `parseEnv` exige las credenciales del
  adaptador real cuando se selecciona y, con `APP_ENV=production`, rechaza los simulados salvo
  `ALLOW_MOCK_ADAPTERS=true`.
- Un adaptador real cuyo contrato no está confirmado lanza `AdapterNotImplementedError`: falla de
  forma visible en vez de simular que funcionó.
- Los contratos de comportamiento compartidos (`*.contract.ts`) se ejecutan contra el mock y se
  ejecutarán contra el adaptador real en su ambiente de pruebas.
- Las identidades de demostración de los mocks de IdP y SGA están en `mock-identities.ts`.

## Resumen

| Puerto                 | Variable                       | Adaptadores              | Estado                                      | Pregunta abierta |
| ---------------------- | ------------------------------ | ------------------------ | ------------------------------------------- | ---------------- |
| `PaymentGateway`       | `PAYMENT_GATEWAY_DRIVER`       | `mock`, `webpay`         | Mock listo; Webpay en Fase 4                | Q1               |
| `LmsGateway`           | `LMS_DRIVER`                   | `mock`, `moodle`         | Mock listo; Moodle en Fase 5                | Q4               |
| `IdentityProvider`     | `IDENTITY_DRIVER`              | `mock`, `oidc`           | Mock listo; OIDC en Fase 2                  | Q2, Q3           |
| `SgaGateway`           | `SGA_DRIVER`                   | `mock`, `http`           | Mock listo; HTTP en Fase 2                  | Q7               |
| `CertificateValidator` | `CERTIFICATE_VALIDATOR_DRIVER` | `mock`, `sga`            | Mock listo; SGA en Fase 6                   | Q5               |
| `InvoicingGateway`     | `INVOICING_DRIVER`             | `mock`, `export`, `http` | Mock listo; export/http en Fase 7           | Q6               |
| `Mailer`               | `MAILER_DRIVER`                | `smtp`, `memory`         | **SMTP real listo** (Mailpit en desarrollo) | Q9               |
| `AiAssistant`          | `AI_ASSISTANT_DRIVER`          | `disabled`               | Sin IA en esta entrega (EX-04)              | —                |

## Pasarela de pagos — `PaymentGateway`

- **Operaciones**: `createTransaction`, `commit`, `getStatus`, `refund`.
- **Supuesto (Q1)**: Transbank Webpay Plus con `transbank-sdk`, ambiente de integración.
- **Variables**: `WEBPAY_ENVIRONMENT`, `WEBPAY_COMMERCE_CODE`, `WEBPAY_API_KEY`.
- **Reglas que ya modela el mock**: un segundo `commit` del mismo token falla (la plataforma
  debe ser idempotente por su cuenta, regla 9); las devoluciones no superan lo pagado; una
  devolución total es `reversed` y las parciales `nullified`/`partially_nullified`.
- **Solo se guardan** los últimos 4 dígitos y los datos que entrega la pasarela; nunca datos de
  tarjeta (flujo de redirección).
- **Por confirmar**: pasarela contratada, código de comercio y llaves, URL de retorno
  autorizada, política de anulación (reversa el mismo día o anulación).

## Aula Virtual — `LmsGateway`

- **Operaciones**: `findUserByEmail`, `createUser`, `enrolUser` (idempotente), `unenrolUser`,
  `isEnrolled`, `getCourseCompletion`.
- **Supuesto (Q4)**: Moodle 4.x, servicio web REST con token, matrícula manual activa y
  aprobación por finalización del curso.
- **Funciones de Moodle que deben habilitarse para el token**: `core_user_get_users_by_field`,
  `core_user_create_users`, `enrol_manual_enrol_users`, `enrol_manual_unenrol_users`,
  `core_enrol_get_enrolled_users`, `core_completion_get_course_completion_status`,
  `gradereport_user_get_grade_items`.
- **Variables**: `MOODLE_URL`, `MOODLE_TOKEN`, `MOODLE_STUDENT_ROLE_ID` (por defecto 5).
- **Por confirmar**: versión y URL, token de servicio, criterio de aprobación (finalización o
  nota mínima), formato de `username` para usuarios externos, si los usuarios de la comunidad CFT
  ya existen en Moodle (y con qué campo se cruzan).

## Proveedor de identidad — `IdentityProvider`

- **Operaciones**: `createAuthorizationRequest` (state, nonce y PKCE), `completeAuthorization`
  (valida state y devuelve los claims), `getLogoutUrl`.
- **Supuesto (Q2)**: OIDC estándar con Authorization Code + PKCE (`openid-client`). Si el IdP
  es SAML, se agrega otro adaptador con el mismo contrato.
- **Variables**: `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`,
  `OIDC_REDIRECT_URI`, `OIDC_SCOPES`.
- **Q3, compradores externos**: la ficha pide cuentas para compradores externos, pero prohíbe
  "bases de usuarios paralelas". Supuesto: los externos se crean o registran en el IdP/SGA vía
  API, con un adaptador alternativo de cuentas locales mínimas desactivado por flag. Se diseña
  en la Fase 2.

## API del SGA — `SgaGateway`

- **Operación**: `getUserRoles(subject)` → perfiles institucionales (`student`, `teacher`,
  `staff`) y roles de la plataforma (`uta_admin`, `uta_editor`, `uta_finance`, `uta_reports`,
  `buyer`, `community_member`).
- **Supuesto (Q7)**: cliente HTTP con token de servicio; caché corta en Redis
  (`SGA_ROLES_CACHE_TTL_SECONDS`).
- **Variables**: `SGA_API_URL`, `SGA_API_TOKEN`.
- **Por confirmar**: documentación de la API, autenticación servicio a servicio, cómo el SGA
  expresa los roles y su correspondencia con los roles de la plataforma.

## Validador de certificados — `CertificateValidator`

- **Operaciones**: `register` (idempotente por código), `revoke`.
- **Supuesto (Q5)**: la plataforma expone su propia verificación pública (`/verificar/:codigo`)
  y además publica cada certificado en el validador del SGA.
- **Variables**: `CERTIFICATE_VALIDATOR_URL`, `CERTIFICATE_VALIDATOR_TOKEN`.
- **Por confirmar**: si el validador recibe certificados o consulta a esta plataforma; los
  campos que exige.

## Boletas y facturas — `InvoicingGateway`

- **Operaciones**: `submit` (idempotente por orden), `getStatus`.
- **Supuesto (Q6)**: exportación CSV/XLSX con formato configurable; si el sistema del CFT
  tiene API, adaptador `http`. Tratamiento tributario (afecto/exento) configurable por edición.
- **Validaciones del mock**: factura exige RUT, giro y dirección; la suma de líneas debe
  coincidir con el total.
- **Variables**: `INVOICING_API_URL`, `INVOICING_API_TOKEN`.
- **Por confirmar**: API o importación de archivos, formato contable, si los cursos están
  afectos o exentos de IVA.

## Correo — `Mailer`

- Adaptador SMTP real con `nodemailer`. En desarrollo usa Mailpit (http://localhost:8025).
- **Variables**: `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_USER`, `SMTP_PASSWORD`,
  `MAIL_FROM`, `UTA_ALERT_EMAIL`.
- **Por confirmar (Q9)**: servidor SMTP institucional, remitente autorizado (SPF/DKIM).

## Asistente de IA — `AiAssistant` (EX-04)

Esta entrega no implementa funciones de IA. El puerto existe para conectar más adelante el
asistente institucional del SGA. Condiciones para cualquier adaptador futuro:

1. Nunca enviar datos personales (nombre, RUT, email, teléfono, notas): el adaptador debe
   rechazar entradas que los contengan.
2. Solo el asistente institucional del SGA, no servicios de IA de terceros directamente.
3. Presupuesto de uso configurable y registro de cada llamada en auditoría.

## Preguntas abiertas y supuestos vigentes

| #   | Pregunta                                                  | Supuesto en uso                                                    |
| --- | --------------------------------------------------------- | ------------------------------------------------------------------ |
| Q1  | Pasarela contratada y credenciales de integración         | Webpay Plus, ambiente de integración                               |
| Q2  | IdP del SGA y protocolo                                   | OIDC estándar                                                      |
| Q3  | Cuentas de compradores externos vs. "sin bases paralelas" | Registro vía API del SGA; cuentas locales tras un flag desactivado |
| Q4  | Moodle: versión, token, funciones, criterio de aprobación | Moodle 4.x, `enrol_manual`, aprobación por finalización            |
| Q5  | Validador de certificados del SGA                         | Verificación propia + publicación en el validador                  |
| Q6  | Sistema de boletas/facturas, formato, IVA                 | Exportación CSV/XLSX; tratamiento tributario por edición           |
| Q7  | API del SGA para roles                                    | HTTP con token de servicio; contrato propio como mock              |
| Q8  | Identidad gráfica                                         | Tokens provisorios en burdeo (`apps/web/src/styles.css`)           |
| Q9  | Servidores, proxy, SMTP                                   | Linux + Docker Compose v2 + nginx                                  |
| Q10 | Retracto y devoluciones                                   | 10 días (art. 3 bis Ley 19.496), textos editables                  |
