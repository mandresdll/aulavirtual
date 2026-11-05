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

| Puerto                 | Variable                       | Adaptadores              | Estado                                                        | Pregunta abierta |
| ---------------------- | ------------------------------ | ------------------------ | ------------------------------------------------------------- | ---------------- |
| `PaymentGateway`       | `PAYMENT_GATEWAY_DRIVER`       | `mock`, `webpay`         | **Webpay listo** (falta probar con Transbank, ver abajo)      | Q1               |
| `LmsGateway`           | `LMS_DRIVER`                   | `mock`, `moodle`         | **Moodle listo** (falta probar con un Moodle real, ver abajo) | Q4               |
| `IdentityProvider`     | `IDENTITY_DRIVER`              | `mock`, `oidc`           | **OIDC real listo** (falta registrar el cliente en el IdP)    | Q2, Q3           |
| `SgaGateway`           | `SGA_DRIVER`                   | `mock`, `http`           | HTTP listo sobre un **contrato supuesto**                     | Q7               |
| `CertificateValidator` | `CERTIFICATE_VALIDATOR_DRIVER` | `mock`, `sga`            | Mock listo; SGA en Fase 6                                     | Q5               |
| `InvoicingGateway`     | `INVOICING_DRIVER`             | `mock`, `export`, `http` | Mock listo; export/http en Fase 7                             | Q6               |
| `Mailer`               | `MAILER_DRIVER`                | `smtp`, `memory`         | **SMTP real listo** (Mailpit en desarrollo)                   | Q9               |
| `AiAssistant`          | `AI_ASSISTANT_DRIVER`          | `disabled`               | Sin IA en esta entrega (EX-04)                                | —                |

## Pasarela de pagos — `PaymentGateway`

- **Operaciones**: `createTransaction`, `commit`, `getStatus`, `refund`.
- **Supuesto (Q1)**: Transbank Webpay Plus con `transbank-sdk`, ambiente de integración.
- **Adaptador real** (`payment-gateway/webpay.ts`, Fase 4):
  - El comprador llega a Webpay por POST con `token_ws`. El dominio de Webpay está en
    `form-action` de la CSP (`infra/web/security-headers.conf`).
  - Vuelve a `{PUBLIC_WEB_URL}/api/payments/return` por GET o POST: con `token_ws` en el flujo
    normal, con `TBK_TOKEN` si anuló y solo con `TBK_ORDEN_COMPRA` si se agotó el tiempo.
  - Un 4xx de Transbank es definitivo; lo demás se considera reintentable.
  - **Verificado solo contra un servidor falso** que imita a Transbank (`webpay.test.ts`,
    mismo contrato que el mock). Falta correr `payment-gateway.contract.ts` y una compra real
    en el ambiente de integración de Transbank; ahí se confirmarán en particular los
    parámetros de retorno.
- **Variables**: `WEBPAY_ENVIRONMENT`, `WEBPAY_COMMERCE_CODE`, `WEBPAY_API_KEY`.
- **Reglas que ya modela el mock**: un segundo `commit` del mismo token falla (la plataforma
  debe ser idempotente por su cuenta, regla 9); las devoluciones no superan lo pagado; una
  devolución total es `reversed` y las parciales `nullified`/`partially_nullified`.
- **Solo se guardan** los últimos 4 dígitos y los datos que entrega la pasarela; nunca datos de
  tarjeta (flujo de redirección).
- **Por confirmar**: pasarela contratada, código de comercio y llaves, URL de retorno
  autorizada, política de anulación (reversa el mismo día o anulación), y hasta cuándo se
  puede devolver una venta (Webpay limita el plazo de las anulaciones).

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
- **Adaptador real** (`lms/moodle.ts`, Fase 5):
  - Moodle responde 200 también en los errores: `{ exception, errorcode, message }` se trata
    como definitivo. Un corte o un 5xx se reintenta.
  - Un curso sin criterios de finalización (`nocriteriaset`) cuenta como no completado.
  - **Verificado solo contra un Moodle falso** (`moodle.test.ts`, mismo contrato que el mock).
    Falta correr `lms.contract.ts` contra un Moodle real con el token de servicio.
