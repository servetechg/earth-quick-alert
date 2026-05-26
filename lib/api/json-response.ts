import { NextResponse } from 'next/server';
import type { ApiErrorBody, FieldError } from '@/lib/types/mobile/auth';

export function apiJson<T>(data: T, status = 200) {
    return NextResponse.json(data, { status });
}

export function apiError(
    message: string,
    status: number,
    options?: { code?: string; errors?: FieldError[] },
) {
    const body: ApiErrorBody = { message };
    if (options?.code) body.code = options.code;
    if (options?.errors?.length) body.errors = options.errors;
    return NextResponse.json(body, { status });
}

export function validationError(errors: FieldError[]) {
    return apiError('Validation failed', 400, { code: 'VALIDATION_ERROR', errors });
}
