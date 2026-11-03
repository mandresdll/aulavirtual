import { expect, test } from '@playwright/test';

/**
 * Flujos del catálogo público (RF-01) y SEO servido por nginx (RF-02) con los datos de
 * demostración del seed. Solo contra el stack completo (E2E_BASE_URL).
 */
test.skip(!process.env.E2E_BASE_URL, 'Requires the full stack (E2E_BASE_URL)');

const COURSE_SLUG = 'programacion-web-con-javascript';
const COURSE_TITLE = 'Programación web con JavaScript';

test('home page shows featured courses that link to their detail page', async ({ page }) => {
  await page.goto('/');
  const featured = page.getByRole('region', { name: 'Cursos destacados' });
  await expect(featured.getByRole('article')).toHaveCount(3);
  await featured.getByRole('link', { name: COURSE_TITLE }).click();
  await expect(page).toHaveURL(`/cursos/${COURSE_SLUG}`);
  await expect(page.getByRole('heading', { level: 1, name: COURSE_TITLE })).toBeVisible();
});

test('catalog search ignores accents and keeps the filters in the URL', async ({ page }) => {
  await page.goto('/cursos');
  await expect(page.getByText('4 cursos encontrados')).toBeVisible();

  await page.getByLabel('Buscar por nombre o tema').fill('PROGRAMACION');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page).toHaveURL('/cursos?q=PROGRAMACION');
  await expect(page.getByText('1 curso encontrado')).toBeVisible();
  await expect(page.getByRole('link', { name: COURSE_TITLE })).toBeVisible();

  // El enlace con filtros se puede compartir: al recargar se conservan.
  await page.reload();
  await expect(page.getByLabel('Buscar por nombre o tema')).toHaveValue('PROGRAMACION');
  await expect(page.getByText('1 curso encontrado')).toBeVisible();

  await page.getByRole('button', { name: 'Limpiar filtros' }).click();
  await expect(page).toHaveURL('/cursos');
  await expect(page.getByText('4 cursos encontrados')).toBeVisible();
});

test('catalog filters by area and modality', async ({ page }) => {
  await page.goto('/cursos');
  await page.getByLabel('Área').selectOption({ label: 'Gestión y emprendimiento (2)' });
  await page.getByLabel('Modalidad').selectOption({ label: 'Presencial' });
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page).toHaveURL('/cursos?area=gestion-y-emprendimiento&modality=in_person');
  await expect(page.getByText('1 curso encontrado')).toBeVisible();
  await expect(
    page.getByRole('link', { name: 'Emprendimiento digital en Magallanes' }),
  ).toBeVisible();
});

test('course page shows editions, prices and real-time seats', async ({ page }) => {
  await page.goto(`/cursos/${COURSE_SLUG}`);
  await expect(page.getByRole('heading', { name: 'Fechas y precios' })).toBeVisible();
  await expect(page.getByText('30 cupos disponibles')).toHaveCount(2);
  await expect(page.getByText('$89.000').first()).toBeVisible();

  await page.goto('/cursos/ciberseguridad-para-el-trabajo');
  await expect(page.getByText('Sin cupos disponibles')).toBeVisible();
  await expect(page.getByText('0 de 2 disponibles')).toBeVisible();
});

test('unknown courses show a Spanish not-found page', async ({ page }) => {
  await page.goto('/cursos/no-existe');
  await expect(page.getByRole('heading', { level: 1, name: 'Curso no encontrado' })).toBeVisible();
});

test('public pages load in under 3 seconds', async ({ page }) => {
  for (const path of ['/', '/cursos', `/cursos/${COURSE_SLUG}`]) {
    const started = Date.now();
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await page.waitForLoadState('networkidle');
    expect(Date.now() - started, `${path} load time`).toBeLessThan(3_000);
  }
});

test.describe('SEO in the HTML served by nginx (before JavaScript runs)', () => {
  test('course page HTML has title, meta tags, canonical and JSON-LD Course', async ({
    request,
  }) => {
    const response = await request.get(`/cursos/${COURSE_SLUG}`);
    expect(response.ok()).toBe(true);
    const html = await response.text();

    expect(html).toContain(`<title>${COURSE_TITLE} | Cursos UTA`);
    expect(html).toMatch(/<meta name="description" content="Aprende a crear sitios web/);
    expect(html).toContain(`/cursos/${COURSE_SLUG}" />`);
    expect(html).toContain('<meta property="og:title"');
    expect(html).toContain('<meta name="twitter:card" content="summary_large_image" />');
    // Un solo <title>: el bloque por defecto no se publica cuando la API responde.
    expect(html.match(/<title>/g)).toHaveLength(1);
    expect(html).not.toContain('<!--#');

    const jsonLd = /<script type="application\/ld\+json">(.*?)<\/script>/s.exec(html)?.[1];
    expect(JSON.parse(jsonLd ?? '{}')).toMatchObject({
      '@context': 'https://schema.org',
      '@type': 'Course',
      name: COURSE_TITLE,
      offers: [
        { priceCurrency: 'CLP', price: 89_000 },
        { priceCurrency: 'CLP', price: 89_000 },
      ],
      hasCourseInstance: [{ courseMode: 'Online' }, { courseMode: 'Online' }],
    });
  });

  test('catalog and home pages get their own titles', async ({ request }) => {
    expect(await (await request.get('/cursos')).text()).toContain(
      '<title>Catálogo de cursos | Cursos UTA',
    );
    expect(await (await request.get('/')).text()).toContain(
      '<title>Cursos UTA · CFT Estatal de Magallanes</title>',
    );
  });

  test('unknown course pages are not indexable', async ({ request }) => {
    const html = await (await request.get('/cursos/no-existe')).text();
    expect(html).toContain('<title>Curso no encontrado | Cursos UTA');
    expect(html).toContain('<meta name="robots" content="noindex, nofollow" />');
  });

  test('sitemap.xml lists the published demo courses', async ({ request }) => {
    const response = await request.get('/sitemap.xml');
    expect(response.headers()['content-type']).toContain('application/xml');
    const xml = await response.text();
    for (const slug of [COURSE_SLUG, 'excel-para-la-gestion', 'ciberseguridad-para-el-trabajo']) {
      expect(xml).toContain(`/cursos/${slug}</loc>`);
    }
  });

  test('robots.txt blocks indexing outside production', async ({ request }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('User-agent: *');
    expect(robots).toMatch(/^Disallow: \/$/m);
  });
});
