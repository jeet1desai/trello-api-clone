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

    if (!file.mimetype.startsWith('image/')) {
      return reject(new Error('Only images are allowed'));
    }

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        allowed_formats: ['jpg', 'jpeg', 'png', 'webp'],
        resource_type: 'auto',
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

    // Pipe the buffer to Cloudinary via a Readable stream
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
