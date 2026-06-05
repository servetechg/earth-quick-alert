import { z } from 'zod';
import { profileCompleteSchema } from '@/lib/validation/mobile/profile';

export const profilePatchSchema = profileCompleteSchema.shape.profile.partial();
