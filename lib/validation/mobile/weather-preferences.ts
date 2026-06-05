import { z } from 'zod';

export const weatherPreferencesSchema = z.object({
    preferences: z.array(
        z.object({
            id: z.string().trim().min(1),
            enabled: z.boolean(),
        }),
    ),
});
