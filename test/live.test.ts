import { describe, expect, it } from 'vitest';
import { AvailabilityService } from '../src/service.js';

const live = process.env.INHA_LIVE_TEST === '1';

describe.skipIf(!live)('live Inha smoke tests', () => {
  const service = new AvailabilityService();

  it('finds a known catalog title without treating source failures as absence', async () => {
    const response = await service.check({ materials: { title: '해리 포터.2, 죽음의 성물', authors: '롤링', year: 2020 }, maxCandidates: 5 });
    expect(['available_now', 'held_but_unavailable', 'ambiguous']).toContain(response.results[0]?.status);
  }, 30_000);

  it('handles a nonsense query deterministically when sources respond', async () => {
    const response = await service.check({ materials: { title: 'zzzz-no-such-inha-material-6cbedef8' }, maxCandidates: 3 });
    expect(['not_found', 'unknown']).toContain(response.results[0]?.status);
  }, 30_000);
});
