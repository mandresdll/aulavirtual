import { DataSubjectSummarySchema } from '@plataforma/shared';
import { useMutation } from '@tanstack/react-query';
import { apiDownload, apiSend } from './api';

/** Solicitudes de titulares de datos. Son mutaciones: el correo no debe viajar en la URL. */

export function useSubjectSearch() {
  return useMutation({
    mutationFn: (email: string) =>
      apiSend('/api/admin/data-subjects/search', 'POST', DataSubjectSummarySchema, { email }),
  });
}

export function useExportSubject() {
  return useMutation({
    mutationFn: (email: string) =>
      apiDownload('/api/admin/data-subjects/export', { email }, 'datos-personales.json'),
  });
}

export function useAnonymizeSubject() {
  return useMutation({
    mutationFn: (email: string) =>
      apiSend('/api/admin/data-subjects/anonymize', 'POST', null, { email }),
  });
}
