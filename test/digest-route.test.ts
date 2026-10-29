import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

const temporaryDirs: string[] = [];

async function makeRunsDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'rig-digest-route-'));
  temporaryDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

function appFor(runsDir: string) {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir,
  });
}

describe('digest routes', () => {
  it('serves HTML and JSON for the same night, ignoring malformed lines and keeping job order aligned', async () => {
    const dir = await makeRunsDir();
    await writeFile(
      join(dir, 'night.jsonl'),
      [
        JSON.stringify({ at: '2026-10-28T02:00:00+01:00', job: 'zeta', status: 'ok', owner: null }),
        '{bad json',
        JSON.stringify({ at: '2026-10-28T01:00:00+01:00', job: 'alpha', status: 'retry', owner: 'rook', error: 'timeout' }),
      ].join('\n'),
    );

    const app = appFor(dir);
    const [pageResponse, jsonResponse] = await Promise.all([
      app.request('/digest/night'),
      app.request('/api/digest/night'),
    ]);
    const html = await pageResponse.text();
    const result = await jsonResponse.json();

    expect(pageResponse.status).toBe(200);
    expect(pageResponse.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('<table>');
    expect(html).toContain('alpha');
    expect(html).toContain('zeta');
    expect(html).not.toContain('bad json');

    expect(jsonResponse.status).toBe(200);
    expect(jsonResponse.headers.get('content-type')).toContain('application/json');
    expect(result).toMatchObject({ malformedLines: 1 });
    expect(result.rows.map(({ job }: { job: string }) => job)).toEqual(['alpha', 'zeta']);

    const tbody = html.match(/<tbody>([\s\S]*?)<\/tbody>/)?.[1] ?? '';
    const pageJobs = [...tbody.matchAll(/<tr[^>]*>\s*<td>([^<]*)<\/td>/g)].map((match) => match[1]);
    expect(pageJobs).toEqual(result.rows.map(({ job }: { job: string }) => job));
  });

  it('returns 404 for a missing night from both routes', async () => {
    const app = appFor(await makeRunsDir());
    const [pageResponse, jsonResponse] = await Promise.all([
      app.request('/digest/missing'),
      app.request('/api/digest/missing'),
    ]);

    expect(pageResponse.status).toBe(404);
    expect(jsonResponse.status).toBe(404);
  });

  it('renders and returns an empty result for an empty night', async () => {
    const dir = await makeRunsDir();
    await writeFile(join(dir, 'empty.jsonl'), '');
    const app = appFor(dir);
    const [pageResponse, jsonResponse] = await Promise.all([
      app.request('/digest/empty'),
      app.request('/api/digest/empty'),
    ]);

    expect(pageResponse.status).toBe(200);
    expect(await pageResponse.text()).toContain('nothing ran');
    expect(jsonResponse.status).toBe(200);
    expect(await jsonResponse.json()).toEqual({ rows: [], malformedLines: 0 });
  });
});
