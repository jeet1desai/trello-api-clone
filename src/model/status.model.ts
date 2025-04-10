import mongoose from 'mongoose';

export interface BoardModelType {
  _id?: mongoose.Schema.Types.ObjectId;
  name?: string;
  description?: string;
  board_id?: mongoose.Types.ObjectId;
  position: number;
}

const schema = new mongoose.Schema<BoardModelType>(
  {
    name: {
      type: String,
      default: '',
      required: [true, 'Please provide a status name'],
    },
    description: {
      type: String,
      default: '',
    },
    board_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'boards',
      required: true,
    },
    position: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

export const StatusModel = mongoose.model('status', schema);
