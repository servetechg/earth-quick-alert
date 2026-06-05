import { getCloudinary } from '@/lib/cloudinary';

export async function uploadImageBufferToCloudinary(params: {
    buffer: Buffer;
    folder?: string;
    filename?: string;
}): Promise<{ secure_url: string; public_id: string }> {
    const cld = getCloudinary();

    return await new Promise<{ secure_url: string; public_id: string }>((resolve, reject) => {
        const stream = cld.uploader.upload_stream(
            {
                resource_type: 'image',
                folder: params.folder || 'earthquick',
                filename_override: params.filename,
                use_filename: !!params.filename,
                unique_filename: true,
            },
            (err, result) => {
                if (err) return reject(err);
                if (!result?.secure_url || !result?.public_id) {
                    return reject(new Error('Cloudinary returned no result'));
                }
                resolve({ secure_url: result.secure_url, public_id: result.public_id });
            },
        );

        stream.end(params.buffer);
    });
}

export async function destroyCloudinaryImage(publicId: string): Promise<void> {
    if (!publicId.trim()) return;
    try {
        const cld = getCloudinary();
        await cld.uploader.destroy(publicId.trim(), { resource_type: 'image' });
    } catch {
        // Best-effort cleanup; caller still updates DB.
    }
}
