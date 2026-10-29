import { readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DigestRow, ReadNight, RunStatus } from "./types.js";

interface RunRecord {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
}

function isRunRecord(value: unknown): value is RunRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.at === "string" &&
    Number.isFinite(Date.parse(record.at)) &&
    typeof record.job === "string" &&
    (record.status === "ok" || record.status === "retry" || record.status === "fail") &&
    (typeof record.owner === "string" || record.owner === null) &&
    (record.error === undefined || typeof record.error === "string")
  );
}

export const readNight: ReadNight = async (runsDir, night) => {
  const contents = await readFile(join(runsDir, `${night}.jsonl`), "utf8");
  const byJob = new Map<string, { row: DigestRow; firstTime: number; lastTime: number; errorTime: number }>();
  let malformedLines = 0;

  for (const line of contents.split(/\r?\n/)) {
    if (line.trim() === "") continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      malformedLines += 1;
      continue;
    }
    if (!isRunRecord(parsed)) {
      malformedLines += 1;
      continue;
    }

    const time = Date.parse(parsed.at);
    const current = byJob.get(parsed.job);
    if (!current) {
      byJob.set(parsed.job, {
        row: {
          job: parsed.job,
          owner: parsed.owner,
          runs: 1,
          retries: parsed.status === "retry" ? 1 : 0,
          lastStatus: parsed.status,
          lastError: parsed.error?.trim() ? parsed.error : null,
          firstAt: parsed.at,
          lastAt: parsed.at,
        },
        firstTime: time,
        lastTime: time,
        errorTime: parsed.error?.trim() ? time : Number.NEGATIVE_INFINITY,
      });
      continue;
    }

    const { row } = current;
    row.runs += 1;
    if (parsed.status === "retry") row.retries += 1;
    if (time < current.firstTime) {
      current.firstTime = time;
      row.firstAt = parsed.at;
    }
    if (time >= current.lastTime) {
      current.lastTime = time;
      row.lastAt = parsed.at;
      row.lastStatus = parsed.status;
      row.owner = parsed.owner;
    }
    if (parsed.error?.trim() && time >= current.errorTime) {
      current.errorTime = time;
      row.lastError = parsed.error;
    }
  }

  const rows = [...byJob.values()].map(({ row }) => row).sort((a, b) => a.job.localeCompare(b.job));
  return { rows, malformedLines };
};
