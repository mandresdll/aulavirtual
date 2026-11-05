import {
  AdminDocumentSchema,
  DocumentsResponseSchema,
  ReconciliationResponseSchema,
  ReconciliationRunSchema,
  ReportSchema,
  SalesResponseSchema,
  type DocumentExport,
  type DocumentsQuery,
  type ReportQuery,
  type SalesQuery,
} from '@plataforma/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiDownload, apiFetch, apiSend } from './api';

/** Ventas, documentos, conciliación y reportes (RF-08, RF-09). */

export function toQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

export function useSales(query: SalesQuery) {
  return useQuery({
    queryKey: ['admin', 'sales', query],
    queryFn: () => apiFetch(`/api/admin/sales?${toQueryString(query)}`, SalesResponseSchema),
    placeholderData: keepPreviousData,
  });
}

export function useDocuments(query: DocumentsQuery) {
  return useQuery({
    queryKey: ['admin', 'documents', query],
    queryFn: () =>
      apiFetch(`/api/admin/documents?${toQueryString(query)}`, DocumentsResponseSchema),
    placeholderData: keepPreviousData,
  });
}

function useInvalidateDocuments() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: ['admin', 'documents'] });
}

export function useExportDocuments() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (input: DocumentExport) =>
      apiDownload('/api/admin/documents/export', input, `documentos.${input.format}`),
    onSuccess: invalidate,
  });
}

export function useRegisterFolio() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: ({ id, folio }: { id: string; folio: string }) =>
      apiSend(`/api/admin/documents/${id}/folio`, 'POST', AdminDocumentSchema, { folio }),
    onSuccess: invalidate,
  });
}

export function useRetryDocument() {
  const invalidate = useInvalidateDocuments();
  return useMutation({
    mutationFn: (id: string) =>
      apiSend(`/api/admin/documents/${id}/retry`, 'POST', AdminDocumentSchema),
    onSuccess: invalidate,
  });
}

export function useReconciliation() {
  return useQuery({
    queryKey: ['admin', 'reconciliation'],
    queryFn: () => apiFetch('/api/admin/reconciliation', ReconciliationResponseSchema),
  });
}

export function useRunReconciliation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (day: string) =>
      apiSend('/api/admin/reconciliation', 'POST', ReconciliationRunSchema, { day }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'reconciliation'] }),
  });
}

export function useResolveDiscrepancy() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, note }: { id: string; note: string }) =>
      apiSend(`/api/admin/reconciliation/${id}/resolve`, 'POST', null, { note }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'reconciliation'] }),
  });
}

export function useReport(query: ReportQuery) {
  return useQuery({
    queryKey: ['admin', 'reports', query],
    queryFn: () => apiFetch(`/api/admin/reports?${toQueryString(query)}`, ReportSchema),
    placeholderData: keepPreviousData,
  });
}
