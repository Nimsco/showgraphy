export type CloudinarySignature = {
  allowed_formats: string;
  folder: string;
  public_id: string;
  timestamp: number;
  overwrite: string;
  signature: string;
  cloudName: string;
  apiKey: string;
};

export type UploadedCloudinaryImage = {
  publicId: string;
  secureUrl: string;
  version: number;
  width: number;
  height: number;
  format: string;
  bytes: number;
};

export function uploadCloudinaryImage(file: File, signature: CloudinarySignature, onProgress: (progress: number) => void = () => undefined) {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
  if (!allowedTypes.includes(file.type) || file.size > 8 * 1024 * 1024) return Promise.reject(new Error('Choose a JPG, PNG, or WebP image under 8 MB.'));
  const form = new FormData();
  form.append('file', file);
  form.append('api_key', signature.apiKey);
  form.append('timestamp', String(signature.timestamp));
  form.append('signature', signature.signature);
  form.append('folder', signature.folder);
  form.append('public_id', signature.public_id);
  form.append('allowed_formats', signature.allowed_formats);
  form.append('overwrite', signature.overwrite);
  return new Promise<UploadedCloudinaryImage>((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open('POST', `https://api.cloudinary.com/v1_1/${encodeURIComponent(signature.cloudName)}/image/upload`);
    request.upload.onprogress = (event) => { if (event.lengthComputable) onProgress(Math.round(event.loaded * 100 / event.total)); };
    request.onerror = () => reject(new Error('Image upload failed. Check your connection and try again.'));
    request.onload = () => {
      let data: { public_id?: string; secure_url?: string; version?: number; width?: number; height?: number; format?: string; bytes?: number; error?: { message?: string } };
      try { data = JSON.parse(request.responseText || '{}') as typeof data; }
      catch { reject(new Error('Image storage returned an invalid response.')); return; }
      if (request.status < 200 || request.status >= 300 || !data.public_id || !data.secure_url || !data.version || !data.width || !data.height || !data.format || !data.bytes) {
        reject(new Error(data.error?.message ?? 'Image upload failed.'));
        return;
      }
      resolve({ publicId: data.public_id, secureUrl: data.secure_url, version: data.version, width: data.width, height: data.height, format: data.format, bytes: data.bytes });
    };
    request.send(form);
  });
}
