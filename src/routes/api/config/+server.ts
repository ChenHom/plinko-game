import { json } from '@sveltejs/kit';
import { binPayouts as defaultBinPayouts } from '$lib/constants/game';

export function GET() {
  let payouts = defaultBinPayouts;
  const env = process.env.BIN_PAYOUTS_JSON;
  if (env) {
    try {
      payouts = JSON.parse(env);
    } catch (err) {
      console.error('Invalid BIN_PAYOUTS_JSON env');
    }
  }
  return json({ binPayouts: payouts });
}
