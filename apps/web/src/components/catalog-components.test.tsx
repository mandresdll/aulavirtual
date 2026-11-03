import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import {
  editionAvailability,
  filtersFromSearchParams,
  searchParamsFromFilters,
} from '../lib/catalog';
import { edition } from '../test-fixtures';
import { CourseFilters } from './CourseFilters';
import { pageWindow } from '../lib/pagination';

// La navegación real (cambio de URL al buscar) se prueba en E2E: en jsdom, React Router no
// puede crear el Request de una navegación (AbortSignal de jsdom incompatible con Node).
describe('CourseFilters', () => {
  const areas = [{ slug: 'ti', name: 'Tecnologías', description: null, courseCount: 2 }];

  it('submits the chosen filters', async () => {
    const onSubmit = vi.fn();
    render(
      <CourseFilters defaultValues={{}} areas={areas} onSubmit={onSubmit} onClear={vi.fn()} />,
    );
    await userEvent.type(screen.getByLabelText('Buscar por nombre o tema'), 'excel');
    await userEvent.selectOptions(screen.getByLabelText('Área'), 'ti');
    await userEvent.selectOptions(screen.getByLabelText('Modalidad'), 'Presencial');
    await userEvent.click(screen.getByRole('button', { name: 'Buscar' }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0]?.[0]).toMatchObject({
      q: 'excel',
      area: 'ti',
      modality: 'in_person',
    });
  });

  it('shows the current filters and clears them', async () => {
    const onClear = vi.fn();
    render(
      <CourseFilters
        defaultValues={{ q: 'web', area: 'ti' }}
        areas={areas}
        onSubmit={vi.fn()}
        onClear={onClear}
      />,
    );
    expect(screen.getByLabelText('Buscar por nombre o tema')).toHaveValue('web');
    expect(screen.getByLabelText('Área')).toHaveValue('ti');
    expect(screen.getByRole('search', { name: 'Buscar cursos' })).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: 'Limpiar filtros' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('catalog URL state', () => {
  it('reads valid filters from the URL and drops invalid ones', () => {
    const query = filtersFromSearchParams(
      new URLSearchParams('q=web&modality=hibrida&area=ti&page=2&from=2026-99-01'),
    );
    expect(query).toEqual({ q: 'web', area: 'ti', page: 2, pageSize: 12 });
  });

  it('writes only non-empty filters and pages after the first', () => {
    expect(searchParamsFromFilters({ q: ' web ', area: '', modality: 'online' }).toString()).toBe(
      'q=web&modality=online',
    );
    expect(searchParamsFromFilters({ q: 'web' }, 3).toString()).toBe('q=web&page=3');
  });
});

describe('editionAvailability', () => {
  const now = new Date('2026-06-01T12:00:00Z');

  it('distinguishes open, last seats and sold out', () => {
    expect(editionAvailability(edition({ availableSeats: 12 }), now)).toBe('open');
    expect(editionAvailability(edition({ availableSeats: 5 }), now)).toBe('last_seats');
    expect(editionAvailability(edition({ availableSeats: 0 }), now)).toBe('sold_out');
  });

  it('distinguishes upcoming and closed enrollment periods', () => {
    expect(
      editionAvailability(
        edition({ enrollmentOpen: false, enrollmentOpensAt: '2026-07-01T00:00:00.000Z' }),
        now,
      ),
    ).toBe('upcoming');
    expect(editionAvailability(edition({ enrollmentOpen: false }), now)).toBe('closed');
  });
});

describe('pageWindow', () => {
  it('keeps first, last and neighbours with gaps in between', () => {
    expect(pageWindow(1, 1)).toEqual([1]);
    expect(pageWindow(5, 10)).toEqual([1, 'gap', 4, 5, 6, 'gap', 10]);
    expect(pageWindow(2, 4)).toEqual([1, 2, 3, 4]);
  });
});
