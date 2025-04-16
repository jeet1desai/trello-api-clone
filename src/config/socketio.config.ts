import http from 'http';
import { Server, Socket } from 'socket.io';
import { DefaultEventsMap } from 'socket.io/dist/typed-events';

let server = null;
let io: Server<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any> | null = null;
let socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any> | null = null;

export const users = new Map();

export const initializeSocket = (app: Express.Application) => {
  server = http.createServer(app);
  io = new Server(server, { cors: { origin: '*' } });

  io.on('connection', (_socket: Socket<DefaultEventsMap, DefaultEventsMap, DefaultEventsMap, any>) => {
    console.log('Socket Connected', _socket.id);
    socket = _socket;

    // When a user logs in, they register with their userId
    // socket.on('register', (userId) => {
    //   users.set(userId, socket?.id);
    //   console.log(`User ${userId} registered with socket ${socket?.id}`);
    // });
    socket.on('register', (userId) => {
      if (!users.has(userId)) {
        users.set(userId, new Set());
      }
      users.get(userId)?.add(socket?.id);

      console.log(users);
    });

    // _socket.on('disconnect', () => {
    //   for (const [userId, id] of users.entries()) {
    //     if (id === socket?.id) {
    //       users.delete(userId);
    //       break;
    //     }
    //   }

    //   console.error('Socket Disconnected!!!', _socket.id);
    // });
    socket.on('disconnect', () => {
      for (const [userId, socketSet] of users.entries()) {
        socketSet.delete(socket?.id);
        if (socketSet.size === 0) {
          users.delete(userId);
        }
      }
    });
  });

  return { io, server };
};

export const getSocket = () => ({ io, socket });
