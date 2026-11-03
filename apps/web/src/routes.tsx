import type { RouteObject } from 'react-router';
import { Layout } from './components/Layout';
import { CatalogPage } from './pages/CatalogPage';
import { CoursePage } from './pages/CoursePage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { NotFoundPage } from './pages/NotFoundPage';

/**
 * El panel de administración se carga en chunks aparte (code splitting): el sitio público no
 * descarga su código.
 */
export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      { path: 'cursos', element: <CatalogPage /> },
      { path: 'cursos/:slug', element: <CoursePage /> },
      { path: 'ingresar', element: <LoginPage /> },
      {
        path: 'admin',
        lazy: async () => {
          const { AdminLayout } = await import('./pages/admin/AdminApp');
          return { Component: AdminLayout };
        },
        children: [
          {
            index: true,
            lazy: async () => {
              const { AdminHomePage } = await import('./pages/admin/AdminHomePage');
              return { Component: AdminHomePage };
            },
          },
          {
            path: 'cursos',
            lazy: async () => {
              const { CoursesPage } = await import('./pages/admin/CoursesPage');
              return { Component: CoursesPage };
            },
          },
          {
            path: 'cursos/nuevo',
            lazy: async () => {
              const { CourseEditPage } = await import('./pages/admin/CourseEditPage');
              return { Component: CourseEditPage };
            },
          },
          {
            path: 'cursos/:id',
            lazy: async () => {
              const { CourseEditPage } = await import('./pages/admin/CourseEditPage');
              return { Component: CourseEditPage };
            },
          },
          {
            path: 'areas',
            lazy: async () => {
              const { AreasPage } = await import('./pages/admin/AreasPage');
              return { Component: AreasPage };
            },
          },
          {
            path: 'docentes',
            lazy: async () => {
              const { InstructorsPage } = await import('./pages/admin/InstructorsPage');
              return { Component: InstructorsPage };
            },
          },
          {
            path: 'auditoria',
            lazy: async () => {
              const [{ AuditPage }, { RequirePermission }] = await Promise.all([
                import('./pages/admin/AuditPage'),
                import('./pages/admin/AdminApp'),
              ]);
              return {
                Component: () => (
                  <RequirePermission permission="audit:read">
                    <AuditPage />
                  </RequirePermission>
                ),
              };
            },
          },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
