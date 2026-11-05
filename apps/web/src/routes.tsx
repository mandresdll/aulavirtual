import type { RouteObject } from 'react-router';
import { Layout } from './components/Layout';
import { CartPage } from './pages/CartPage';
import { CatalogPage } from './pages/CatalogPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { CoursePage } from './pages/CoursePage';
import { HomePage } from './pages/HomePage';
import { LegalPage } from './pages/LegalPage';
import { LoginPage } from './pages/LoginPage';
import { MyCoursesPage } from './pages/MyCoursesPage';
import { NotFoundPage } from './pages/NotFoundPage';
import { OrderPage } from './pages/OrderPage';
import { UnsubscribePage } from './pages/UnsubscribePage';
import { VerifyPage } from './pages/VerifyPage';

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
      { path: 'carrito', element: <CartPage /> },
      { path: 'checkout', element: <CheckoutPage /> },
      { path: 'ordenes/:number', element: <OrderPage /> },
      { path: 'mis-cursos', element: <MyCoursesPage /> },
      { path: 'verificar', element: <VerifyPage /> },
      { path: 'verificar/:codigo', element: <VerifyPage /> },
      { path: 'baja/:token', element: <UnsubscribePage /> },
      { path: 'legal/:slug', element: <LegalPage /> },
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
            path: 'inscripciones',
            lazy: async () => {
              const [{ EnrollmentsPage }, { RequirePermission }] = await Promise.all([
                import('./pages/admin/EnrollmentsPage'),
                import('./pages/admin/AdminApp'),
              ]);
              return {
                Component: () => (
                  <RequirePermission permission="enrollments:manage">
                    <EnrollmentsPage />
                  </RequirePermission>
                ),
              };
            },
          },
          {
            path: 'certificados',
            lazy: async () => {
              const [{ CertificatesPage }, { RequirePermission }] = await Promise.all([
                import('./pages/admin/CertificatesPage'),
                import('./pages/admin/AdminApp'),
              ]);
              return {
                Component: () => (
                  <RequirePermission permission="certificates:manage">
                    <CertificatesPage />
                  </RequirePermission>
                ),
              };
            },
          },
          {
            path: 'cupones',
            lazy: async () => {
              const [{ CouponsPage }, { RequirePermission }] = await Promise.all([
                import('./pages/admin/CouponsPage'),
                import('./pages/admin/AdminApp'),
              ]);
              return {
                Component: () => (
                  <RequirePermission permission="coupons:manage">
                    <CouponsPage />
                  </RequirePermission>
                ),
              };
            },
          },
          {
            path: 'ordenes',
            lazy: async () => {
              const [{ OrdersPage }, { RequirePermission }] = await Promise.all([
                import('./pages/admin/OrdersPage'),
                import('./pages/admin/AdminApp'),
              ]);
              return {
                Component: () => (
                  <RequirePermission permission="orders:refund">
                    <OrdersPage />
                  </RequirePermission>
                ),
              };
            },
          },
          {
            path: 'documentos',
            lazy: async () => {
              const [{ DocumentsPage }, { RequirePermission }] = await Promise.all([
                import('./pages/admin/DocumentsPage'),
                import('./pages/admin/AdminApp'),
              ]);
              return {
                Component: () => (
                  <RequirePermission permission="sales:manage">
                    <DocumentsPage />
                  </RequirePermission>
                ),
              };
            },
          },
          {
            path: 'conciliacion',
            lazy: async () => {
              const [{ ReconciliationPage }, { RequirePermission }] = await Promise.all([
                import('./pages/admin/ReconciliationPage'),
                import('./pages/admin/AdminApp'),
              ]);
              return {
                Component: () => (
                  <RequirePermission permission="sales:manage">
                    <ReconciliationPage />
                  </RequirePermission>
                ),
              };
            },
          },
          {
            path: 'reportes',
            lazy: async () => {
              const [{ ReportsPage }, { RequirePermission }] = await Promise.all([
                import('./pages/admin/ReportsPage'),
                import('./pages/admin/AdminApp'),
              ]);
              return {
                Component: () => (
                  <RequirePermission permission="reports:read">
                    <ReportsPage />
                  </RequirePermission>
                ),
              };
            },
          },
          {
            path: 'difusion',
            lazy: async () => {
              const [{ DiffusionPage }, { RequirePermission }] = await Promise.all([
                import('./pages/admin/DiffusionPage'),
                import('./pages/admin/AdminApp'),
              ]);
              return {
                Component: () => (
                  <RequirePermission permission="diffusion:manage">
                    <DiffusionPage />
                  </RequirePermission>
                ),
              };
            },
          },
          {
            path: 'privacidad',
            lazy: async () => {
              const [{ PrivacyPage }, { RequirePermission }] = await Promise.all([
                import('./pages/admin/PrivacyPage'),
                import('./pages/admin/AdminApp'),
              ]);
              return {
                Component: () => (
                  <RequirePermission permission="privacy:manage">
                    <PrivacyPage />
                  </RequirePermission>
                ),
              };
            },
          },
          {
            path: 'legales',
            lazy: async () => {
              const [{ LegalAdminPage }, { RequirePermission }] = await Promise.all([
                import('./pages/admin/LegalAdminPage'),
                import('./pages/admin/AdminApp'),
              ]);
              return {
                Component: () => (
                  <RequirePermission permission="legal:manage">
                    <LegalAdminPage />
                  </RequirePermission>
                ),
              };
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
