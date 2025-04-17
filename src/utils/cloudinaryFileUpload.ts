import { Readable } from 'stream';
import cloudinary from '../config/cloudinary.config';
import crypto from 'crypto';

interface CloudinaryUploadResult {
  url: string;
  imageId: string;
  imageName: string;
}

const uploadFromBuffer = (file: Express.Multer.File, folder: string): Promise<CloudinaryUploadResult> => {
  return new Promise((resolve, reject) => {
    if (!file?.buffer) {
      return reject(new Error('Invalid file buffer'));
    }

    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'application/pdf',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'video/mp4',
      'video/x-matroska',
    ];

    if (!allowedMimeTypes.includes(file.mimetype)) {
      return reject(new Error(`File type not allowed: ${file.mimetype}`));
    }

    let resourceType: 'image' | 'video' | 'raw' = 'raw';

    if (file.mimetype.startsWith('image/')) {
      resourceType = 'image';
    } else if (file.mimetype.startsWith('video/')) {
      resourceType = 'video';
    } else {
      resourceType = 'raw';
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: resourceType,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'pdf', 'xls', 'xlsx', 'mp4', 'mkv'],
        use_filename: true,
        filename_override: file.originalname,
      },
      (error, result) => {
        if (error) {
          return reject(new Error(`Cloudinary error: ${error.message}`));
        }
        if (!result?.secure_url || !result?.public_id) {
          return reject(new Error('Cloudinary upload failed'));
        }
        resolve({
          url: result.secure_url,
          imageId: result.public_id,
          imageName: file.originalname,
        });
      }
    );

    Readable.from(file.buffer).pipe(uploadStream);
  });
};

export const saveFileToCloud = async (file: Express.Multer.File, folder: string): Promise<{ url: string; imageId: string; imageName: string }> => {
  try {
    return await uploadFromBuffer(file, folder);
  } catch (error) {
    console.error('Cloudinary upload error:', error);
    throw new Error(`File upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
};

export const deleteFromCloudinary = async (publicId: string): Promise<void> => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    if (result.result !== 'ok') {
      throw new Error(`Failed to delete asset: ${publicId}`);
    }
    return result;
  } catch (error) {
    console.error('Cloudinary deletion error:', error);
    throw new Error(`Failed to delete asset: ${publicId}`);
  }
};
