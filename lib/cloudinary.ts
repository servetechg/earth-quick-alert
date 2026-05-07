import { v2 as cloudinary } from 'cloudinary';

function requiredEnv(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing environment variable: ${name}`);
  return v;
}

let configured = false;

export function getCloudinary() {
  if (!configured) {
    cloudinary.config({
      cloud_name: requiredEnv('CLOUDINARY_CLOUD_NAME'),
      api_key: requiredEnv('CLOUDINARY_API_KEY'),
      api_secret: requiredEnv('CLOUDINARY_API_SECRET'),
      secure: true,
    });
    configured = true;
  }
  return cloudinary;
}

