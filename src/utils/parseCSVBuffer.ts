import { Readable } from 'stream';
import csvParser from 'csv-parser';

export interface TaskRow {
  title: string;
  status: string;
  [key: string]: string;
}

export const parseCSVBuffer = (buffer: Buffer): Promise<TaskRow[]> => {
  return new Promise((resolve, reject) => {
    const results: TaskRow[] = [];

    Readable.from(buffer)
      .pipe(csvParser())
      .on('data', (data: TaskRow) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', (err: Error) => reject(err));
  });
};
