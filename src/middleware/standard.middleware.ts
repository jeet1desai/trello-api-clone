import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { createLogger } from '../utils/Logger';
import { Express, json, urlencoded } from 'express';
import compression from 'compression';
let log = createLogger('standardMiddleware');

const runStandardMiddleware = (app: Express) => {
  app.use(
    morgan('Request: :method :url :status :response-time ms', {
      stream: {
        write: (message: string) => {
          log.info(message.trim());
        },
      },
    })
  );
  app.use(helmet());
  app.use(
    cors({
      origin: ['http://localhost:3000', process.env.BOARD_FE_URL!],
      credentials: true,
    })
  );
  app.use(urlencoded({ extended: true, limit: '50mb' }));
  app.use(cookieParser());
  app.use(compression());
  app.use(json({ limit: '50mb' }));
  app.use(urlencoded({ extended: true, limit: '50mb' }));
};

export default runStandardMiddleware;
