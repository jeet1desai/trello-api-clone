import morgan from "morgan";
import helmet from "helmet";
import cors from "cors";
import cookieParser from 'cookie-parser';
import { createLogger } from "../utils/Logger";
import { Express, json, urlencoded } from 'express';
import compression from 'compression';
let log = createLogger('standardMiddleware');  

const runStandardMiddleware = (app: Express) => {
    app.use(morgan('Request: :method :url :status :response-time ms', {
        stream: {
          write: (message: string) => {
            log.info(message.trim());
          }
        }
      }));
    app.use(helmet());
    app.use(cors());
    app.use(urlencoded({ extended: true, limit: "50mb" }));
    app.use(
      cors({
        origin: (origin, callback) => {
          if (!origin) {
            return callback(null, true);
          }
    
          const allowedOrigins = [
            process.env.CLIENT_URL,
            'http://localhost:3000',
            'http://127.0.0.1:3000'
          ];
    
          if (allowedOrigins.includes(origin)) {
            log.info('CORS allowed for origin:', origin);
            return callback(null, true);
          }
    
          log.warn('CORS blocked for origin:', origin);
          return callback(new Error('Not allowed by CORS'));
        },
        credentials: true,
        optionsSuccessStatus: 200,
        methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS", "PATCH"],
        allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
        exposedHeaders: ["Content-Range", "X-Content-Range"]
      })
    );
    app.use(cookieParser());
    app.use(compression());
    app.use(json({ limit: "50mb" }));
    app.use(urlencoded({ extended: true, limit: "50mb" }));
}

export default runStandardMiddleware;