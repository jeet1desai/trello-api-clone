import mongoose from 'mongoose';

export interface UserBoardBackgroundType {
  _id?: mongoose.Schema.Types.ObjectId;
  imageName: string;
  imageId: string;
  imageUrl: string;
  userId: mongoose.Schema.Types.ObjectId;
}

const schema = new mongoose.Schema<UserBoardBackgroundType>({
  imageName: { type: String, required: true },
  imageId: { type: String, required: true },
  imageUrl: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
});

export const UserBoardBackgroundModel = mongoose.model('userBoardBackgroundImage', schema, 'user_board_background_image');
