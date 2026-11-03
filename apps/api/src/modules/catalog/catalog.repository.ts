import type { Modality, TaxTreatment } from '@plataforma/shared';

/** Datos del catálogo tal como salen de la base (fechas como `Date`). */

export interface EditionRecord {
  id: string;
  code: string;
  startsAt: Date;
  endsAt: Date;
  enrollmentOpensAt: Date | null;
  enrollmentClosesAt: Date;
  priceClp: number;
  taxTreatment: TaxTreatment;
  capacity: number;
  freeForCommunity: boolean;
  schedule: string | null;
  location: string | null;
}

export interface CourseRecord {
  id: string;
  slug: string;
  title: string;
  summary: string;
  modality: Modality;
  durationHours: number;
  area: { slug: string; name: string };
  imageUrl: string | null;
  imageAlt: string | null;
  featured: boolean;
  updatedAt: Date;
  /** Ediciones publicadas que aún no terminan, por fecha de inicio. */
  editions: EditionRecord[];
}

export interface CourseDetailRecord extends CourseRecord {
  description: string;
  objectives: string[];
  contents: string[];
  requirements: string | null;
  certificationInfo: string | null;
  seoTitle: string | null;
  seoDescription: string | null;
  instructors: { name: string; title: string | null; bio: string | null }[];
}

export interface AreaRecord {
  slug: string;
  name: string;
  description: string | null;
  publishedCourses: number;
}

export interface SeatUsage {
  /** Inscripciones que ocupan cupo (todas salvo las retiradas). */
  taken: number;
  /** Reservas de checkout activas y no vencidas. */
  reserved: number;
}

export interface CourseSearch {
  /** Expresión `to_tsquery` ya saneada (ver `buildTsQuery`). */
  tsQuery?: string;
  areaSlug?: string;
  modality?: Modality;
  /** Ediciones que comienzan en [startsFrom, startsBefore). */
  startsFrom?: Date;
  startsBefore?: Date;
  offset: number;
  limit: number;
  now: Date;
}

export interface CatalogRepository {
  searchCourses(search: CourseSearch): Promise<{ total: number; items: CourseRecord[] }>;
  featuredCourses(limit: number, now: Date): Promise<CourseRecord[]>;
  findPublishedCourse(slug: string, now: Date): Promise<CourseDetailRecord | null>;
  listAreas(): Promise<AreaRecord[]>;
  seatUsage(editionIds: readonly string[], now: Date): Promise<Map<string, SeatUsage>>;
  publishedCourseSlugs(): Promise<{ slug: string; updatedAt: Date }[]>;
}
