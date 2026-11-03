# Arquitectura

## Componentes

```mermaid
flowchart LR
  subgraph Usuario
    B[Navegador]
  end
  subgraph CFT["Servidor del CFT (docker compose)"]
    P[Proxy inverso institucional<br/>TLS]
    W[web<br/>nginx + SPA React]
    A[api<br/>Fastify]
    K[worker<br/>BullMQ]
    DB[(PostgreSQL 16)]
    R[(Redis 7)]
  end
  subgraph Externos["Sistemas externos (puertos + adaptadores)"]
    PG[Pasarela de pagos<br/>Webpay Plus]
    LMS[Aula Virtual<br/>Moodle WS]
    IDP[IdP institucional<br/>OIDC]
    SGA[API del SGA<br/>roles, validador]
    INV[Boletas/facturas]
    SMTP[SMTP institucional]
  end

  B --> P --> W
  W -- /api --> A
  A --> DB
  A --> R
  K --> R
  K --> DB
  A --> PG
  A --> IDP
  A --> SGA
  K --> LMS
  K --> SGA
  K --> INV
  K --> SMTP
```

- **web**: nginx sin privilegios que sirve la SPA (assets con hash y caché inmutable) y
  reenvía `/api` a la API. Define la CSP del sitio.
- **api**: Fastify con validación Zod en entrada y salida, OpenAPI en `/api/docs`, cabeceras de
  seguridad (helmet), CORS restringido, rate limit compartido en Redis, auditoría y manejo de
  errores en español.
- **worker**: el mismo código de la API en otro proceso (`dist/worker.js`); procesa las colas
  BullMQ con reintentos exponenciales (matrícula, certificados, correos, conciliación).
- **migrate**: contenedor de un solo uso que aplica las migraciones de Prisma antes de arrancar
  la API y el worker.

## Puertos y adaptadores

Cada sistema externo se usa a través de una interfaz (puerto) en
`apps/api/src/integrations/<sistema>/port.ts`, con un adaptador simulado y uno real. El
adaptador se elige con una variable `*_DRIVER` validada al arranque. Los módulos de dominio
solo conocen el puerto: cambiar de pasarela o confirmar el contrato del SGA no toca la lógica
de negocio. Detalle en [integraciones.md](integraciones.md).

## Flujo principal (objetivo, se construye en las fases 3 a 6)

```mermaid
sequenceDiagram
  actor C as Comprador
  participant W as SPA
  participant A as API
  participant G as Pasarela
  participant Q as Worker
  participant M as Moodle
  C->>W: Checkout (acepta términos)
  W->>A: POST /api/checkout
  A->>A: Reserva cupo (TTL) + orden awaiting_payment
  A->>G: createTransaction
  A-->>W: redirectUrl
  C->>G: Paga (datos de tarjeta solo en la pasarela)
  G-->>A: Retorno con token
  A->>G: commit(token) (confirmación server-side, idempotente)
  A->>A: Orden paid + inscripción pending_lms
  A->>Q: Encola enroll-user
  Q->>M: Busca/crea usuario + matricula
  Q->>C: Correo de bienvenida
  Q->>M: (programado) consulta aprobación
  Q->>C: Certificado PDF con QR
```

## Máquinas de estado (definidas en la especificación, se implementan en las fases 3 a 6)

```mermaid
stateDiagram-v2
  [*] --> pending
  pending --> awaiting_payment
  awaiting_payment --> paid
  awaiting_payment --> failed
  awaiting_payment --> cancelled: timeout/abandono
  paid --> refund_requested
  refund_requested --> refunded
  refund_requested --> partially_refunded
```

```mermaid
stateDiagram-v2
  [*] --> pending_lms
  pending_lms --> enrolled
  pending_lms --> failed: reintentos agotados
  failed --> pending_lms: reintento manual
  enrolled --> completed: aprobó
  enrolled --> failed_course: reprobó
  enrolled --> withdrawn
```

## Decisiones de la Fase 0

| Decisión                                       | Motivo                                                                                                                                        |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Prisma 6 como ORM                              | Lo nombra la especificación; migraciones maduras. Prisma 7+ cambió a cliente ESM con adaptadores: se evaluará al estabilizarse.               |
| Zod 4 + `fastify-type-provider-zod` 6          | Un solo esquema genera validación, tipos y OpenAPI. Los esquemas que comparte la SPA viven en `packages/shared`.                              |
| Configuración validada al arranque             | La API no arranca si falta una variable; en `production` se bloquean los adaptadores simulados.                                               |
| Rate limit con `skipOnError`                   | Si Redis cae, la API sigue atendiendo sin límite y `/api/ready` lo reporta (disponibilidad antes que rechazar todo).                          |
| Pruebas de integración contra servicios reales | PostgreSQL y Redis de compose en local y servicios de GitHub Actions en CI, sin Testcontainers: menos dependencias y el mismo comportamiento. |
| Logs sin datos personales                      | pino redacta tokens, credenciales y datos personales, y quita la query string de las URLs.                                                    |
