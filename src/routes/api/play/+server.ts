import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import crypto from 'node:crypto';

const SECRET = process.env.PLAY_RESULT_SECRET ?? 'dev-secret';

export const POST: RequestHandler = async ({ request }) => {
  const { rowCount } = await request.json();
  const binIndex = Math.floor(Math.random() * (rowCount + 1));
  const payload = JSON.stringify({ rowCount, binIndex });
  const signature = crypto.createHmac('sha256', SECRET).update(payload).digest('hex');
  return json({ binIndex, signature });
};
