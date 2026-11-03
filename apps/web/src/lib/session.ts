import {
  LogoutResponseSchema,
  SessionResponseSchema,
  type SessionResponse,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiSend, setCsrfToken } from './api';

export const SESSION_QUERY_KEY = ['auth', 'session'] as const;

/** Sesión del navegador (RF-10). Si la API no responde, se trata como visitante anónimo. */
export function useSession() {
  return useQuery({
    queryKey: SESSION_QUERY_KEY,
    queryFn: async (): Promise<SessionResponse> => {
      const session = await apiFetch('/api/auth/session', SessionResponseSchema);
      setCsrfToken(session.authenticated ? session.csrfToken : null);
      return session;
    },
    staleTime: 60_000,
    retry: false,
  });
}

/** URL de inicio de sesión (navegación completa: redirige al IdP institucional). */
export function loginUrl(returnTo: string): string {
  return `/api/auth/login?${new URLSearchParams({ returnTo }).toString()}`;
}

export function useLogout() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiSend('/api/auth/logout', 'POST', LogoutResponseSchema),
    onSettled: (result) => {
      setCsrfToken(null);
      queryClient.clear();
      // Cierre de sesión también en el IdP cuando lo ofrece; si no, a la portada.
      window.location.assign(result?.logoutUrl ?? '/');
    },
  });
}
