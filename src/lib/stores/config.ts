import { writable } from 'svelte/store';
import { binPayouts as defaultBinPayouts } from '$lib/constants/game';
import type { RiskLevel } from '$lib/types';
import type { RowCount } from '$lib/constants/game';

export const binPayouts = writable<Record<RowCount, Record<RiskLevel, number[]>>>(defaultBinPayouts);

export async function fetchConfig() {
  const endpoint = import.meta.env.VITE_CONFIG_ENDPOINT || '/api/config';
  try {
    const res = await fetch(endpoint, {
      headers: {
        'Content-Type': 'application/json',
        Authorization: import.meta.env.VITE_CONFIG_TOKEN ? `Bearer ${import.meta.env.VITE_CONFIG_TOKEN}` : '',
      },
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.binPayouts) {
        binPayouts.set(data.binPayouts);
      }
    } else {
      console.error('Failed to fetch config', res.status);
    }
  } catch (err) {
    console.error('Failed to fetch config', err);
  }
}
