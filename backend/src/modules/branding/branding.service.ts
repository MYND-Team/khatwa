import { prisma } from '../../config/prisma';
import { z } from 'zod';

export const updateBrandingSchema = z.object({
  platformName: z.string().min(1).optional(),
  platformSubtitle: z.string().optional().nullable(),
  logoUrl: z.string().optional().nullable(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color').optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  fontFamily: z.string().min(1).optional(),
  pointsToEgpRate: z.number().positive().optional(),
  defaultTeacherCommissionPct: z.number().min(0).max(100).optional(),
  maintenanceMode: z.boolean().optional(),
});

export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;

const DEFAULT_SETTINGS = {
  id: 'default',
  platformName: 'خطوة',
  platformSubtitle: 'منصة التعليم الذكية',
  logoUrl: null,
  primaryColor: '#6C63FF',
  secondaryColor: '#FF6584',
  accentColor: '#F59E0B',
  fontFamily: 'Cairo, sans-serif',
  pointsToEgpRate: 1.0,
  defaultTeacherCommissionPct: 80.0,
  maintenanceMode: false,
};

async function ensureSettings() {
  try {
    const existing = await prisma.platformSettings.findFirst();
    if (!existing) {
      return await prisma.platformSettings.create({ data: {} });
    }
    return existing;
  } catch (err) {
    return DEFAULT_SETTINGS as any;
  }
}

export async function getSettings() {
  return ensureSettings();
}

export async function updateSettings(input: UpdateBrandingInput, updatedById: string) {
  const settings = await ensureSettings();
  return prisma.platformSettings.update({
    where: { id: settings.id },
    data: { ...input, updatedById },
  });
}