- **Supuestos de la matrícula (Q4)**:
  - Se busca al usuario por correo. Si no existe, se crea con el correo como `username`,
    autenticación `manual`, y Moodle genera la contraseña y la envía.
  - El `id` del curso de Moodle se configura en cada edición (`moodleCourseId`). Sin él, la
    inscripción queda `failed` con un mensaje claro y el panel avisa en la edición.
- **Por confirmar**: versión y URL, token de servicio, criterio de aprobación (finalización o
  nota mínima), formato de `username` para usuarios externos, si los usuarios de la comunidad CFT
  ya existen en Moodle (y con qué campo se cruzan), y si se deben crear con otro método de
  autenticación (p. ej. el mismo SSO).

## Proveedor de identidad — `IdentityProvider`

- **Operaciones**:
  - `createAuthorizationRequest`: genera `state`, `nonce` y el verificador PKCE.
  - `completeAuthorization`: valida `state`, PKCE, `nonce` y la firma del ID Token, y
    devuelve los claims.
  - `getLogoutUrl`: arma el cierre de sesión en el IdP con `id_token_hint`.
- **Adaptador real** (`identity/oidc.ts`, Fase 2):
  - Usa `openid-client` v6 con Authorization Code + PKCE S256. El cliente se autentica en el
    IdP con `client_secret_post`.
  - Descubre la configuración del IdP en `/.well-known/openid-configuration` y la reutiliza.
    Si el IdP no responde, el siguiente intento vuelve a descubrirla.
  - Exige el claim `email`. Toma `name`, o lo arma con `given_name` + `family_name`.
  - Probado contra un emisor OIDC falso, dentro de la prueba, que firma con RS256 y valida
    PKCE, el secreto y `redirect_uri` (`oidc.test.ts`).
- **Adaptador simulado**: página `/api/dev/mock-idp/authorize` con las identidades de
  `mock-identities.ts`. Solo existe con `IDENTITY_DRIVER=mock`, y la configuración bloquea los
  mocks en producción.
- **Supuesto vigente (Q2)**: el IdP del SGA es OIDC estándar. Si resulta ser SAML, se agrega
  otro adaptador con el mismo contrato: las sesiones, los roles y el panel no cambian.
- **Variables**:
  - `OIDC_ISSUER_URL`, `OIDC_CLIENT_ID`, `OIDC_CLIENT_SECRET`, `OIDC_SCOPES`.
  - `OIDC_REDIRECT_URI`, que debe ser `{PUBLIC_WEB_URL}/api/auth/callback`.
- **Datos que se guardan** (Ley 21.719, minimización): `sub`, el correo y el nombre. El ID
  Token queda solo en la sesión de Redis, para el cierre de sesión en el IdP.
- **Por confirmar con la UTA (Q2)**:
  - Qué IdP usan (Entra ID, Google, Keycloak…).
  - Registrar el cliente y las URL de retorno y de cierre de sesión (staging y producción).
  - Si el IdP entrega `email` verificado para todos los usuarios.
  - Si el `sub` es estable o conviene cruzar por otro claim (p. ej. RUT o id del SGA).
  - Si ofrece `end_session_endpoint`.
- **Q3, compradores externos (abierta, bloquea la venta a público general)**:
  - El checkout (Fase 3) exige una sesión del IdP institucional. Un usuario que el SGA no
    conoce puede ingresar (entra sin roles) y comprar, pero solo si el IdP le permite
    autenticarse.
  - Si el IdP del CFT no admite cuentas externas, falta un camino de registro. Se puede
    hacer con un adaptador que las cree vía la API del SGA o con cuentas locales mínimas
    activadas por flag. Ambos usarían el mismo puerto `IdentityProvider`, sin cambiar el
    checkout.
  - **Hay que definirlo con la UTA antes de vender a público externo.**

## API del SGA — `SgaGateway`

- **Operación**: `getUserRoles(subject)` → `sgaUserId`, perfiles institucionales (`student`,
  `teacher`, `staff`) y roles de la plataforma (`uta_admin`, `uta_editor`, `uta_finance`,
  `uta_reports`, `buyer`, `community_member`).
