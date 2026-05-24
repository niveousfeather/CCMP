import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function readWorkspaceFile(filePath: string) {
  return readFileSync(path.join(root, filePath), "utf8");
}

function assertIncludes(source: string, needle: string, label: string) {
  if (!source.includes(needle)) {
    throw new Error(`${label}: missing ${needle}`);
  }
}

function assertNotIncludes(source: string, needle: string, label: string) {
  if (source.includes(needle)) {
    throw new Error(`${label}: must not include ${needle}`);
  }
}

const workbench = readWorkspaceFile("components/smart-tools/academic-ppt/AcademicPptWorkbench.tsx");
assertIncludes(workbench, "failedStage", "workbench should track backend failedStage");
assertIncludes(workbench, "lastCompletedStep", "workbench should track last completed stage");
assertIncludes(workbench, "const failedStep =", "pipeline should derive failed step from failedStage");
assertNotIncludes(workbench, "failed: 0", "failed currentStep must not permanently mark parse step failed");
assertIncludes(workbench, 'snapshot.status === "failed"', "workbench should only surface task error while failed");

const monitor = readWorkspaceFile("components/smart-tools/academic-ppt/AcademicPptTaskMonitor.tsx");
assertIncludes(monitor, "previousFailedStage", "monitor should show resumed previous failure context");
assertIncludes(monitor, 'status === "failed"', "monitor should gate fatal errors on failed status");

const serverTaskStore = readWorkspaceFile("lib/smart-tools/academic-ppt/server-task-store.ts");
assertIncludes(serverTaskStore, "failedStage", "task snapshot should expose failedStage");
assertIncludes(serverTaskStore, "errorSummary", "task snapshot should expose errorSummary");
assertIncludes(serverTaskStore, "progressState", "task snapshot should expose structured progress state");
assertIncludes(serverTaskStore, "ensureAcademicPptPptxDownloadable", "task store should validate downloadable PPTX before marking recovered completion");

const sidecarClient = readWorkspaceFile("lib/smart-tools/academic-ppt/sidecar-client.ts");
assertIncludes(sidecarClient, "previousFailedStage", "resume should preserve previous failed stage");
assertIncludes(sidecarClient, "cleared stale error state", "resume should log stale error cleanup");
assertIncludes(sidecarClient, "resumeCompletedTaskIfOutputIsValid", "resume should complete already generated valid PPTX");
assertIncludes(
  sidecarClient,
  'record.currentStep !== "completed"',
  "resume failure-stage inference must not report completed as the previous failed stage"
);

const engineClient = readWorkspaceFile("lib/smart-tools/academic-ppt/tools-engine-client.ts");
assertIncludes(engineClient, "ensureAcademicPptPptxDownloadable", "engine completion should validate PPTX before success");
assertIncludes(engineClient, "Visual pipeline completed with warnings", "visual degradation should not hide valid final PPTX");
assertNotIncludes(engineClient, 'modelSource: "paper-ppt-agent-degraded"', "valid generated PPTX should not be persisted as a failed degraded source");

console.log("academic-ppt task state checks passed");
