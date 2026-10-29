import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { readNight } from '../src/digest/read-night.js';

const config = { adapter: 'shim', installed: '2026-10-29T14:06:00+01:00', beatEverySeconds: 60, runsDir: 'runs' };

describe('status board', () => {
  it('shows the lane banner and the nights on disk', async () => {
    process.env.LANE_MARKER = 'TEST-MARKER';
    const res = await createApp(config).request('/');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('TEST-MARKER');
    expect(html).toContain('2026-10-28');
  });

  it('links both fixture nights to their digest with counts from each job final status', async () => {
    const html = await (await createApp(config).request('/')).text();

    for (const night of ['2026-10-28', '2026-10-27']) {
      const { rows } = await readNight(config.runsDir, night);
      const counts = rows.reduce(
        (total, row) => {
          total[row.lastStatus] += 1;
          return total;
        },
        { ok: 0, retry: 0, fail: 0 },
      );

      expect(html).toContain(`<a href="/digest/${night}">${night}</a>`);
      expect(html).toContain(`ok ${counts.ok} · retry ${counts.retry} · fail ${counts.fail}`);
    }
  });

  it('health answers with the lane id', async () => {
    const res = await createApp(config).request('/health');
    expect(await res.json()).toEqual({ ok: true, lane: 'lane-07' });
  });
});