- **Contrato supuesto (Q7)**, implementado en `sga/http.ts`:

  ```http
  GET {SGA_API_URL}/users/{subject}/roles
  Authorization: Bearer {SGA_API_TOKEN}

  200 { "sgaUserId": "SGA-77", "profiles": ["staff"], "roles": ["uta_admin", "community_member"] }
  404 → el SGA no conoce al usuario (entra sin roles)
  ```

- **Mapeo**: los perfiles y roles que la plataforma no conoce se descartan (deny by default):
  un rol nuevo del SGA no da permisos hasta mapearlo de forma explícita.
- **Errores**: una caída, un timeout de 5 s o un 5xx cuentan como error reintentable; una
  respuesta mal formada, como error definitivo. En ambos casos el login no se completa y las
  rutas protegidas responden 503: nunca se asumen permisos.
- **Caché**: Redis `cache:sga:roles:v1:{subject}` por `SGA_ROLES_CACHE_TTL_SECONDS` (300 s
  por defecto). Se refresca en cada inicio de sesión. Un rol quitado en el SGA deja de regir a
  lo más al vencer la caché.
- **Variables**: `SGA_API_URL`, `SGA_API_TOKEN`, `SGA_ROLES_CACHE_TTL_SECONDS`.
- **Prueba de contrato**: `sga.contract.ts` corre contra el mock y contra un SGA falso por
  HTTP. Debe correr contra el SGA real cuando exista su ambiente de pruebas.
- **Por confirmar con la UTA (Q7)**:
  - Documentación de la API y autenticación servicio a servicio (token, mTLS, OAuth client
    credentials…).
  - Con qué identificador se consulta (`sub` del IdP, RUT u otro).
  - Cómo expresa el SGA los roles y su correspondencia con los de la plataforma. Si usa otros
    nombres, se agrega una tabla de equivalencias en el adaptador.

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

## Datos del proveedor (Ley 19.496)

El pie del sitio y el checkout muestran los datos del CFT como proveedor. Vienen de las
variables `SELLER_NAME`, `SELLER_RUT`, `SELLER_ADDRESS`, `SELLER_EMAIL` y `SELLER_PHONE`.
Mientras no se configuren, se muestra «Por confirmar». **Hay que completarlas con los datos
oficiales del CFT antes de producción.**

## Textos legales (RF-11, Q10)

- El seed de desarrollo carga borradores base (versión `2026.0-borrador`, marcados como
  borrador en el propio texto) con el retracto de 10 días del supuesto de Q10.
- Las versiones oficiales las publica el CFT desde `/admin/legales`.
- Mientras falte alguno de los cuatro textos, la API rechaza el checkout
  (`LEGAL_NOT_CONFIGURED`).

## Preguntas abiertas y supuestos vigentes

| #   | Pregunta                                                  | Supuesto en uso                                                        |
| --- | --------------------------------------------------------- | ---------------------------------------------------------------------- |
| Q1  | Pasarela contratada y credenciales de integración         | Webpay Plus, ambiente de integración                                   |
| Q2  | IdP del SGA y protocolo                                   | OIDC estándar, Authorization Code + PKCE (adaptador listo)             |
| Q3  | Cuentas de compradores externos vs. "sin bases paralelas" | Checkout con sesión del IdP; registro de externos pendiente de definir |
| Q4  | Moodle: versión, token, funciones, criterio de aprobación | Moodle 4.x, `enrol_manual`, aprobación por finalización                |
| Q5  | Validador de certificados del SGA                         | Verificación propia + publicación en el validador                      |
| Q6  | Sistema de boletas/facturas, formato, IVA                 | Exportación CSV/XLSX; tratamiento tributario por edición               |
| Q7  | API del SGA para roles                                    | `GET /users/{subject}/roles` con token Bearer (contrato supuesto)      |
| Q8  | Identidad gráfica                                         | Tokens provisorios en burdeo (`apps/web/src/styles.css`)               |
| Q9  | Servidores, proxy, SMTP                                   | Linux + Docker Compose v2 + nginx                                      |
| Q10 | Retracto y devoluciones                                   | 10 días (art. 3 bis Ley 19.496); textos versionados en el panel        |
