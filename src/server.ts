import express, { Express, NextFunction, Request, Response } from 'express';
import dotenv, { config } from 'dotenv';
import routes from './route/index.route';
import { notFound, errorHandler } from './middleware/logger';
import { connectToDB } from './config/mongoose';
import { createLogger } from './utils/Logger';
import runStandardMiddleware from './middleware/standard.middleware';

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

app.listen(port, () => {
  log.info(`Server is running on URL: http://localhost:${port}`);
  connectToDB();
});

export default app;
