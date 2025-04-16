import { users } from '../config/socketio.config';

// Handle emit to user for multiple tab open
export const emitToUser = (io: any, userId: any, event: string, payload: any) => {
  const socketIds = users.get(userId);
  socketIds?.forEach((id: string) => {
    io?.to(id).emit(event, payload);
  });
};
