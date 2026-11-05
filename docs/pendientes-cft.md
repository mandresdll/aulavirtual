# Pendientes para la puesta en marcha

Lo que falta para pasar del código a una plataforma en uso. Casi todo depende de información o accesos
del CFT.

## Definición de terminado

Estado de cada criterio de la especificación (sección 12).

| Criterio                                                     | Estado       | Qué falta                                                               |
| ------------------------------------------------------------ | ------------ | ----------------------------------------------------------------------- |
| RF-01 a RF-12 funcionando con pasarela y Aula Virtual reales | ⬜ Pendiente | Todo probado con adaptadores simulados; faltan Q1, Q2, Q4 y un servidor |
| Un curso real probado de punta a punta                       | ⬜ Pendiente | Guion listo en [prueba-punta-a-punta.md](prueba-punta-a-punta.md)       |
| CI verde                                                     | ✅           | —                                                                       |
| Accesibilidad AA (automática y lista manual)                 | 🟡 Parcial   | Automática lista; falta la [revisión manual](accesibilidad.md)          |
| Rendimiento verificado con k6                                | 🟡 Parcial   | Pasó en GitHub; falta repetirla [en el servidor](rendimiento.md)        |
| Respaldo diario y restauración probada                       | 🟡 Parcial   | Probado en el CI; falta activarlo y definir la copia externa            |
| Documentación, manuales y matriz                             | ✅           | —                                                                       |
| Sin credenciales en el código ni en el historial             | ✅           | gitleaks en cada PR                                                     |

## Preguntas abiertas

| #   | Tema                      | Qué se necesita del CFT                                             | Qué se hace al tenerlo                                                        | Sin esto                                             |
| --- | ------------------------- | ------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ---------------------------------------------------- |
| Q1  | Pasarela                  | Proveedor contratado y credenciales de integración y producción     | Variables `WEBPAY_*`. Otro proveedor requiere un adaptador nuevo              | No se puede cobrar                                   |
| Q2  | Identidad                 | Proveedor, protocolo y credenciales OIDC                            | Variables `OIDC_*`. SAML requiere un adaptador nuevo                          | Nadie puede ingresar                                 |
| Q3  | Compradores externos      | Decidir: crearlos vía SGA o admitir un registro propio              | **Requiere desarrollo.** Hoy toda compra pide sesión del IdP                  | Quien no tenga cuenta institucional no puede comprar |
| Q4  | Aula Virtual              | Versión, URL, token, funciones habilitadas y criterio de aprobación | Variables `MOODLE_*` y probar el adaptador                                    | No hay matrícula automática                          |
| Q5  | Validador de certificados | Contrato de la API, o confirmar que consulta a esta plataforma      | Ajustar `certificate-validator/sga.ts`                                        | La verificación propia sigue funcionando             |
| Q6  | Boletas y facturas        | API o archivo, formato contable, IVA y notas de crédito             | Ajustar columnas o `invoicing/http.ts`                                        | Archivo provisional y folio a mano                   |
| Q7  | Roles del SGA             | Documentación de la API y token de servicio                         | Ajustar `sga/http.ts`                                                         | Sin roles reales no hay acceso al panel              |
| Q8  | Identidad gráfica         | Guía, colores y logos en alta resolución                            | Color desde el panel; logo y diseño del certificado requieren un cambio menor | Se ve con el diseño provisorio                       |
| Q9  | Servidor                  | Sistema operativo, Docker, proxy, SMTP y capacidad                  | Seguir [despliegue.md](despliegue.md)                                         | No hay ambiente de pruebas                           |
| Q10 | Retracto y devoluciones   | Plazo y política definitivos                                        | Cargar los textos en el panel                                                 | Rigen borradores                                     |

El detalle técnico de cada integración está en [integraciones.md](integraciones.md).

## Otros datos del CFT

- Datos del proveedor (`SELLER_*`): RUT, dirección, correo y teléfono. Hoy el pie del sitio dice «Por
  confirmar», y deben estar antes de vender (Ley 19.496).
- Textos legales oficiales: los actuales son borradores.
- Texto de consentimiento para recibir novedades (`LEAD_CONSENT`, cambia con una versión nueva).
- Plazos de conservación de datos, y persona responsable de atender solicitudes de titulares.
- Destino de la copia externa de los respaldos.
- Correo de alertas (`UTA_ALERT_EMAIL`).

## Orden sugerido

1. Definir el servidor (Q9) y levantar staging.
2. Conectar identidad y roles (Q2, Q7): sin esto nadie entra.
3. Conectar pasarela y Aula Virtual en modo pruebas (Q1, Q4).
4. Decidir compradores externos (Q3) y desarrollar lo que resulte.
5. Cargar textos legales, datos del proveedor e identidad gráfica (Q8, Q10).
6. Hacer la prueba de punta a punta, la revisión de accesibilidad y la prueba de carga en staging.
7. Definir boletas y validador (Q5, Q6) y pasar a producción.
