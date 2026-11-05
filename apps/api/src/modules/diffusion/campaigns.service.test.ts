import { describe, expect, it } from 'vitest';
import { renderCampaign } from './campaigns.service.js';

describe('renderCampaign', () => {
  const url = 'https://cursos.example.cl/baja/abc';

  it('always carries the unsubscribe link', () => {
    const { text, html } = renderCampaign('Hola', url);
    expect(text).toContain(url);
    expect(html).toContain(`href="${url}"`);
  });

  it('escapes the message and keeps its paragraphs', () => {
    const { html } = renderCampaign('Uno <b>\nsigue\n\nDos', url);
    expect(html).toContain('<p>Uno &lt;b&gt;<br>sigue</p><p>Dos</p>');
  });
});
