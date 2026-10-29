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

describe('digest page', () => {
  it('renders the checked in night as a server rendered table', async () => {
    const res = await appFor(join(process.cwd(), 'runs')).request('/digest/2026-10-28');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('<table>');
    expect(html).toContain('fixtures/refresh');
    expect(html).not.toContain('<script');
  });

  it('renders sorted rows and marks retries and failures', async () => {
    const dir = await makeRunsDir();
    await writeFile(
      join(dir, 'night.jsonl'),
      [
        ...Array.from({ length: 3 }, (_, index) =>
          JSON.stringify({ at: `2026-10-28T0${index + 1}:00:00+01:00`, job: 'zeta', status: 'retry', owner: null }),
        ),
        JSON.stringify({ at: '2026-10-28T04:00:00+01:00', job: 'alpha', status: 'fail', owner: 'rook' }),
        '{bad json',
      ].join('\n'),
    );

    const res = await appFor(dir).request('/digest/night');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html.indexOf('alpha')).toBeLessThan(html.indexOf('zeta'));
    expect(html).toContain('—');
    expect(html).toContain('<tr class="warn">');
    expect(html).toContain('fail');
    expect(html).toContain('retries');
  });

  it('returns 404 when the night file is missing', async () => {
    const res = await appFor(await makeRunsDir()).request('/digest/missing');
    expect(res.status).toBe(404);
  });

  it('renders nothing ran for an empty file', async () => {
    const dir = await makeRunsDir();
    await writeFile(join(dir, 'empty.jsonl'), '');
    const res = await appFor(dir).request('/digest/empty');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });
});

describe('digest JSON API', () => {
  it('returns the reader result with rows in the same order and malformed line count', async () => {
    const dir = await makeRunsDir();
    await writeFile(
      join(dir, 'night.jsonl'),
      [
        JSON.stringify({ at: '2026-10-28T02:00:00+01:00', job: 'zeta', status: 'ok', owner: null }),
        '{bad json',
        JSON.stringify({ at: '2026-10-28T01:00:00+01:00', job: 'alpha', status: 'retry', owner: 'rook', error: 'timeout' }),
      ].join('\n'),
    );

    const res = await appFor(dir).request('/api/digest/night');
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('application/json');
    expect(await res.json()).toEqual({
      rows: [
        {
          job: 'alpha',
          owner: 'rook',
          runs: 1,
          retries: 1,
          lastStatus: 'retry',
          lastError: 'timeout',
          firstAt: '2026-10-28T01:00:00+01:00',
          lastAt: '2026-10-28T01:00:00+01:00',
        },
        {
          job: 'zeta',
          owner: null,
          runs: 1,
          retries: 0,
          lastStatus: 'ok',
          lastError: null,
          firstAt: '2026-10-28T02:00:00+01:00',
          lastAt: '2026-10-28T02:00:00+01:00',
        },
      ],
      malformedLines: 1,
    });
  });

  it('returns 404 when the night file is missing', async () => {
    const res = await appFor(await makeRunsDir()).request('/api/digest/missing');
    expect(res.status).toBe(404);
  });

  it('returns an empty result for an empty night', async () => {
    const dir = await makeRunsDir();
    await writeFile(join(dir, 'empty.jsonl'), '');
    const res = await appFor(dir).request('/api/digest/empty');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ rows: [], malformedLines: 0 });
  });
});
