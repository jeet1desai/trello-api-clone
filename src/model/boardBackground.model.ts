import mongoose from 'mongoose';

export interface BoardBackgroundType {
  _id?: mongoose.Schema.Types.ObjectId;
  imageName: string;
  imageId: string;
  imageUrl: string;
}

const schema = new mongoose.Schema<BoardBackgroundType>({
  imageName: { type: String, required: true },
  imageId: { type: String, required: true },
  imageUrl: { type: String, required: true },
});

export const BoardBackgroundModel = mongoose.model('BoardBackgroundImage', schema, 'board_background_image');
