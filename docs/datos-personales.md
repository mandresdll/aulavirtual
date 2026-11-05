# Datos personales

Inventario y tratamiento de datos personales según las Leyes 19.628 y 21.719. Es un borrador técnico:
el CFT debe validar las finalidades, las bases legales y los plazos.

## Inventario

| Dato                                      | Dónde se guarda                 | Finalidad                                 | Base             | Conservación                            |
| ----------------------------------------- | ------------------------------- | ----------------------------------------- | ---------------- | --------------------------------------- |
| Nombre y correo                           | `users`                         | Cuenta, compra y comunicaciones del curso | Contrato         | Hasta solicitar supresión               |
| RUT y teléfono (opcionales)               | `users`                         | Identificación cuando se requiera         | Contrato         | Hasta solicitar supresión               |
| Identificadores del IdP, SGA y Moodle     | `users`                         | Inicio de sesión y matrícula              | Contrato         | Hasta solicitar supresión               |
| Órdenes, pagos y devoluciones             | `orders`, `payments`, `refunds` | Venta y obligaciones contables            | Obligación legal | Por confirmar: plazo tributario         |
| IP de aceptación de términos              | `orders`                        | Prueba de la aceptación (Ley 19.496)      | Interés legítimo | Hasta solicitar supresión               |
| Datos de factura (RUT, razón social)      | `sales_documents`               | Emisión de la factura                     | Obligación legal | Por confirmar: plazo tributario         |
| Inscripción, resultado y nota             | `enrollments`                   | Matrícula y certificación                 | Contrato         | Por confirmar                           |
| Nombre impreso en el certificado          | `certificates`                  | Verificación pública                      | Contrato         | Mientras el certificado sea válido      |
| Correo y nombre del interesado            | `leads`                         | Novedades                                 | Consentimiento   | Hasta la baja más `LEAD_RETENTION_DAYS` |
| Texto, versión y fecha del consentimiento | `leads`                         | Prueba del consentimiento                 | Obligación legal | Igual que el interesado                 |
| Acciones, IP y navegador del personal     | `audit_logs`                    | Trazabilidad (RF-12)                      | Interés legítimo | Permanente; plazo por confirmar         |

No se guardan datos de tarjeta: el pago ocurre en la pasarela y solo llegan los últimos 4 dígitos.
Las visitas a las fichas son contadores por día y campaña, sin cookies, IP ni usuario. Las UTM viven
en el navegador solo mientras dura la pestaña.

Con terceros se comparte lo mínimo: pasarela (monto y orden), Aula Virtual (nombre y correo), validador
del SGA (nombre, curso, horas, fecha y código) y sistema de boletas (receptor y detalle). Nunca se
envían datos personales a servicios de IA.

## Derechos del titular

Se atienden en `/admin/privacidad`, con el permiso `privacy:manage` (solo `uta_admin`). Quien atiende
debe verificar antes la identidad de la persona. Toda acción queda en la auditoría, sin el correo.

- **Acceso:** «Descargar sus datos» entrega un archivo JSON con todo lo anterior.
- **Rectificación:** el nombre y el correo vienen del SGA. Un certificado se corrige con la reemisión.
- **Supresión:** «Anonimizar» hace lo siguiente, y no se puede deshacer:
  - Reemplaza el nombre y el correo, y borra RUT, teléfono e identificadores del IdP, SGA y Moodle.
  - Borra la IP de aceptación de sus órdenes, su carrito y sus registros de interés.
  - Cancela sus listas de espera y libera sus reservas.
- **Oposición a comunicaciones:** enlace de baja en cada correo, que alcanza a todo el correo.

### Qué se conserva al anonimizar

- **Órdenes, pagos y documentos**, sin nombre ni correo, porque son registros contables. Una factura
  mantiene los datos tributarios del receptor.
- **Certificados emitidos**, con el nombre impreso, para que sigan siendo verificables. Quien no
  quiera eso puede pedir la revocación; el nombre sigue guardado internamente como registro.
- **Auditoría**, que es de solo agregar y puede contener el nombre en cambios ya registrados, como una
  reemisión.

No se puede anonimizar a una persona con una orden o un curso en curso: primero debe terminar o
retirarse.

## Fuera de la plataforma

La anonimización no alcanza a la cuenta del Aula Virtual, el SGA, el sistema de boletas ni los
respaldos, que se eliminan solos al cumplirse `BACKUP_RETENTION_DAYS`. Esas copias se deben gestionar
en cada sistema. Si la persona vuelve a ingresar por SSO, se crea una cuenta nueva.

## Por confirmar con el CFT

- Plazos de conservación de ventas, documentos, inscripciones y auditoría.
- Valor de `LEAD_RETENTION_DAYS` (730 días es provisional).
- Texto oficial de consentimiento y de la política de privacidad.
- Persona responsable de atender las solicitudes.
