import { createHash } from 'node:crypto';
import { LEGAL_DOCUMENT_TYPES } from '@plataforma/shared';
import type { Prisma, PrismaClient } from '@prisma/client';
import { MOCK_IDENTITIES } from '../integrations/mock-identities.js';
import { LEGAL_DRAFTS } from './legal-drafts.js';

/**
 * Datos de demostración (sección 9 de la especificación): 2 áreas, 4 cursos, ediciones con y
 * sin cupos, un cupón y usuarios de prueba por rol. Idempotente: se puede ejecutar varias
 * veces. Las fechas se calculan desde `now` para que siempre haya ediciones abiertas.
 * Nunca se ejecuta en producción (ver `src/seed.ts`).
 */

const DAY = 24 * 60 * 60 * 1000;

/** Fecha a `days` días de `now`, a las `hourUtc` en UTC (12:00 UTC = 09:00 en Punta Arenas). */
function at(now: Date, days: number, hourUtc = 12): Date {
  const date = new Date(now.getTime() + days * DAY);
  date.setUTCHours(hourUtc, 0, 0, 0);
  return date;
}

export const DEMO_EXTERNAL_BUYER = {
  email: 'comprador@example.com',
  name: 'Comprador Externo de Prueba',
} as const;

export const DEMO_COUPON_CODE = 'BIENVENIDA10';
/** Cupón del 100 % (beca): genera órdenes con total $0 sin pasar por la pasarela. */
export const DEMO_FULL_COUPON_CODE = 'BECA-UTA-100';
export const DEMO_LEGAL_VERSION = '2026.0-borrador';

interface DemoEdition {
  code: string;
  startInDays: number;
  durationDays: number;
  closeInDays: number;
  capacity: number;
  priceClp: number;
  taxTreatment?: 'taxed' | 'exempt';
  freeForCommunity?: boolean;
  schedule?: string;
  location?: string;
}

interface DemoCourse {
  slug: string;
  title: string;
  summary: string;
  description: string;
  objectives: string[];
  contents: string[];
  requirements?: string;
  certificationInfo: string;
  modality: 'online' | 'in_person' | 'blended';
  durationHours: number;
  areaSlug: string;
  instructorNames: string[];
  featured: boolean;
  imageAlt: string;
  editions: DemoEdition[];
}

const AREAS = [
  {
    slug: 'tecnologias-de-la-informacion',
    name: 'Tecnologías de la información',
    description: 'Programación, ciberseguridad y herramientas digitales para el trabajo.',
  },
  {
    slug: 'gestion-y-emprendimiento',
    name: 'Gestión y emprendimiento',
    description: 'Habilidades para emprender, administrar y crecer en la región.',
  },
] as const;

const INSTRUCTORS = [
  {
    name: 'Camila Vidal Soto',
    title: 'Ingeniera en Informática',
    bio: 'Desarrolladora web con diez años de experiencia en proyectos públicos y privados.',
  },
  {
    name: 'Rodrigo Álvarez Pérez',
    title: 'Especialista en ciberseguridad',
    bio: 'Consultor en seguridad de la información para organismos públicos.',
  },
  {
    name: 'Francisca Muñoz Ruiz',
    title: 'Ingeniera Comercial',
    bio: 'Asesora de emprendimientos en Magallanes y docente del CFT.',
  },
] as const;

