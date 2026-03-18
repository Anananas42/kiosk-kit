import { config } from 'dotenv';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '../../..');

config({ path: resolve(root, '.env') });

export const env = {
  port: Number(process.env.PORT) || 3001,
};
