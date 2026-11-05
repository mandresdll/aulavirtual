import {
  AdminOrderSchema,
  IDEMPOTENCY_HEADER,
  type RefundRequest,
  AdminCouponSchema,
  AdminCouponsResponseSchema,
  AdminLegalDocumentSchema,
  AdminLegalDocumentsResponseSchema,
  type CouponInput,
  type LegalDocumentInput,
  AdminAreaSchema,
  AdminAreasResponseSchema,
  AdminCourseDetailSchema,
  AdminCourseListResponseSchema,
  AdminEditionSchema,
  AdminInstructorSchema,
  AdminInstructorsResponseSchema,
  AuditListResponseSchema,
  type AdminCourseListQuery,
  type AreaInput,
  type AuditQuery,
  type CourseInput,
  type EditionInput,
  type InstructorInput,
} from '@plataforma/shared';
import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch, apiSend } from './api';

/** Consultas y mutaciones del panel de administración (RF-07, RF-12). */

const ADMIN_KEY = ['admin'] as const;

function toQueryString(query: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value));
  }
  return params.toString();
}

/** Tras un cambio, todo lo del panel y el catálogo público se vuelve a pedir. */
function useInvalidateAdmin() {
  const queryClient = useQueryClient();
  return () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ADMIN_KEY }),
      queryClient.invalidateQueries({ queryKey: ['catalog'] }),
    ]);
}

export function useAdminAreas() {
  return useQuery({
    queryKey: [...ADMIN_KEY, 'areas'],
    queryFn: () => apiFetch('/api/admin/areas', AdminAreasResponseSchema),
  });
}

export function useSaveArea() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: AreaInput }) =>
      id
        ? apiSend(`/api/admin/areas/${id}`, 'PUT', AdminAreaSchema, input)
        : apiSend('/api/admin/areas', 'POST', AdminAreaSchema, input),
    onSuccess: invalidate,
  });
}

export function useDeleteArea() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (id: string) => apiSend(`/api/admin/areas/${id}`, 'DELETE', null),
    onSuccess: invalidate,
  });
}

export function useAdminInstructors() {
  return useQuery({
    queryKey: [...ADMIN_KEY, 'instructors'],
    queryFn: () => apiFetch('/api/admin/instructors', AdminInstructorsResponseSchema),
  });
}

export function useSaveInstructor() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: InstructorInput }) =>
      id
        ? apiSend(`/api/admin/instructors/${id}`, 'PUT', AdminInstructorSchema, input)
        : apiSend('/api/admin/instructors', 'POST', AdminInstructorSchema, input),
    onSuccess: invalidate,
  });
}

export function useDeleteInstructor() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (id: string) => apiSend(`/api/admin/instructors/${id}`, 'DELETE', null),
    onSuccess: invalidate,
  });
}

export function useAdminCourses(query: AdminCourseListQuery, enabled = true) {
  return useQuery({
    enabled,
    queryKey: [...ADMIN_KEY, 'courses', query],
    queryFn: () =>
      apiFetch(`/api/admin/courses?${toQueryString(query)}`, AdminCourseListResponseSchema),
    placeholderData: keepPreviousData,
  });
}

export function useAdminCourse(id: string | undefined) {
  return useQuery({
    queryKey: [...ADMIN_KEY, 'course', id],
    queryFn: () => apiFetch(`/api/admin/courses/${id}`, AdminCourseDetailSchema),
    enabled: id !== undefined,
  });
}

export function useSaveCourse() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CourseInput }) =>
      id
        ? apiSend(`/api/admin/courses/${id}`, 'PUT', AdminCourseDetailSchema, input)
        : apiSend('/api/admin/courses', 'POST', AdminCourseDetailSchema, input),
    onSuccess: invalidate,
  });
}

export type CourseStatusAction = 'publish' | 'unpublish' | 'archive';

export function useCourseStatus() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: CourseStatusAction }) =>
      apiSend(`/api/admin/courses/${id}/${action}`, 'POST', AdminCourseDetailSchema),
    onSuccess: invalidate,
  });
}

export function useSaveEdition() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({
      courseId,
      id,
      input,
    }: {
      courseId: string;
      id?: string;
      input: EditionInput;
    }) =>
      id
        ? apiSend(`/api/admin/editions/${id}`, 'PUT', AdminEditionSchema, input)
        : apiSend(`/api/admin/courses/${courseId}/editions`, 'POST', AdminEditionSchema, input),
    onSuccess: invalidate,
  });
}

export type EditionAction =
  | { type: 'publish' | 'unpublish' | 'delete'; id: string }
  | { type: 'duplicate'; id: string; code: string };

export function useEditionAction() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (action: EditionAction) => {
      switch (action.type) {
        case 'delete':
          return apiSend(`/api/admin/editions/${action.id}`, 'DELETE', null);
        case 'duplicate':
          return apiSend(`/api/admin/editions/${action.id}/duplicate`, 'POST', AdminEditionSchema, {
            code: action.code,
          });
        default:
          return apiSend(
            `/api/admin/editions/${action.id}/${action.type}`,
            'POST',
            AdminEditionSchema,
          );
      }
    },
    onSuccess: invalidate,
  });
}

export function useAuditLog(query: AuditQuery) {
  return useQuery({
    queryKey: [...ADMIN_KEY, 'audit', query],
    queryFn: () => apiFetch(`/api/admin/audit?${toQueryString(query)}`, AuditListResponseSchema),
    placeholderData: keepPreviousData,
  });
}

export function useAdminCoupons() {
  return useQuery({
    queryKey: [...ADMIN_KEY, 'coupons'],
    queryFn: () => apiFetch('/api/admin/coupons', AdminCouponsResponseSchema),
  });
}

export function useSaveCoupon() {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: ({ id, input }: { id?: string; input: CouponInput }) =>
      id
        ? apiSend(`/api/admin/coupons/${id}`, 'PUT', AdminCouponSchema, input)
        : apiSend('/api/admin/coupons', 'POST', AdminCouponSchema, input),
    onSuccess: invalidate,
  });
}

export function useAdminLegal() {
  return useQuery({
    queryKey: [...ADMIN_KEY, 'legal'],
    queryFn: () => apiFetch('/api/admin/legal', AdminLegalDocumentsResponseSchema),
  });
}

export function usePublishLegal() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: LegalDocumentInput) =>
      apiSend('/api/admin/legal', 'POST', AdminLegalDocumentSchema, input),
    onSuccess: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: ADMIN_KEY }),
        queryClient.invalidateQueries({ queryKey: ['legal'] }),
      ]),
  });
}

export function useAdminOrder(number: string | undefined) {
  return useQuery({
    queryKey: [...ADMIN_KEY, 'order', number],
    queryFn: () => apiFetch(`/api/admin/orders/${number}`, AdminOrderSchema),
    enabled: number !== undefined,
  });
}

export function useRefundOrder(number: string, idempotencyKey: string) {
  const invalidate = useInvalidateAdmin();
  return useMutation({
    mutationFn: (input: RefundRequest) =>
      apiSend(`/api/admin/orders/${number}/refunds`, 'POST', AdminOrderSchema, input, {
        [IDEMPOTENCY_HEADER]: idempotencyKey,
      }),
    onSuccess: invalidate,
  });
}
