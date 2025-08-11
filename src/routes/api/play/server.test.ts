import { describe, it, expect } from 'vitest';
import { POST } from './+server';

function createRequest(rowCount: number) {
  return new Request('http://localhost/api/play', {
    method: 'POST',
    body: JSON.stringify({ rowCount }),
  });
}

describe('POST /api/play', () => {
  it('returns binIndex within row count range', async () => {
    const rowCount = 16;
    const res = await POST({ request: createRequest(rowCount) } as any);
    const { binIndex } = await res.json();
    expect(binIndex).toBeGreaterThanOrEqual(0);
    expect(binIndex).toBeLessThanOrEqual(rowCount);
  });
});
