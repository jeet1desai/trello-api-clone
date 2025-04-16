import { saveFileToCloud } from '../utils/cloudinaryFileUpload';

export const saveMultipleFilesToCloud = async (files: Express.Multer.File[], folder: string) => {
  try {
    const uploadPromises = files.map((file) => saveFileToCloud(file, folder));
    const results = await Promise.all(uploadPromises);
    return results;
  } catch (error: any) {
    throw new Error(`Upload failed: ${error.message}`);
  }
};