const COURSES: DemoCourse[] = [
  {
    slug: 'programacion-web-con-javascript',
    title: 'Programación web con JavaScript',
    summary:
      'Aprende a crear sitios web interactivos con HTML, CSS y JavaScript desde cero, a tu ritmo y con acompañamiento docente.',
    description:
      'Curso práctico para personas que quieren dar sus primeros pasos en el desarrollo web. ' +
      'Cada unidad incluye ejercicios guiados y un proyecto final publicado en internet.',
    objectives: [
      'Construir páginas web accesibles con HTML y CSS.',
      'Programar la interacción de una página con JavaScript.',
      'Publicar un proyecto web en un servicio de alojamiento gratuito.',
    ],
    contents: [
      'Fundamentos de HTML semántico',
      'Estilos y diseño adaptable con CSS',
      'Programación con JavaScript',
      'Consumo de datos desde una API',
      'Proyecto final',
    ],
    requirements: 'Manejo básico de computador e internet.',
    certificationInfo: 'Certificado digital verificable de aprobación (40 horas).',
    modality: 'online',
    durationHours: 40,
    areaSlug: 'tecnologias-de-la-informacion',
    instructorNames: ['Camila Vidal Soto'],
    featured: true,
    imageAlt: 'Pantalla de computador con código JavaScript',
    editions: [
      {
        code: 'JS-DEMO-1',
        startInDays: 20,
        durationDays: 42,
        closeInDays: 15,
        capacity: 30,
        priceClp: 89_000,
        schedule: 'Clases sincrónicas los martes de 19:00 a 20:30',
      },
      {
        code: 'JS-DEMO-2',
        startInDays: 90,
        durationDays: 42,
        closeInDays: 85,
        capacity: 30,
        priceClp: 89_000,
        schedule: 'Clases sincrónicas los jueves de 19:00 a 20:30',
      },
    ],
  },
  {
    slug: 'ciberseguridad-para-el-trabajo',
    title: 'Ciberseguridad para el trabajo',
    summary:
      'Protege tu información y la de tu organización: contraseñas, correos fraudulentos, respaldos y buenas prácticas.',
    description:
      'Curso mixto con sesiones presenciales en Punta Arenas y actividades en línea. ' +
      'Orientado a personas que usan el computador en su trabajo diario.',
    objectives: [
      'Reconocer correos y mensajes fraudulentos.',
      'Configurar contraseñas seguras y autenticación en dos pasos.',
      'Aplicar una rutina de respaldos de información.',
    ],
    contents: [
      'Amenazas frecuentes',
      'Contraseñas y autenticación',
      'Correo seguro y phishing',
      'Respaldos y recuperación',
    ],
    certificationInfo: 'Certificado digital verificable de aprobación (24 horas).',
    modality: 'blended',
    durationHours: 24,
    areaSlug: 'tecnologias-de-la-informacion',
    instructorNames: ['Rodrigo Álvarez Pérez'],
    featured: true,
    imageAlt: 'Candado sobre un teclado de computador',
    editions: [
      {
        // Edición sin cupos: los ocupan las inscripciones de demostración.
        code: 'SEG-DEMO-1',
        startInDays: 12,
        durationDays: 28,
        closeInDays: 8,
        capacity: 2,
        priceClp: 65_000,
        taxTreatment: 'taxed',
        location: 'Sede Punta Arenas del CFT',
        schedule: 'Sesiones presenciales los sábados de 10:00 a 13:00',
      },
    ],
  },
  {
    slug: 'emprendimiento-digital-en-magallanes',
    title: 'Emprendimiento digital en Magallanes',
    summary:
      'Diseña y valida tu idea de negocio, y aprende a venderla en canales digitales con foco en la realidad regional.',
    description:
      'Curso presencial con talleres prácticos y mentorías. Liberado para la comunidad CFT ' +
      '(estudiantes, docentes y funcionarios) en su primera edición.',
    objectives: [
      'Validar una idea de negocio con clientes reales.',
      'Construir una propuesta de valor y un modelo de negocio.',
      'Planificar la venta en redes sociales y comercio electrónico.',
    ],
    contents: [
      'Del problema a la idea',
      'Modelo de negocio',
      'Marketing digital',
      'Formalización y financiamiento',
    ],
    certificationInfo: 'Certificado digital verificable de participación y aprobación (30 horas).',
    modality: 'in_person',
    durationHours: 30,
    areaSlug: 'gestion-y-emprendimiento',
    instructorNames: ['Francisca Muñoz Ruiz'],
    featured: true,
    imageAlt: 'Personas trabajando en un taller de emprendimiento',
    editions: [
      {
        code: 'EMP-DEMO-1',
        startInDays: 30,
        durationDays: 35,
        closeInDays: 25,
        capacity: 25,
        priceClp: 75_000,
        freeForCommunity: true,
        location: 'Sede Punta Arenas del CFT',
        schedule: 'Miércoles de 18:30 a 21:30',
      },
    ],
  },
  {
    slug: 'excel-para-la-gestion',
    title: 'Excel para la gestión',
    summary:
      'Organiza, analiza y presenta datos con planillas de cálculo: fórmulas, tablas dinámicas y gráficos.',
    description:
      'Curso en línea autoguiado con tutorías semanales. Incluye planillas de práctica ' +
      'basadas en casos de pequeñas empresas.',
    objectives: [
      'Usar fórmulas y funciones para automatizar cálculos.',
      'Resumir información con tablas dinámicas.',
      'Presentar resultados con gráficos claros.',
    ],
    contents: ['Fórmulas y funciones', 'Tablas y filtros', 'Tablas dinámicas', 'Gráficos'],
    requirements: 'Computador con planilla de cálculo (Excel o LibreOffice Calc).',
    certificationInfo: 'Certificado digital verificable de aprobación (20 horas).',
    modality: 'online',
    durationHours: 20,
    areaSlug: 'gestion-y-emprendimiento',
    instructorNames: ['Francisca Muñoz Ruiz', 'Camila Vidal Soto'],
    featured: false,
    imageAlt: 'Planilla de cálculo con un gráfico de barras',
    editions: [
      {
        code: 'XLS-DEMO-1',
        startInDays: 7,
        durationDays: 28,
        closeInDays: 5,
        capacity: 40,
        priceClp: 45_000,
      },
    ],
  },
];

