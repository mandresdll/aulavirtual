import type { CreateOrderSchema } from '@plataforma/shared';
import {
  CurrentLegalDocumentsSchema,
  IDEMPOTENCY_HEADER,
  OrderSummarySchema,
  ProviderInfoSchema,
  QuoteSchema,
  StartPaymentResponseSchema,
  type StartPaymentResponse,
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
    // Mientras el pago se confirma, el resultado llega solo.
    refetchInterval: (query) =>
      query.state.data?.payment?.status === 'confirming' ? 3_000 : false,
  });
}

export function useStartPayment(number: string) {
  return useMutation({
    mutationFn: () => apiSend(`/api/orders/${number}/pay`, 'POST', StartPaymentResponseSchema),
  });
}

/** Lleva al comprador a la pasarela: Webpay exige un POST con el token. */
export function goToGateway({ redirectUrl, formFields }: StartPaymentResponse) {
  if (!formFields) {
    window.location.assign(redirectUrl);
    return;
  }
  const form = document.createElement('form');
  form.method = 'POST';
  form.action = redirectUrl;
  for (const [name, value] of Object.entries(formFields)) {
    const input = document.createElement('input');
    input.type = 'hidden';
    input.name = name;
    input.value = value;
    form.append(input);
  }
  document.body.append(form);
  form.submit();
}
