import {
  brandRamp,
  DEFAULT_SITE_SETTINGS,
  SiteSettingsSchema,
  type SiteSettings,
} from '@plataforma/shared';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect } from 'react';
import { apiFetch, apiSend } from './api';

const KEY = ['settings'] as const;

/** Textos y color del sitio. Mientras cargan, o si fallan, rigen los valores por defecto. */
export function useSiteSettings(): SiteSettings {
  const { data } = useQuery({
    queryKey: KEY,
    queryFn: () => apiFetch('/api/settings', SiteSettingsSchema),
    staleTime: 5 * 60_000,
    retry: false,
  });
  return data ?? DEFAULT_SITE_SETTINGS;
}

/** Aplica el color configurado sobre los tokens de `styles.css`. */
export function useBrandColor(color: string) {
  useEffect(() => {
    if (!color) return;
    const ramp = Object.entries(brandRamp(color));
    for (const [name, value] of ramp) document.documentElement.style.setProperty(name, value);
    return () => {
      for (const [name] of ramp) document.documentElement.style.removeProperty(name);
    };
  }, [color]);
}

export function useSaveSettings() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: SiteSettings) =>
      apiSend('/api/admin/settings', 'PUT', SiteSettingsSchema, input),
    onSuccess: (saved) => queryClient.setQueryData(KEY, saved),
  });
}
