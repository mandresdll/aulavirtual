import {
  AdminCampaignSchema,
  AdminCampaignsResponseSchema,
  AdminLeadsResponseSchema,
  type AdminLeadsQuery,
  type CampaignInput,
  type LeadRequest,
} from '@plataforma/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiFetch, apiSend } from './api';
import { readUtm } from './utm';

/** Interesados, bajas, visitas a fichas y novedades (RF-02). */

export function useSubscribeLead() {
  return useMutation({
    mutationFn: (input: LeadRequest) => apiSend('/api/leads', 'POST', null, input),
  });
}

export function useUnsubscribe() {
  return useMutation({
    mutationFn: (token: string) =>
      apiSend(`/api/leads/unsubscribe/${encodeURIComponent(token)}`, 'POST', null),
  });
}

/** Suma una visita a la ficha. Un fallo aquí nunca afecta a quien navega. */
export function useRecordCourseView(slug: string) {
  useEffect(() => {
    const utm = readUtm();
    apiSend(`/api/courses/${encodeURIComponent(slug)}/views`, 'POST', null, {
      ...(utm ? { utm } : {}),
    }).catch(() => undefined);
  }, [slug]);
}

export function useAdminLeads(query: AdminLeadsQuery) {
  const params = new URLSearchParams({ page: String(query.page) });
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  return useQuery({
    queryKey: ['admin', 'leads', query],
    queryFn: () => apiFetch(`/api/admin/leads?${params.toString()}`, AdminLeadsResponseSchema),
    placeholderData: keepPreviousData,
  });
}

export function useCampaigns() {
  return useQuery({
    queryKey: ['admin', 'campaigns'],
    queryFn: () => apiFetch('/api/admin/campaigns', AdminCampaignsResponseSchema),
  });
}

export function useCreateCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CampaignInput) =>
      apiSend('/api/admin/campaigns', 'POST', AdminCampaignSchema, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'campaigns'] }),
  });
}

export function useSendCampaign() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiSend(`/api/admin/campaigns/${id}/send`, 'POST', AdminCampaignSchema),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['admin', 'campaigns'] }),
  });
}
