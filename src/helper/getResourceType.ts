export const getResourceType = (fileName: string): 'image' | 'raw' | 'video' => {
  const extension = fileName.split('.').pop()?.toLowerCase();

  if (!extension) return 'raw';

  const imageTypes = ['jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp'];
  const videoTypes = ['mp4', 'mov', 'avi', 'mkv', 'webm'];
  const rawTypes = ['pdf', 'doc', 'docx', 'xls', 'xlsx', 'csv', 'zip'];

  if (imageTypes.includes(extension)) return 'image';
  if (videoTypes.includes(extension)) return 'video';
  if (rawTypes.includes(extension)) return 'raw';

  return 'raw';
};
