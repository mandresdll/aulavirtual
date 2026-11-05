import { CART_MAX_ITEMS, CartResponseSchema, type CartResponse } from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useSyncExternalStore } from 'react';
import { ApiError, apiFetch, apiSend } from './api';
import { useSession } from './session';

/**
 * Carrito (RF-03): sin sesión vive en el navegador (solo ids de edición, sin datos
 * personales); con sesión se guarda en el servidor. Al ingresar, el del navegador se fusiona.
 */

const STORAGE_KEY = 'cursos-uta:carrito';
const CHANGE_EVENT = 'cursos-uta:carrito';
const EMPTY: readonly string[] = [];
let cached: { raw: string | null; ids: readonly string[] } = { raw: null, ids: EMPTY };

function readLocal(): readonly string[] {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return EMPTY;
  }
  if (raw === cached.raw) return cached.ids;
  let ids: readonly string[] = EMPTY;
  try {
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    if (Array.isArray(parsed)) {
      ids = parsed.filter((id): id is string => typeof id === 'string').slice(0, CART_MAX_ITEMS);
    }
  } catch {
    ids = EMPTY;
  }
  cached = { raw, ids };
  return ids;
}

function writeLocal(ids: readonly string[]) {
  try {
    if (ids.length === 0) window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ids));
  } catch {
    // Sin almacenamiento (modo privado estricto): el carrito anónimo no se conserva.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener('storage', onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener('storage', onChange);
  };
}

export function useLocalCartIds(): readonly string[] {
  return useSyncExternalStore(subscribe, readLocal, () => EMPTY);
}

const EMPTY_CART: CartResponse = { items: [], subtotalClp: 0 };

export function useCart() {
  const session = useSession();
  const localIds = useLocalCartIds();
  const authenticated = session.data?.authenticated === true;

  const query = useQuery({
    queryKey: ['cart', authenticated ? 'server' : 'local', authenticated ? [] : localIds],
    queryFn: () =>
      authenticated
        ? apiFetch('/api/cart', CartResponseSchema)
        : localIds.length === 0
          ? Promise.resolve(EMPTY_CART)
          : apiFetch(`/api/cart/preview?editionIds=${localIds.join(',')}`, CartResponseSchema),
    enabled: !session.isPending,
    placeholderData: (previous) => previous,
  });

  return { ...query, authenticated, count: query.data?.items.length ?? localIds.length };
}

export function useCartActions() {
  const queryClient = useQueryClient();
  const session = useSession();
  const authenticated = session.data?.authenticated === true;
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['cart'] });

  const add = useMutation({
    mutationFn: async (editionId: string) => {
      if (authenticated) {
        await apiSend('/api/cart/items', 'POST', CartResponseSchema, { editionId });
        return;
      }
      const ids = readLocal();
      if (ids.includes(editionId)) return;
      if (ids.length >= CART_MAX_ITEMS) {
        throw new ApiError(
          409,
          'CART_FULL',
          `El carrito admite hasta ${CART_MAX_ITEMS} ediciones.`,
        );
      }
      writeLocal([...ids, editionId]);
    },
    onSuccess: invalidate,
  });

  const remove = useMutation({
    mutationFn: async (editionId: string) => {
      if (authenticated) {
        await apiSend(`/api/cart/items/${editionId}`, 'DELETE', CartResponseSchema);
        return;
      }
      writeLocal(readLocal().filter((id) => id !== editionId));
    },
    onSuccess: invalidate,
  });

  return { add, remove };
}

/**
 * Al iniciar sesión, pasa el carrito del navegador al servidor y lo vacía localmente.
 * Se monta una vez en el layout.
 */
export function useMergeLocalCart() {
  const session = useSession();
  const queryClient = useQueryClient();
  const localIds = useLocalCartIds();
  const authenticated = session.data?.authenticated === true;

  useEffect(() => {
    if (!authenticated || localIds.length === 0) return;
    const ids = [...localIds];
    void apiSend('/api/cart/merge', 'POST', CartResponseSchema, { editionIds: ids })
      .then(() => {
        writeLocal([]);
        // La cotización del checkout pudo pedirse antes de la fusión: se vuelve a calcular.
        return Promise.all([
          queryClient.invalidateQueries({ queryKey: ['cart'] }),
          queryClient.invalidateQueries({ queryKey: ['checkout'] }),
        ]);
      })
      .catch(() => {
        // Se reintenta en la próxima carga; el carrito local se conserva.
      });
  }, [authenticated, localIds, queryClient]);
}
