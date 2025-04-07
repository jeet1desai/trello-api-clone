import express, { Express, Request, Response } from 'express';
import dotenv from 'dotenv';
import morgan from 'morgan';
import helmet from 'helmet';
import cors from 'cors';
import routes from './route/index.route';
import { notFound, errorHandler } from './middleware/logger';

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3001;

app.use(morgan('dev'));
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/v1/api', routes);

app.use(notFound);
app.use(errorHandler);

app.get('/', (req: Request, res: Response) => {
  res.json({ test: 'Express + TypeScript Server' });
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
