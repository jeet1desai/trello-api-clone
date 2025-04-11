import express, { Express, NextFunction, Request, Response } from 'express';
import dotenv, { config } from 'dotenv';
import routes from './route/index.route';
import { notFound, errorHandler } from './middleware/logger';
import { connectToDB } from './config/mongoose';
import { createLogger } from './utils/Logger';
import runStandardMiddleware from './middleware/standard.middleware';
import { initializeSocket } from './config/socketio.config';

let log = createLogger('server');

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3030;

runStandardMiddleware(app);

app.get('/', (_req: Request, res: Response) => {
  res.json({ test: 'Express + TypeScript Server' });
});

routes(app);
app.use(notFound);
app.use(errorHandler);

const { server } = initializeSocket(app);

// app.listen(port, () => {
//   log.info(`Server is running on URL: http://localhost:${port}`);
//   connectToDB();
// });

server.listen(port, () => {
  log.info(`Server is running on URL: http://localhost:${port}`);
  connectToDB();
});

export default app;
