import type { CreateOrderSchema } from '@plataforma/shared';
import {
  CurrentLegalDocumentsSchema,
  IDEMPOTENCY_HEADER,
  OrderSummarySchema,
  ProviderInfoSchema,
  QuoteSchema,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { z } from 'zod';
import { apiFetch, apiSend } from './api';

/** Textos legales vigentes y datos del proveedor (RF-11). */
export function useLegalDocuments() {
  return useQuery({
    queryKey: ['legal', 'current'],
    queryFn: () => apiFetch('/api/legal', CurrentLegalDocumentsSchema),
    staleTime: 5 * 60_000,
  });
}

export function useProviderInfo() {
  return useQuery({
    queryKey: ['legal', 'provider'],
    queryFn: () => apiFetch('/api/legal/provider', ProviderInfoSchema),
    staleTime: 30 * 60_000,
  });
}

export function useQuote(couponCode: string | null) {
  return useQuery({
    queryKey: ['checkout', 'quote', couponCode],
    queryFn: () => apiSend('/api/checkout/quote', 'POST', QuoteSchema, { couponCode }),
    placeholderData: (previous) => previous,
  });
}

/**
 * Confirma la compra. La clave de idempotencia la genera la página una vez: un doble clic o
 * un reintento tras un corte devuelve la misma orden.
 */
export function useCreateOrder(idempotencyKey: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: z.input<typeof CreateOrderSchema>) =>
      apiSend('/api/checkout/orders', 'POST', OrderSummarySchema, input, {
        [IDEMPOTENCY_HEADER]: idempotencyKey,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['cart'] }),
  });
}

export function useOrder(number: string | undefined) {
  return useQuery({
    queryKey: ['orders', number],
    queryFn: () => apiFetch(`/api/orders/${number}`, OrderSummarySchema),
    enabled: number !== undefined,
  });
}
