import {
  AdminCertificateSchema,
  AdminCertificatesResponseSchema,
  AdminEnrollmentsResponseSchema,
  MyCoursesSchema,
  SyncResultsResponseSchema,
  VerificationSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiSend } from './api';
import { useSession } from './session';

/** Verificación pública, «Mis cursos» y gestión de certificados (RF-06). */

export function useVerification(code: string | undefined) {
  return useQuery({
    queryKey: ['verify', code],
    queryFn: () => apiFetch(`/api/verify/${encodeURIComponent(code ?? '')}`, VerificationSchema),
    enabled: Boolean(code),
  });
}

export function useMyCourses() {
  const session = useSession();
  return useQuery({
    queryKey: ['my', 'courses'],
    queryFn: () => apiFetch('/api/my/courses', MyCoursesSchema),
    enabled: session.data?.authenticated === true,
  });
}

export function useAdminCertificates(q: string) {
  return useQuery({
    queryKey: ['admin', 'certificates', q],
    queryFn: () =>
      apiFetch(
        `/api/admin/certificates?${new URLSearchParams({ q }).toString()}`,
        AdminCertificatesResponseSchema,
      ),
    enabled: q.length >= 3,
  });
}

export type CertificateAction =
  | { type: 'reissue'; id: string; recipientName: string }
  | { type: 'revoke'; id: string; reason: string };

export function useCertificateAction() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ type, id, ...body }: CertificateAction) =>
      apiSend(`/api/admin/certificates/${id}/${type}`, 'POST', AdminCertificateSchema, body),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'certificates'] }),
  });
}

export function useResultsReview() {
  return useQuery({
    queryKey: ['admin', 'enrollments', 'review'],
    queryFn: () => apiFetch('/api/admin/enrollments/review', AdminEnrollmentsResponseSchema),
  });
}

export function useManualResult() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, result }: { id: string; result: 'completed' | 'failed_course' }) =>
      apiSend(`/api/admin/enrollments/${id}/result`, 'POST', null, { result }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'enrollments'] }),
  });
}

export function useSyncResults() {
  return useMutation({
    mutationFn: (editionId: string) =>
      apiSend(`/api/admin/editions/${editionId}/sync-results`, 'POST', SyncResultsResponseSchema),
  });
}
