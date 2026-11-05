# Accesibilidad

Objetivo: WCAG 2.1 nivel AA. Hay dos capas: pruebas automáticas, que corren en cada PR, y una revisión
manual, que debe hacer una persona antes de la entrega.

## Pruebas automáticas

`tests/e2e/accessibility.spec.ts` revisa con axe (WCAG 2.0 y 2.1, niveles A y AA):

- Todas las páginas públicas, a 360, 768 y 1280 px, y que ninguna tenga desplazamiento horizontal.
- Que el primer Tab llegue al enlace «Saltar al contenido principal» y que este funcione.

Los flujos con sesión se revisan en sus propias pruebas: checkout y orden (`checkout.spec.ts`,
`payments.spec.ts`), Mis cursos y panel (`admin.spec.ts`, `certificates.spec.ts`, `sales.spec.ts`).

axe detecta solo una parte de los problemas. Pasar estas pruebas no significa cumplir WCAG.

## Lista de revisión manual

Estado: ✅ comprobado en una prueba automática · ⬜ pendiente de una persona.

### Teclado

| Criterio                                                         | Estado |
| ---------------------------------------------------------------- | ------ |
| El enlace para saltar al contenido es lo primero al pulsar Tab   | ✅     |
| Las tablas anchas del panel se pueden mover con el teclado       | ✅     |
| Todo el flujo de compra se completa sin mouse                    | ⬜     |
| El orden de tabulación sigue el orden visual                     | ⬜     |
| El foco siempre se ve, también sobre el encabezado burdeo        | ⬜     |
| Los diálogos de confirmación atrapan el foco y Escape los cierra | ⬜     |
| Al cerrar un diálogo, el foco vuelve al botón que lo abrió       | ⬜     |

### Lector de pantalla (NVDA o VoiceOver, en español)

| Criterio                                                    | Estado |
| ----------------------------------------------------------- | ------ |
| Se anuncia el título de cada página al cambiar de ruta      | ⬜     |
| Los errores de formulario se leen junto a su campo          | ⬜     |
| Los mensajes de éxito y de carga se anuncian                | ⬜     |
| El estado de cupos y el precio de cada edición se entienden | ⬜     |
| Las tablas de la administración se leen con sus encabezados | ⬜     |

### Visual

| Criterio                                                     | Estado |
| ------------------------------------------------------------ | ------ |
| Contraste de texto AA en las páginas revisadas por axe       | ✅     |
| El sitio funciona con zoom al 200 %                          | ⬜     |
| Nada depende solo del color (estados y errores llevan texto) | ⬜     |
| El gráfico de reportes tiene sus datos en una tabla          | ✅     |

### Contenido

| Criterio                                                           | Estado |
| ------------------------------------------------------------------ | ------ |
| `lang="es-CL"` en el documento                                     | ✅     |
| Las imágenes reales de los cursos tienen un texto alternativo útil | ⬜     |
| Los textos legales oficiales mantienen títulos en orden            | ⬜     |

## Pendiente

- Repetir la revisión con la identidad gráfica oficial (Q8): los colores definitivos pueden cambiar
  el contraste.
- El PDF del certificado y del comprobante no están etiquetados para lectores de pantalla. Los datos
  del certificado también se pueden leer en la página de verificación.
