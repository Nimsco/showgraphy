import { createHash, randomUUID } from 'node:crypto';
import { env } from '../config/env.js';
import { HttpError } from '../utils/http.js';

const uploadLimit = 8 * 1024 * 1024;
const configured = Boolean(env.CLOUDINARY_CLOUD_NAME && env.CLOUDINARY_API_KEY && env.CLOUDINARY_API_SECRET);

function uploadFolder(userId: string) { return `showgraphy/community/${userId}`; }

function cloudinarySignature(parameters: Record<string, string | number>) {
  const serialized = Object.entries(parameters).sort(([left], [right]) => left.localeCompare(right)).map(([key, value]) => `${key}=${value}`).join('&');
  return createHash('sha1').update(`${serialized}${env.CLOUDINARY_API_SECRET}`).digest('hex');
}

export function isCommunityMediaConfigured() { return configured; }

export function createCommunityUploadSignature(userId: string) {
  if (!configured) throw new HttpError(503, 'Community image uploads are not configured.');
  const timestamp = Math.floor(Date.now() / 1000);
  const folder = uploadFolder(userId);
  // Cloudinary prefixes `folder` to `public_id`; keep the latter to a single segment.
  const parameters = { allowed_formats: 'jpg,jpeg,png,webp', folder, public_id: randomUUID(), timestamp, overwrite: 'false' };
  return { ...parameters, signature: cloudinarySignature(parameters), cloudName: env.CLOUDINARY_CLOUD_NAME!, apiKey: env.CLOUDINARY_API_KEY! };
}

export async function verifyCommunityImage(userId: string, image: { publicId: string; version: number }) {
  if (!configured) throw new HttpError(503, 'Community image uploads are not configured.');
  if (!image.publicId.startsWith(`${uploadFolder(userId)}/`)) throw new HttpError(400, 'One or more images are not owned by your account.');
  const publicPath = image.publicId.split('/').map(encodeURIComponent).join('/');
  const credentials = Buffer.from(`${env.CLOUDINARY_API_KEY}:${env.CLOUDINARY_API_SECRET}`).toString('base64');
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME!)}/resources/image/upload/${publicPath}`, { headers: { authorization: `Basic ${credentials}` } });
  if (!response.ok) throw new HttpError(response.status === 404 ? 400 : 502, response.status === 404 ? 'An attached image could not be found.' : 'Image storage could not verify an attachment.');
  const asset = await response.json() as { public_id?: string; secure_url?: string; version?: number; width?: number; height?: number; format?: string; bytes?: number; resource_type?: string };
  if (asset.public_id !== image.publicId || asset.version !== image.version || asset.resource_type !== 'image' || !asset.secure_url || !/^https:\/\//.test(asset.secure_url) || !['jpg', 'jpeg', 'png', 'webp'].includes(asset.format ?? '') || !asset.bytes || asset.bytes > uploadLimit || !asset.width || !asset.height || asset.width > 12000 || asset.height > 12000) {
    throw new HttpError(400, 'An attached image is invalid or exceeds the 8 MB limit.');
  }
  return { publicId: asset.public_id, secureUrl: asset.secure_url, version: asset.version, width: asset.width, height: asset.height, format: asset.format, bytes: asset.bytes };
}

export async function destroyCommunityImage(publicId: string) {
  if (!configured) return;
  const timestamp = Math.floor(Date.now() / 1000);
  const parameters = { invalidate: 'true', public_id: publicId, timestamp };
  const body = new URLSearchParams({ invalidate: parameters.invalidate, public_id: parameters.public_id, timestamp: String(parameters.timestamp), api_key: env.CLOUDINARY_API_KEY!, signature: cloudinarySignature(parameters) });
  const response = await fetch(`https://api.cloudinary.com/v1_1/${encodeURIComponent(env.CLOUDINARY_CLOUD_NAME!)}/image/destroy`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!response.ok) throw new HttpError(502, 'Image storage could not remove this upload.');
  const result = await response.json() as { result?: string };
  if (result.result !== 'ok' && result.result !== 'not found') throw new HttpError(502, 'Image storage could not remove this upload.');
}
