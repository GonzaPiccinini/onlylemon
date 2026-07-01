import { z } from "zod";
import type { MetaPixel } from "@/types/domain";

// ---------------------------------------------------------------------------
// Shared constants + validation for the landings console.
// ---------------------------------------------------------------------------

export const MAX_MESSAGES = 5;
export const MAX_MSG_LEN = 250;
export const PHONE_REGEX = /^\+?[0-9]{8,15}$/;

export const pixelLabel = (p: Pick<MetaPixel, "pixelId" | "label">) =>
  p.label ? `${p.label} (${p.pixelId})` : p.pixelId;

const fallbackPhoneSchema = z.object({
  phone: z.string().regex(PHONE_REGEX, "Formato inválido (8–15 dígitos, + opcional)"),
  label: z.string().optional(),
  order: z.number().int().nonnegative().optional(),
});

const whatsappMessageItemSchema = z
  .string()
  .max(MAX_MSG_LEN, `Máximo ${MAX_MSG_LEN} caracteres`);

const whatsappMessagesSchema = z
  .array(whatsappMessageItemSchema)
  .max(MAX_MESSAGES, `Máximo ${MAX_MESSAGES} mensajes`);

export const createLandingSchema = z.object({
  url: z.string().url("URL invalida"),
  metaPixelRef: z.string().min(1, "Seleccioná un pixel"),
  whatsappMessages: whatsappMessagesSchema.optional(),
  fallbackPhones: z
    .array(fallbackPhoneSchema)
    .min(1, "Agregá al menos un teléfono de respaldo"),
});

export const updateLandingSchema = z.object({
  url: z.string().url("URL invalida"),
  metaPixelRef: z.string().min(1, "Seleccioná un pixel"),
  whatsappMessages: whatsappMessagesSchema,
});

export const createPixelSchema = z.object({
  pixelId: z.string().min(1, "Pixel ID obligatorio"),
  accessToken: z.string().min(1, "Access Token obligatorio"),
  label: z.string().optional(),
});

export const updatePixelSchema = z.object({
  pixelId: z.string().optional(),
  accessToken: z.string().optional(),
  label: z.string().optional(),
});

export type CreateLandingValues = z.infer<typeof createLandingSchema>;
export type UpdateLandingValues = z.infer<typeof updateLandingSchema>;
export type CreatePixelValues = z.infer<typeof createPixelSchema>;
export type UpdatePixelValues = z.infer<typeof updatePixelSchema>;
