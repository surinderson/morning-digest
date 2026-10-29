import { Hono } from 'hono';
import { loadConfig, type RigConfig } from './config.js';
import { lane } from './lane.js';
import { readStatus } from './status.js';
import { Layout } from './views/layout.js';
import { StatusBoard } from './views/status.js';
import { readNight } from './digest/read-night.js';
import { DigestPage } from './views/digest.js';

export function createApp(config: RigConfig = loadConfig()) {
  const app = new Hono();

  app.get('/health', (c) => c.json({ ok: true, lane: lane().id }));

  app.get('/', async (c) => {
    const status = readStatus(config);
    const nights = await Promise.all(status.nights.map(async (night) => {
      const { rows } = await readNight(config.runsDir, night);
      return {
        night,
        counts: rows.reduce(
          (counts, row) => {
            counts[row.lastStatus] += 1;
            return counts;
          },
          { ok: 0, retry: 0, fail: 0 },
        ),
      };
    }));
    return c.html(
      <Layout title="status" lane={lane()}>
        <StatusBoard status={status} nights={nights} />
      </Layout>,
    );
  });

  app.get('/digest/:night', async (c) => {
    try {
      const { rows } = await readNight(config.runsDir, c.req.param('night'));
      return c.html(
        <Layout title={`digest ${c.req.param('night')}`} lane={lane()}>
          <DigestPage night={c.req.param('night')} rows={rows} />
        </Layout>,
      );
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return c.notFound();
      }
      throw error;
    }
  });

  app.get('/api/digest/:night', async (c) => {
    try {
      const result = await readNight(config.runsDir, c.req.param('night'));
      return c.json(result);
    } catch (error) {
      if (error instanceof Error && 'code' in error && error.code === 'ENOENT') {
        return c.notFound();
      }
      throw error;
    }
  });

  return app;
}
