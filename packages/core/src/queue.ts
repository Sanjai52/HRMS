export type JobName = "test-job" | "payroll-chunk" | "notification" | "crawler-run" | "announcement-fanout";

export interface JobEnvelope<T = unknown> {
  jobId: string;
  name: JobName;
  data: T;
}

export interface JobQueue {
  enqueue<T>(name: JobName, data: T, opts?: { jobId?: string }): Promise<{ jobId: string }>;
  close(): Promise<void>;
}
