# Rendimiento

Objetivo (RNF): páginas públicas en menos de 3 segundos y al menos 300 usuarios simultáneos.

## Qué ya hace la plataforma

- Caché en Redis del catálogo, las fichas y los cupos (`CATALOG_CACHE_TTL_SECONDS`,
  `SEATS_CACHE_TTL_SECONDS`).
- Compresión gzip en nginx.
- Archivos con hash y caché de un año; `index.html` sin caché.
- El panel se carga aparte: el sitio público no descarga su código.
- Imágenes con ancho y alto declarados y carga diferida en los listados.

Las imágenes se indican por URL en el panel, sin conversión automática: quien las sube debe usar WebP
y un tamaño adecuado (alrededor de 1280 px de ancho).

## Prueba de carga

`tests/load/public.js` simula a 300 visitantes que recorren la portada, el catálogo, una búsqueda, una
ficha y la verificación de un certificado, con pausas de 1 a 4 segundos. Sube en 1 minuto, se mantiene
3 y baja en 30 segundos.

Criterios: menos de 1 % de errores, 95 % de las páginas bajo 3 s y 95 % de la API bajo 1 s.

Se ejecuta en GitHub Actions (workflow `Load test`) a mano o cuando cambia la prueba. Para correrla
contra otro servidor, con `k6` instalado:

```bash
k6 run -e BASE_URL=https://staging.example.cl tests/load/public.js
```

En ese servidor hay que subir temporalmente `RATE_LIMIT_MAX`, `VERIFY_RATE_LIMIT_MAX` y
`PAGE_VIEW_RATE_LIMIT_MAX`: todo el tráfico sale de una sola IP.

## Resultado

Pendiente de la primera ejecución en el CI.

## Límites de esta medición

- Corre en una máquina de GitHub con toda la plataforma y k6 juntos, no en el servidor del CFT. Sirve
  de referencia y hay que repetirla en staging (Q9).
- Mide tiempos del servidor: no incluye la descarga por la red ni el tiempo del navegador.
- No incluye compra ni pago, que dependen de la pasarela (Q1). El checkout usa bloqueos por edición:
  conviene medirlo aparte antes de una apertura de inscripciones con mucha demanda.
