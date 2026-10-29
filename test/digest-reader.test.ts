import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { readNight } from "../src/digest/read-night.js";

const temporaryDirs: string[] = [];

async function makeRunsDir(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "rig-digest-"));
  temporaryDirs.push(dir);
  return dir;
}

afterEach(async () => {
  await Promise.all(temporaryDirs.splice(0).map((dir) => rm(dir, { recursive: true, force: true })));
});

describe("readNight", () => {
  it("reads the checked in night fixture with five jobs and one malformed line", async () => {
    const { rows, malformedLines } = await readNight(join(process.cwd(), "runs"), "2026-10-28");
    expect(rows).toHaveLength(5);
    expect(malformedLines).toBe(1);
  });

  it("aggregates valid rows, sorts by job, and counts malformed JSON", async () => {
    const dir = await makeRunsDir();
    await writeFile(
      join(dir, "2026-10-28.jsonl"),
      [
        JSON.stringify({ at: "2026-10-28T03:00:00+01:00", job: "zeta", status: "ok", owner: null }),
        JSON.stringify({ at: "2026-10-28T02:00:00+01:00", job: "alpha", status: "retry", owner: "rook", error: "  timeout  " }),
        "{bad json",
        JSON.stringify({ at: "2026-10-28T01:00:00+01:00", job: "alpha", status: "ok", owner: "rook" }),
        JSON.stringify({ at: "2026-10-28T04:00:00+01:00", job: "alpha", status: "ok", owner: "rook" }),
      ].join("\n"),
    );

    const result = await readNight(dir, "2026-10-28");
    expect(result.malformedLines).toBe(1);
    expect(result.rows.map(({ job }) => job)).toEqual(["alpha", "zeta"]);
    expect(result.rows[0]).toEqual({
      job: "alpha",
      owner: "rook",
      runs: 3,
      retries: 1,
      lastStatus: "ok",
      lastError: "  timeout  ",
      firstAt: "2026-10-28T01:00:00+01:00",
      lastAt: "2026-10-28T04:00:00+01:00",
    });
    expect(result.rows[1].owner).toBeNull();
  });

  it("uses chronological timestamps for first and last run even when lines are out of order", async () => {
    const dir = await makeRunsDir();
    await writeFile(
      join(dir, "night.jsonl"),
      [
        JSON.stringify({ at: "2026-10-28T05:00:00+01:00", job: "job", status: "fail", owner: "new", error: "later error" }),
        JSON.stringify({ at: "2026-10-28T02:00:00+01:00", job: "job", status: "retry", owner: "old", error: "older error" }),
      ].join("\n"),
    );

    const { rows } = await readNight(dir, "night");
    expect(rows[0]).toMatchObject({
      firstAt: "2026-10-28T02:00:00+01:00",
      lastAt: "2026-10-28T05:00:00+01:00",
      lastStatus: "fail",
      lastError: "later error",
      owner: "new",
      retries: 1,
    });
  });

  it("counts malformed non-JSON records without throwing", async () => {
    const dir = await makeRunsDir();
    await mkdir(dir, { recursive: true });
    await writeFile(join(dir, "empty.jsonl"), "not json\n[]\n");
    await expect(readNight(dir, "empty")).resolves.toEqual({ rows: [], malformedLines: 2 });
  });
});
