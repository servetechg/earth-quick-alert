import { z } from 'zod';

const zipCodeSchema = z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, 'zipCode must be 12345 or 12345-6789');

/** ZIP optional (empty string allowed) — alert-only locations, not full street address. */
export const alertLocationZipOptionalSchema = z.preprocess(
    (val) => (typeof val === 'string' && val.trim() === '' ? undefined : val),
    zipCodeSchema.optional(),
);

/** Onboarding step 2 + PUT /profile/alert-locations */
export const alertLocationSchema = z.object({
    id: z.string().trim().optional(),
    label: z.string().trim().min(1, 'label is required'),
    city: z.string().trim().min(1, 'city is required'),
    state: z.string().trim().min(2, 'state is required').max(32),
    zipCode: alertLocationZipOptionalSchema,
});

/** Same shape as alertLocationSchema — used inside profile/complete */
export const alertLocationOnboardingSchema = alertLocationSchema;

export const putAlertLocationsSchema = z.object({
    alertLocations: z
        .array(alertLocationSchema)
        .max(5, 'Maximum 5 alert locations allowed'),
});
