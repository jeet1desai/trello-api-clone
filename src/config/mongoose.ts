import mongoose from 'mongoose';
import { createLogger } from '../utils/Logger';

const log = createLogger('mongoose');

export async function connectToDB() {
  try {
    mongoose.connect(process.env.MONGO_DB_URI!);
    const connection = mongoose.connection;

    connection.on('connected', () => {
      const dbName = mongoose.connection.db?.databaseName || 'unknown';
      log.info('Database connected successfully to:', dbName);
    });

    connection.on('error', (err) => {
      log.error('MongoDB connection error. Please make sure MongoDB is running. ', err);
      process.exit();
    });

    mongoose.connection.on('disconnected', () => {
      log.warn('MongoDB disconnected');
    });

    process.on('SIGINT', async () => {
      await mongoose.connection.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      await mongoose.connection.close();
      process.exit(0);
    });
  } catch (error) {
    log.error('Error connecting to MongoDB', error);
    process.exit(1);
  }
}
