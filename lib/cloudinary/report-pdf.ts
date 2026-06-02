import { uploadEmergencyPlanBuffer } from '@/lib/emergency-plan-cloudinary';

export async function uploadRiskReportPdf(params: {
    buffer: Buffer;
    filename: string;
}): Promise<{ secure_url: string; public_id: string }> {
    const upload = await uploadEmergencyPlanBuffer({
        buffer: params.buffer,
        mime: 'application/pdf',
        filename: params.filename.endsWith('.pdf') ? params.filename : `${params.filename}.pdf`,
        folder: 'earthquick/risk-reports',
    });
    return { secure_url: upload.secure_url, public_id: upload.public_id };
}
