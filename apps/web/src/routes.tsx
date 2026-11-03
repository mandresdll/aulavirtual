import type { RouteObject } from 'react-router';
import { Layout } from './components/Layout';
import { HomePage } from './pages/HomePage';
import { NotFoundPage } from './pages/NotFoundPage';

export const routes: RouteObject[] = [
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <HomePage /> },
      {
        path: 'admin',
        lazy: async () => {
          const { AdminHomePage } = await import('./pages/admin/AdminHomePage');
          return { Component: AdminHomePage };
        },
      },
      { path: '*', element: <NotFoundPage /> },
    ],
  },
];
