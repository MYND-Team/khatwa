import { prisma } from '../../config/prisma';
import { z } from 'zod';

export const updateBrandingSchema = z.object({
  logoUrl: z.string().url().optional(),
  primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'Must be a valid hex color').optional(),
  secondaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
  fontFamily: z.string().min(1).optional(),
});

export type UpdateBrandingInput = z.infer<typeof updateBrandingSchema>;

const DEFAULT_SETTINGS = {
  id: 'default',
  logoUrl: null,
  primaryColor: '#c99846',
  secondaryColor: '#1a1f2c',
  fontFamily: 'Cairo, sans-serif',
};

async function ensureSettings() {
  try {
    const existing = await prisma.platformSettings.findFirst();
    if (!existing) {
      return await prisma.platformSettings.create({ data: {} });
    }
    return existing;
  } catch (err) {
    return DEFAULT_SETTINGS;
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
