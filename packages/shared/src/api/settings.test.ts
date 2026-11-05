import { describe, expect, it } from 'vitest';
import {
  brandRamp,
  contrastWithWhite,
  DEFAULT_SITE_SETTINGS,
  SiteSettingsSchema,
} from './settings.js';

describe('brand color', () => {
  it('measures contrast like WCAG', () => {
    expect(contrastWithWhite('#000000')).toBeCloseTo(21, 0);
    expect(contrastWithWhite('#ffffff')).toBeCloseTo(1, 0);
    expect(contrastWithWhite('#7a1f3d')).toBeGreaterThan(4.5);
  });

  it('accepts the current color and an empty value', () => {
    const valid = (brandColor: string) =>
      SiteSettingsSchema.safeParse({ ...DEFAULT_SITE_SETTINGS, brandColor }).success;
    expect(valid('#7a1f3d')).toBe(true);
    expect(valid('')).toBe(true);
  });

  it('rejects a color where white text would not be readable', () => {
    const result = SiteSettingsSchema.safeParse({
      ...DEFAULT_SITE_SETTINGS,
      brandColor: '#ffee00',
    });
    expect(result.error?.issues[0]?.message).toContain('muy claro');
  });

  it('rejects anything that is not a color', () => {
    const result = SiteSettingsSchema.safeParse({
      ...DEFAULT_SITE_SETTINGS,
      brandColor: 'red;background:url(x)',
    });
    expect(result.success).toBe(false);
  });

  it('derives lighter and darker tones', () => {
    const ramp = brandRamp('#7a1f3d');
    expect(ramp['--brand-700']).toBe('#7a1f3d');
    expect(contrastWithWhite(ramp['--brand-800'] as string)).toBeGreaterThan(
      contrastWithWhite('#7a1f3d'),
    );
    expect(contrastWithWhite(ramp['--brand-50'] as string)).toBeLessThan(1.2);
  });
});
