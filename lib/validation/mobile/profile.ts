import { z } from 'zod';

export const ADA_OPTIONS = [
    'Mobility (Wheelchair, Walker)',
    'Hearing Impairment',
    'Vision Impairment',
    'Other',
] as const;

export const MEDICAL_OPTIONS = [
    'Diabetes',
    'Respiratory Condition',
    'Heart Condition',
    'Dialysis',
    'Medication Dependent',
    'Other',
] as const;

export const PETS_OPTIONS = ['Dog(s)', 'Cat(s)', 'Bird(s)', 'Livestock', 'Other'] as const;

export const TRANSPORT_OPTIONS = [
    'No Vehicle',
    'Limited Mobility',
    'Need Accessible Vehicle',
    'Other',
] as const;

export const LODGING_OPTIONS = [
    'Accessible Room (ADA)',
    'Pet Friendly',
    'Ground Floor',
    'Two Beds',
    'Other',
] as const;

const zipCodeSchema = z
    .string()
    .trim()
    .regex(/^\d{5}(-\d{4})?$/, 'zipCode must be 12345 or 12345-6789');

const requirementSectionSchema = (allowed: readonly string[], section: string) =>
    z
        .object({
            hasRequirement: z.boolean({ required_error: `${section}.hasRequirement is required` }),
            selectedOptions: z.array(z.string()).default([]),
            otherDetails: z.string().optional().default(''),
        })
        .superRefine((data, ctx) => {
            if (data.hasRequirement === true) {
                if (!data.selectedOptions.length) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: 'Select at least one option',
                        path: ['selectedOptions'],
                    });
                    return;
                }
                for (const opt of data.selectedOptions) {
                    if (!allowed.includes(opt)) {
                        ctx.addIssue({
                            code: z.ZodIssueCode.custom,
                            message: `Invalid option: ${opt}`,
                            path: ['selectedOptions'],
                        });
                    }
                }
                if (data.selectedOptions.includes('Other') && !String(data.otherDetails ?? '').trim()) {
                    ctx.addIssue({
                        code: z.ZodIssueCode.custom,
                        message: 'otherDetails required when Other is selected',
                        path: ['otherDetails'],
                    });
                }
            }
        });

const lodgingSchema = z
    .object({
        selectedOptions: z.array(z.string()).min(1, 'Select at least one lodging option'),
        otherDetails: z.string().optional().default(''),
    })
    .superRefine((data, ctx) => {
        for (const opt of data.selectedOptions) {
            if (!LODGING_OPTIONS.includes(opt as (typeof LODGING_OPTIONS)[number])) {
                ctx.addIssue({
                    code: z.ZodIssueCode.custom,
                    message: `Invalid lodging option: ${opt}`,
                    path: ['selectedOptions'],
                });
            }
        }
        if (data.selectedOptions.includes('Other') && !String(data.otherDetails ?? '').trim()) {
            ctx.addIssue({
                code: z.ZodIssueCode.custom,
                message: 'otherDetails required when Other is selected',
                path: ['otherDetails'],
            });
        }
    });

export const profileCompleteSchema = z.object({
    profile: z.object({
        address: z.object({
            streetAddress: z.string().trim().min(1, 'streetAddress is required'),
            aptUnit: z.string().optional(),
            city: z.string().trim().min(1, 'city is required'),
            state: z.string().trim().min(1, 'state is required'),
            zipCode: zipCodeSchema,
            useCurrentLocation: z.boolean({
                required_error: 'useCurrentLocation is required',
            }),
        }),
        householdSize: z
            .number({ invalid_type_error: 'householdSize must be a number' })
            .int('householdSize must be an integer')
            .min(1, 'householdSize must be at least 1')
            .max(50, 'householdSize must be at most 50'),
        ada: requirementSectionSchema(ADA_OPTIONS, 'ada'),
        medical: requirementSectionSchema(MEDICAL_OPTIONS, 'medical'),
        pets: requirementSectionSchema(PETS_OPTIONS, 'pets'),
        transport: requirementSectionSchema(TRANSPORT_OPTIONS, 'transport'),
        lodging: lodgingSchema,
    }),
});
