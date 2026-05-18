export type GenerationKind = "agent" | "image" | "model3d" | "video";

type QueuedGeneration = {
  id: string;
  run: () => Promise<void>;
};

const queues = new Map<GenerationKind, QueuedGeneration[]>();
const runningCounts = new Map<GenerationKind, number>();
const queuedIds = new Map<GenerationKind, Set<string>>();
const runningIds = new Map<GenerationKind, Set<string>>();

export function enqueueGenerationExecution(kind: GenerationKind, id: string, run: () => Promise<void>) {
  const activeIds = runningIds.get(kind) || new Set<string>();
  const waitingIds = queuedIds.get(kind) || new Set<string>();
  if (activeIds.has(id) || waitingIds.has(id)) return false;

  const queue = queues.get(kind) || [];
  queue.push({ id, run });
  queues.set(kind, queue);
  waitingIds.add(id);
  queuedIds.set(kind, waitingIds);
  drainGenerationQueue(kind);
  return true;
}

export function getGenerationQueueSnapshot(kind: GenerationKind) {
  return {
    queued: queues.get(kind)?.length || 0,
    running: runningCounts.get(kind) || 0
  };
}

function drainGenerationQueue(kind: GenerationKind) {
  const queue = queues.get(kind) || [];
  const limit = getGenerationConcurrencyLimit(kind);
  let running = runningCounts.get(kind) || 0;

  while (queue.length && running < limit) {
    const item = queue.shift();
    if (!item) break;
    running += 1;
    runningCounts.set(kind, running);
    const waitingIds = queuedIds.get(kind) || new Set<string>();
    const activeIds = runningIds.get(kind) || new Set<string>();
    waitingIds.delete(item.id);
    activeIds.add(item.id);
    queuedIds.set(kind, waitingIds);
    runningIds.set(kind, activeIds);
    void item
      .run()
      .catch((error) => {
        console.error(`[generation:queue] kind=${kind} id=${item.id} unhandled=${error instanceof Error ? error.message : "unknown"}`);
      })
      .finally(() => {
        runningCounts.set(kind, Math.max(0, (runningCounts.get(kind) || 1) - 1));
        const nextActiveIds = runningIds.get(kind) || new Set<string>();
        nextActiveIds.delete(item.id);
        runningIds.set(kind, nextActiveIds);
        drainGenerationQueue(kind);
      });
  }

  queues.set(kind, queue);
}

function getGenerationConcurrencyLimit(kind: GenerationKind) {
  const specific = process.env[`GENERATION_${kind.toUpperCase()}_CONCURRENCY`];
  const fallback = process.env.GENERATION_QUEUE_CONCURRENCY;
  const defaultValue = kind === "image" ? 2 : 1;
  return clampPositiveInt(specific || fallback, defaultValue);
}

function clampPositiveInt(value: string | undefined, fallback: number) {
  const parsed = Number.parseInt(value || "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.min(parsed, 8);
}
