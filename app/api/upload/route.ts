import { NextRequest, NextResponse } from 'next/server';
import { getCloudinary } from '@/lib/cloudinary';

export const runtime = 'nodejs';

const MAX_BYTES = 10 * 1024 * 1024; // 10MB
const ALLOWED_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

function asNonEmptyString(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s.length ? s : null;
}

async function uploadBufferToCloudinary(params: {
  buffer: Buffer;
  folder?: string;
  filename?: string;
}) {
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
        if (!result?.secure_url || !result?.public_id) return reject(new Error('Cloudinary returned no result'));
        resolve({ secure_url: result.secure_url, public_id: result.public_id });
      }
    );

    stream.end(params.buffer);
  });
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();
    const file = form.get('file');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ success: false, error: 'file is required (multipart/form-data field "file")' }, { status: 400 });
    }

    if (!ALLOWED_MIME.has(file.type)) {
      return NextResponse.json(
        { success: false, error: `Unsupported file type: ${file.type}. Allowed: jpeg, png, webp` },
        { status: 415 }
      );
    }

    if (file.size <= 0) {
      return NextResponse.json({ success: false, error: 'Empty file' }, { status: 400 });
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json({ success: false, error: `File too large. Max ${(MAX_BYTES / (1024 * 1024)).toFixed(0)}MB` }, { status: 413 });
    }

    const folder = asNonEmptyString(form.get('folder'));
    const ab = await file.arrayBuffer();
    const buffer = Buffer.from(ab);

    const { secure_url, public_id } = await uploadBufferToCloudinary({
      buffer,
      folder: folder || 'earthquick',
      filename: file.name,
    });

    return NextResponse.json({ success: true, url: secure_url, public_id });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Upload failed', message: error?.message || String(error) },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const public_id = asNonEmptyString(body?.public_id);

    if (!public_id) {
      return NextResponse.json({ success: false, error: 'public_id is required' }, { status: 400 });
    }

    const cld = getCloudinary();
    const result = await cld.uploader.destroy(public_id, { resource_type: 'image' });

    // Cloudinary returns: { result: "ok" } or "not found"
    return NextResponse.json({ success: true, result });
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: 'Delete failed', message: error?.message || String(error) },
      { status: 500 }
    );
  }
}

