import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { CatalogService } from '../catalog/catalog.service.js';
import { headForRoute, renderHead, renderRobots, renderSitemap, routeFromUri } from './seo.js';
import type { SiteInfo } from './seo.js';

export interface SeoRoutesOptions {
  catalog: CatalogService;
  site: SiteInfo;
  now?: () => Date;
}

/**
 * SEO de la SPA (RF-02). nginx pide `/api/seo/head` con la URL original en `X-Original-URI`
 * e inserta la respuesta en el `<head>` del `index.html` (SSI). `/sitemap.xml` y `/robots.txt`
 * se publican en la raíz del sitio mediante nginx.
 */
export const seoRoutes: FastifyPluginAsyncZod<SeoRoutesOptions> = async (app, options) => {
  const { catalog, site } = options;
  const now = options.now ?? (() => new Date());

  app.get(
    '/seo/head',
    {
      schema: {
        tags: ['seo'],
        summary: 'Etiquetas <head> (title, Open Graph, Twitter Card, JSON-LD) de una página',
        description:
          'Uso interno de nginx (SSI). La página se indica en la cabecera X-Original-URI.',
        headers: z.object({ 'x-original-uri': z.string().max(2048).optional() }),
        produces: ['text/html'],
      },
    },
    async (request, reply) => {
      const route = routeFromUri(request.headers['x-original-uri']);
      const tags = await headForRoute(route, (slug) => catalog.getCourse(slug), site, now());
      return reply
        .type('text/html; charset=utf-8')
        .header('cache-control', 'no-store')
        .send(renderHead(tags, site));
    },
  );

  app.get(
    '/seo/sitemap.xml',
    {
      schema: {
        tags: ['seo'],
        summary: 'Mapa del sitio con las páginas públicas y los cursos publicados',
        produces: ['application/xml'],
      },
    },
    async (_request, reply) => {
      const xml = renderSitemap(await catalog.sitemapEntries(), site);
      return reply
        .type('application/xml; charset=utf-8')
        .header('cache-control', 'public, max-age=3600')
        .send(xml);
    },
  );

  app.get(
    '/seo/robots.txt',
    {
      schema: {
        tags: ['seo'],
        summary: 'robots.txt (bloquea todo si SEO_ALLOW_INDEXING=false)',
        produces: ['text/plain'],
      },
    },
    async (_request, reply) =>
      reply
        .type('text/plain; charset=utf-8')
        .header('cache-control', 'public, max-age=3600')
        .send(renderRobots(site)),
  );
};
