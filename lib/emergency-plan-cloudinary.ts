import { getCloudinary } from '@/lib/cloudinary';

export type EmergencyPlanCloudinaryResource = 'image' | 'raw';

export function mimeToCloudinaryResourceType(mime: string): EmergencyPlanCloudinaryResource {
  if (mime.startsWith('image/')) return 'image';
  return 'raw';
}

/** Upload arbitrary COOP attachments (documents + images) to Cloudinary. */
export async function uploadEmergencyPlanBuffer(params: {
  buffer: Buffer;
  mime: string;
  filename: string;
  folder?: string;
}): Promise<{ secure_url: string; public_id: string; resource_type: EmergencyPlanCloudinaryResource }> {
  const resource_type = mimeToCloudinaryResourceType(params.mime || 'application/octet-stream');
  const cld = getCloudinary();

  return await new Promise((resolve, reject) => {
    const stream = cld.uploader.upload_stream(
      {
        resource_type,
        folder: params.folder || 'earthquick/emergency-plans',
        filename_override: params.filename,
        use_filename: true,
        unique_filename: true,
        access_mode: 'public',
      },
      (err, result) => {
        if (err) return reject(err);
        if (!result?.secure_url || !result?.public_id) {
          return reject(new Error('Cloudinary returned no upload result'));
        }
        resolve({ secure_url: result.secure_url, public_id: result.public_id, resource_type });
      }
    );

    stream.end(params.buffer);
  });
}

export async function destroyEmergencyPlanAsset(
  public_id: string,
  resource_type: EmergencyPlanCloudinaryResource
) {
  const cld = getCloudinary();
  return await cld.uploader.destroy(public_id, { resource_type });
}

export function getSignedDeliveryUrl(
  public_id: string,
  resource_type: EmergencyPlanCloudinaryResource,
  opts?: { originalDeliveryUrl?: string }
): string {
  const cld = getCloudinary();
  const original = opts?.originalDeliveryUrl ?? '';
  const useAuthenticatedType =
    original.includes('/authenticated/') || original.includes('/image/authenticated/');
  return cld.url(public_id, {
    resource_type,
    secure: true,
    sign_url: true,
    ...(useAuthenticatedType ? { type: 'authenticated' as const } : {}),
  });
}
