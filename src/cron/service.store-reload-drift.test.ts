import { describe, expect, it, vi } from "vitest";
import { CronService } from "./service.js";
import { createCronStoreHarness } from "./service.test-harness.js";
import fs from "node:fs/promises";
import path from "node:path";

const cronStoreDriftFixtures = createCronStoreHarness({ prefix: "openclaw-cron-drift-" });

describe("cron store reload drift", () => {
  it("recomputes nextRunAtMs if a job's schedule expression is edited externally", async () => {
    vi.useFakeTimers();
    const store = await cronStoreDriftFixtures.makeStorePath();
    // Ensure dir exists before creating the store file
    await fs.mkdir(path.dirname(store.storePath), { recursive: true });
    await fs.writeFile(store.storePath, '{"version": 1, "jobs": []}', "utf-8");

    const now = Date.parse("2026-04-24T12:00:00.000Z"); // Friday noon
    vi.setSystemTime(now);

    const cron = new CronService({
      cronEnabled: true,
      storePath: store.storePath,
      log: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
      enqueueSystemEvent: vi.fn(),
      requestHeartbeatNow: vi.fn(),
      runIsolatedAgentJob: vi.fn().mockResolvedValue({ status: "ok" }),
    });

    // Add a job scheduled for Saturday 6 AM
    const job = await cron.add({
      name: "daily",
      enabled: true,
      schedule: { kind: "cron", expr: "0 6 * * *" }, // Every day at 6 AM
      sessionTarget: "main",
      wakeMode: "next-heartbeat",
      payload: { kind: "systemEvent", text: "hello" }
    });

    // Verify it is scheduled for Saturday 6 AM
    const nextRun = job.state.nextRunAtMs;
    const expectedSaturday6AM = Date.parse("2026-04-25T06:00:00.000Z");
    expect(nextRun).toBe(expectedSaturday6AM);

    await cron.start();

    // Now, simulate an external edit to jobs.json (e.g. user manually edits to Mon-Fri 5:30 AM)
    const raw = await fs.readFile(store.storePath, "utf-8");
    const parsed = JSON.parse(raw);
    parsed.jobs[0].schedule.expr = "30 5 * * 1-5"; // Weekdays only
    vi.advanceTimersByTime(50);
    await fs.writeFile(store.storePath, JSON.stringify(parsed, null, 2), "utf-8");
    vi.advanceTimersByTime(50);

    // Fast-forward to next tick, let the timer tick happen so it reloads
    vi.setSystemTime(now + 60_000);
    vi.advanceTimersByTime(60_000);

    // Give promises a chance to flush
    await cron.status();

    // Verify that the next run is now Monday 5:30 AM, NOT Saturday 6 AM
    const expectedMonday530AM = Date.parse("2026-04-27T05:30:00.000Z");
    for (let i = 0; i < 20; i++) {
      if (cron.getJob(job.id)?.state.nextRunAtMs === expectedMonday530AM) { break; }
      vi.advanceTimersByTime(5); await new Promise(resolve => process.nextTick(resolve));
    }
    const updatedJob = cron.getJob(job.id);
    expect(updatedJob?.state.nextRunAtMs).toBe(expectedMonday530AM);

    cron.stop();
    vi.useRealTimers();
  });
});
