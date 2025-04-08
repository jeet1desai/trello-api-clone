import bunyan from 'bunyan';

export const createLogger = (name: string): bunyan => {
  return bunyan.createLogger({ name });
};
