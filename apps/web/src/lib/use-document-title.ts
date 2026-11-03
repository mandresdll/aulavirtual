import { useEffect } from 'react';

const SITE_NAME = 'Cursos UTA · CFT Estatal de Magallanes';

/** Título único por página: lo anuncian los lectores de pantalla al navegar (WCAG 2.4.2). */
export function useDocumentTitle(title?: string) {
  useEffect(() => {
    document.title = title ? `${title} | ${SITE_NAME}` : SITE_NAME;
  }, [title]);
}
