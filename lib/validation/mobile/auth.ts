import { z } from 'zod';
import { OTP_PURPOSES } from '@/lib/types/mobile/auth';

const emailSchema = z.string().trim().email('Invalid email');
const passwordSchema = z.string().min(6, 'Password must be at least 6 characters');

export const signupSchema = z.object({
    firstName: z.string().trim().min(1, 'First name is required'),
    lastName: z.string().trim().min(1, 'Last name is required'),
    email: emailSchema,
    password: passwordSchema,
});

export const loginSchema = z.object({
    email: emailSchema,
    password: passwordSchema,
});

export const forgotPasswordSchema = z.object({
    email: emailSchema,
});

export const otpSendSchema = z.object({
    email: emailSchema,
    purpose: z.enum(OTP_PURPOSES),
});

export const otpVerifySchema = z.object({
    email: emailSchema,
    code: z.string().trim().regex(/^\d{6}$/, 'Code must be 6 digits'),
    purpose: z.enum(OTP_PURPOSES),
});

export const resetPasswordSchema = z
    .object({
        resetToken: z.string().trim().min(1, 'resetToken is required'),
        password: passwordSchema,
        confirmPassword: z.string().min(6),
    })
    .refine((d) => d.password === d.confirmPassword, {
        message: 'Passwords must match',
        path: ['confirmPassword'],
    });

export const changePasswordSchema = z
    .object({
        currentPassword: z.string().min(1, 'Current password is required'),
        newPassword: passwordSchema,
        confirmPassword: z.string().min(6),
    })
    .refine((d) => d.newPassword === d.confirmPassword, {
        message: 'Passwords must match',
        path: ['confirmPassword'],
    });

export const refreshSchema = z.object({
    refreshToken: z.string().trim().min(1, 'refreshToken is required'),
});

export const logoutSchema = z.object({
    refreshToken: z.string().trim().optional(),
});

export function zodFieldErrors(err: z.ZodError): { field: string; message: string }[] {
    return err.issues.map((i) => ({
        field: i.path.join('.') || 'body',
        message: i.message,
    }));
}
