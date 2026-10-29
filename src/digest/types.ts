export type RunStatus = "ok" | "retry" | "fail";

export interface DigestRow {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
}

export interface ReadNightResult {
  rows: DigestRow[];
  malformedLines: number;
}

export type ReadNight = (runsDir: string, night: string) => Promise<ReadNightResult>;
