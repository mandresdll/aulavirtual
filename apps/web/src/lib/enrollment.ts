import {
  AdminEnrollmentsResponseSchema,
  AdminWaitlistResponseSchema,
  MyEnrollmentsSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiSend } from './api';
import { useSession } from './session';

/** Inscripción liberada, lista de espera y seguimiento de matrículas (RF-04, RF-05). */

const MY_KEY = ['my', 'enrollments'] as const;

export function useMyEnrollments() {
  const session = useSession();
  return useQuery({
    queryKey: MY_KEY,
    queryFn: () => apiFetch('/api/my/enrollments', MyEnrollmentsSchema),
    enabled: session.data?.authenticated === true,
  });
}

function useRefreshMine() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: MY_KEY }),
      queryClient.invalidateQueries({ queryKey: ['catalog'] }),
    ]);
}

export function useFreeEnrollment() {
  const refresh = useRefreshMine();
  return useMutation({
    mutationFn: (editionId: string) =>
      apiSend('/api/enrollments/free', 'POST', null, { editionId }),
    onSuccess: refresh,
  });
}

export function useJoinWaitlist() {
  const refresh = useRefreshMine();
  return useMutation({
    mutationFn: (editionId: string) => apiSend('/api/waitlist', 'POST', null, { editionId }),
    onSuccess: refresh,
  });
}

export function useLeaveWaitlist() {
  const refresh = useRefreshMine();
  return useMutation({
    mutationFn: (editionId: string) => apiSend(`/api/waitlist/${editionId}`, 'DELETE', null),
    onSuccess: refresh,
  });
}

export function useAdminEnrollments(status: 'failed' | 'pending_lms') {
  return useQuery({
    queryKey: ['admin', 'enrollments', status],
    queryFn: () =>
      apiFetch(`/api/admin/enrollments?status=${status}`, AdminEnrollmentsResponseSchema),
  });
}

export function useRetryEnrollment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiSend(`/api/admin/enrollments/${id}/retry`, 'POST', null),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'enrollments'] }),
  });
}

export function useAdminWaitlist() {
  return useQuery({
    queryKey: ['admin', 'waitlist'],
    queryFn: () => apiFetch('/api/admin/waitlist', AdminWaitlistResponseSchema),
  });
}
