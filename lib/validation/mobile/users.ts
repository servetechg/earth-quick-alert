import { z } from 'zod';

export const patchUsersMeSchema = z
    .object({
        firstName: z.string().trim().min(1).optional(),
        lastName: z.string().trim().min(1).optional(),
        email: z.string().email().optional(),
        phone: z
            .string()
            .trim()
            .optional()
            .refine((v) => !v || /^\+[1-9]\d{6,14}$/.test(v), {
                message: 'phone must be E.164 format (e.g. +15551234567)',
            }),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: 'At least one field is required',
    });
