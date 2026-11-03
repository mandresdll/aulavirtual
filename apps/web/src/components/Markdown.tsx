import MarkdownIt from 'markdown-it';
import { useMemo } from 'react';

/**
 * Markdown sin HTML: `html: false` escapa cualquier etiqueta escrita en el texto y markdown-it
 * rechaza enlaces `javascript:`/`data:`. Así los textos del panel no pueden inyectar código
 * (sanitización, RF-07/RF-11).
 */
const markdown = new MarkdownIt({ html: false, linkify: true, typographer: true });

export function Markdown({ source, className = '' }: { source: string; className?: string }) {
  const html = useMemo(() => markdown.render(source), [source]);
  return (
    <div
      className={`markdown space-y-3 [&_a]:text-brand-700 [&_a]:underline [&_blockquote]:border-l-4 [&_blockquote]:border-accent-500 [&_blockquote]:bg-surface-muted [&_blockquote]:p-3 [&_h2]:mt-6 [&_h2]:text-xl [&_h2]:font-bold [&_h3]:mt-4 [&_h3]:font-semibold [&_ol]:list-decimal [&_ol]:pl-6 [&_ul]:list-disc [&_ul]:pl-6 ${className}`}
      // HTML generado por markdown-it con `html: false` (sin etiquetas del autor).
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
