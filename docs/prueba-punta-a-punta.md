# Prueba de punta a punta

Guion para probar un curso real de la UTA, desde la publicación hasta el certificado. Es uno de los
criterios de término de la entrega.

**Estado: la prueba con sistemas reales no se ha hecho.** Hoy el flujo solo está probado con
adaptadores simulados. La columna «Prueba real» se completa en el ambiente de pruebas del CFT.

## Antes de empezar

Se necesita lo siguiente ([pendientes-cft.md](pendientes-cft.md)):

- Ambiente de pruebas instalado ([despliegue.md](despliegue.md)).
- Pasarela en modo pruebas (Q1), Aula Virtual de pruebas con un curso (Q4) y SSO institucional (Q2).
- Datos del CFT y textos legales cargados.
- Dos personas de prueba: una de la comunidad CFT y una externa (Q3).

## Datos de la prueba

| Dato                            | Valor |
| ------------------------------- | ----- |
| Fecha                           |       |
| Responsable                     |       |
| Curso y edición                 |       |
| Id del curso en el Aula Virtual |       |
| Versión desplegada (commit)     |       |

## Pasos

La columna «Con simulación» indica la prueba automática que ya cubre ese paso.

| #   | Paso                                                   | Resultado esperado                                   | Con simulación                     | Prueba real (evidencia) |
| --- | ------------------------------------------------------ | ---------------------------------------------------- | ---------------------------------- | ----------------------- |
| 1   | Crear y publicar el curso y su edición                 | Aparece en el catálogo con precio y cupos            | `admin.spec.ts`                    |                         |
| 2   | Abrir la ficha con un enlace de campaña                | La visita se cuenta en la campaña                    | `sales.spec.ts`                    |                         |
| 3   | Agregar al carrito e ingresar por SSO                  | El carrito se conserva tras ingresar                 | `checkout.spec.ts`                 |                         |
| 4   | Confirmar con boleta, aceptando los textos             | Orden creada, cupo reservado y aceptación registrada | `checkout.spec.ts`                 |                         |
| 5   | Pagar en la pasarela                                   | «Compra confirmada», confirmada desde el servidor    | `payments.spec.ts`                 |                         |
| 6   | Revisar el correo                                      | Comprobante en PDF                                   | `payments.integration.test.ts`     |                         |
| 7   | Esperar la matrícula                                   | Inscrito en el Aula Virtual y correo de acceso       | `enrollment.integration.test.ts`   |                         |
| 8   | Entrar al Aula Virtual desde **Mis cursos**            | Accede al curso                                      | Solo con el Aula Virtual real      |                         |
| 9   | Completar el curso y pulsar **Sincronizar aprobación** | Inscripción aprobada y certificado emitido           | `certificates.integration.test.ts` |                         |
| 10  | Revisar el correo y **Mis cursos**                     | Certificado en PDF con código y QR                   | `certificates.spec.ts`             |                         |
| 11  | Escanear el QR                                         | «Certificado válido» con los datos correctos         | `certificates.spec.ts`             |                         |
| 12  | Revisar el validador del SGA                           | El certificado aparece publicado                     | Solo con contrato real (Q5)        |                         |
| 13  | Exportar el archivo contable y registrar el folio      | El documento queda emitido                           | `sales.integration.test.ts`        |                         |
| 14  | Correr la conciliación del día                         | Sin diferencias                                      | `sales.integration.test.ts`        |                         |
| 15  | Revisar **Reportes** y **Auditoría**                   | La venta y las acciones aparecen                     | `sales.spec.ts`                    |                         |

## Casos adicionales

| #   | Caso                                                | Resultado esperado                                 | Prueba real (evidencia) |
| --- | --------------------------------------------------- | -------------------------------------------------- | ----------------------- |
| A   | Pago rechazado y reintento                          | La orden sigue pendiente y se puede volver a pagar |                         |
| B   | Abandonar la pasarela                               | Al vencer la reserva, el cupo se libera            |                         |
| C   | Inscripción liberada de una persona de la comunidad | Matrícula sin pago                                 |                         |
| D   | Cupón del 100 %                                     | Matrícula sin pasar por la pasarela                |                         |
| E   | Compra de una persona externa                       | Depende de la definición de Q3                     |                         |
| F   | Devolución total                                    | Pago devuelto, desmatrícula y cupo liberado        |                         |
| G   | Último cupo pedido por dos personas                 | Solo una compra; la otra pasa a la lista de espera |                         |
| H   | Reemisión por error en el nombre                    | Código nuevo; el anterior figura como reemplazado  |                         |

## Cierre

| Pregunta                                    | Respuesta |
| ------------------------------------------- | --------- |
| ¿Se completaron todos los pasos?            |           |
| Problemas encontrados y cómo se resolvieron |           |
| Aprobado por la UTA (nombre y fecha)        |           |