export interface DemoSeedSummary {
  areas: number;
  courses: number;
  editions: number;
  users: number;
}

/** Slugs de los datos de demostración (las pruebas cuentan solo estos). */
export const DEMO_AREA_SLUGS = AREAS.map((area) => area.slug);
export const DEMO_COURSE_SLUGS = COURSES.map((course) => course.slug);

export async function seedDemoData(
  prisma: PrismaClient,
  now: Date = new Date(),
): Promise<DemoSeedSummary> {
  return prisma.$transaction(async (tx) => {
    const areaIds = new Map<string, string>();
    for (const area of AREAS) {
      const saved = await tx.area.upsert({
        where: { slug: area.slug },
        create: area,
        update: { name: area.name, description: area.description },
      });
      areaIds.set(area.slug, saved.id);
    }

    const instructorIds = new Map<string, string>();
    for (const instructor of INSTRUCTORS) {
      const existing = await tx.instructor.findFirst({ where: { name: instructor.name } });
      const saved = existing
        ? await tx.instructor.update({ where: { id: existing.id }, data: instructor })
        : await tx.instructor.create({ data: instructor });
      instructorIds.set(instructor.name, saved.id);
    }

    const userIds = new Map<string, string>();
    for (const identity of MOCK_IDENTITIES) {
      const saved = await tx.user.upsert({
        where: { email: identity.email },
        create: {
          email: identity.email,
          name: identity.name,
          sgaUserId: identity.sgaUserId,
          idpSubject: identity.subject,
        },
        update: {
          name: identity.name,
          sgaUserId: identity.sgaUserId,
          idpSubject: identity.subject,
        },
      });
      userIds.set(identity.subject, saved.id);
    }
    await tx.user.upsert({
      where: { email: DEMO_EXTERNAL_BUYER.email },
      create: { ...DEMO_EXTERNAL_BUYER },
      update: { name: DEMO_EXTERNAL_BUYER.name },
    });

    let editionCount = 0;
    const editionIds = new Map<string, string>();
    for (const course of COURSES) {
      const areaId = areaIds.get(course.areaSlug);
      if (!areaId) throw new Error(`Unknown demo area ${course.areaSlug}`);
      const data = {
        title: course.title,
        summary: course.summary,
        description: course.description,
        objectives: course.objectives,
        contents: course.contents,
        requirements: course.requirements ?? null,
        certificationInfo: course.certificationInfo,
        modality: course.modality,
        durationHours: course.durationHours,
        areaId,
        imageUrl: `/img/cursos/${course.slug}.svg`,
        imageAlt: course.imageAlt,
        featured: course.featured,
        status: 'published',
      } satisfies Prisma.CourseUncheckedUpdateInput;
      const saved = await tx.course.upsert({
        where: { slug: course.slug },
        create: { slug: course.slug, ...data, publishedAt: now },
        update: data,
      });

      await tx.courseInstructor.deleteMany({ where: { courseId: saved.id } });
      await tx.courseInstructor.createMany({
        data: course.instructorNames.map((name, position) => {
          const instructorId = instructorIds.get(name);
          if (!instructorId) throw new Error(`Unknown demo instructor ${name}`);
          return { courseId: saved.id, instructorId, position };
        }),
      });

      for (const edition of course.editions) {
        const editionData = {
          courseId: saved.id,
          startsAt: at(now, edition.startInDays),
          endsAt: at(now, edition.startInDays + edition.durationDays),
          enrollmentOpensAt: at(now, -30),
          enrollmentClosesAt: at(now, edition.closeInDays, 23),
          capacity: edition.capacity,
          priceClp: edition.priceClp,
          taxTreatment: edition.taxTreatment ?? 'exempt',
          freeForCommunity: edition.freeForCommunity ?? false,
          communityProfiles: edition.freeForCommunity
            ? (['student', 'teacher', 'staff'] as const).slice()
            : [],
          schedule: edition.schedule ?? null,
          location: edition.location ?? null,
          status: 'published',
        } satisfies Prisma.CourseEditionUncheckedUpdateInput;
        const savedEdition = await tx.courseEdition.upsert({
          where: { code: edition.code },
          create: { code: edition.code, ...editionData },
          update: editionData,
        });
        editionIds.set(edition.code, savedEdition.id);
        editionCount++;
      }
    }

    // Llena la edición sin cupos con inscripciones de la comunidad de prueba.
    const soldOutId = editionIds.get('SEG-DEMO-1');
    for (const subject of ['mock-student', 'mock-teacher']) {
      const userId = userIds.get(subject);
      if (!soldOutId || !userId) continue;
      await tx.enrollment.upsert({
        where: { userId_editionId: { userId, editionId: soldOutId } },
        create: {
          userId,
          editionId: soldOutId,
          source: 'manual_admin',
          status: 'enrolled',
          enrolledAt: now,
        },
        update: {},
      });
    }

    const couponData = {
      type: 'percentage',
      value: 10,
      scope: 'all',
      validFrom: at(now, -30),
      validUntil: at(now, 180),
      maxUses: 100,
      maxUsesPerUser: 1,
      reason: 'promotion',
      active: true,
    } satisfies Prisma.CouponUncheckedUpdateInput;
    await tx.coupon.upsert({
      where: { code: DEMO_COUPON_CODE },
      create: { code: DEMO_COUPON_CODE, ...couponData },
      update: couponData,
    });

    await tx.coupon.upsert({
      where: { code: DEMO_FULL_COUPON_CODE },
      create: {
        code: DEMO_FULL_COUPON_CODE,
        ...couponData,
        value: 100,
        maxUses: null,
        reason: 'scholarship',
      },
      update: {},
    });

    // Textos legales base (inmutables: solo se crean si no existen).
    for (const type of LEGAL_DOCUMENT_TYPES) {
      const draft = LEGAL_DRAFTS[type];
      const exists = await tx.legalDocument.count({
        where: { type, version: DEMO_LEGAL_VERSION },
      });
      if (exists === 0) {
        await tx.legalDocument.create({
          data: {
            type,
            version: DEMO_LEGAL_VERSION,
            title: draft.title,
            content: draft.content,
            contentSha256: createHash('sha256').update(draft.content, 'utf8').digest('hex'),
            effectiveFrom: at(now, -30),
          },
        });
      }
    }

    return {
      areas: AREAS.length,
      courses: COURSES.length,
      editions: editionCount,
      users: MOCK_IDENTITIES.length + 1,
    };
  });
}
