import { spawn } from "node:child_process";
import path from "node:path";

import type { AcademicPptPreviewDiagnostics } from "./types";

type PreviewToolStatus = "available" | "missing";

export type AcademicPptPreviewToolCheck = {
  status: PreviewToolStatus;
  label: string;
  command?: string;
};

export type AcademicPptPreviewEnvironmentCheck = {
  libreOffice: AcademicPptPreviewToolCheck;
  pdftoppm: AcademicPptPreviewToolCheck;
  nativePreviewAvailable: boolean;
  reason?: string;
  checkedAt: string;
};

type PreviewToolCandidate = {
  command?: string;
  label: string;
};

const WINDOWS_LIBREOFFICE_CANDIDATES: PreviewToolCandidate[] = [
  {
    command: "C:\\Program Files\\LibreOffice\\program\\soffice.exe",
    label: "Windows LibreOffice"
  },
  {
    command: "C:\\Program Files (x86)\\LibreOffice\\program\\soffice.exe",
    label: "Windows LibreOffice x86"
  }
];

export const ACADEMIC_PPT_PREVIEW_FALLBACK_REASONS = {
  libreOfficeMissing: "未检测到 LibreOffice / soffice，已降级为结构化预览。",
  pdftoppmMissing: "未检测到 pdftoppm，已降级为结构化预览。",
  pptxToPdfFailed: "PPTX 转 PDF 失败，已降级为结构化预览。",
  pdfToPngFailed: "PDF 转 PNG 失败，已降级为结构化预览。"
} as const;

function compactPreviewMessage(value: string) {
  return value
    .replace(/[A-Za-z]:[\\/][^\s"'<>]+/g, "[local-path]")
    .replace(/\/(?:Users|home|var|tmp|mnt)\/[^\s"'<>]+/g, "[local-path]")
    .replace(/[A-Z0-9_]*(?:API[_-]?KEY|SECRET|TOKEN|PASSWORD)[A-Z0-9_]*/gi, "[sensitive-config]")
    .replace(/\bAuthorization\b/gi, "[auth-header]")
    .replace(/\bBearer\s+[A-Za-z0-9._-]+/gi, "[bearer-token]")
    .replace(/\s+/g, " ")
    .trim();
}

function safeCommandName(command: string) {
  return path.basename(command).replace(/^.*[\\/]/, "") || "preview-tool";
}

function getLibreOfficeCandidates(): PreviewToolCandidate[] {
  return [
    { command: process.env.LIBREOFFICE_PATH, label: "LIBREOFFICE_PATH" },
    { command: process.env.SOFFICE_PATH, label: "SOFFICE_PATH" },
    { command: "soffice", label: "PATH soffice" },
    { command: "libreoffice", label: "PATH libreoffice" },
    ...(process.platform === "win32" ? WINDOWS_LIBREOFFICE_CANDIDATES : [])
  ].filter((candidate): candidate is Required<PreviewToolCandidate> => Boolean(candidate.command));
}

function getPdfToImageCandidates(): PreviewToolCandidate[] {
  return [
    { command: process.env.PDFTOPPM_PATH, label: "PDFTOPPM_PATH" },
    { command: "pdftoppm", label: "PATH pdftoppm" }
  ].filter((candidate): candidate is Required<PreviewToolCandidate> => Boolean(candidate.command));
}

export function runAcademicPptPreviewCommand(command: string, args: string[], timeoutMs = 60_000) {
  return new Promise<{ stdout: string; stderr: string }>((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`${safeCommandName(command)} timeout`));
    }, timeoutMs);

    child.stdout.on("data", (chunk) => {
      stdout += String(chunk);
    });
    child.stderr.on("data", (chunk) => {
      stderr += String(chunk);
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
        return;
      }
      const detail = compactPreviewMessage(stderr || stdout);
      reject(new Error(`${safeCommandName(command)} exited ${code}${detail ? `: ${detail}` : ""}`.slice(0, 300)));
    });
  });
}

async function findWorkingPreviewTool(candidates: PreviewToolCandidate[], args: string[]) {
  for (const candidate of candidates) {
    if (!candidate.command) continue;
    try {
      await runAcademicPptPreviewCommand(candidate.command, args, 10_000);
      return {
        status: "available" as const,
        label: candidate.label,
        command: candidate.command
      };
    } catch {
      // Missing conversion tools are expected on developer machines.
    }
  }

  return {
    status: "missing" as const,
    label: "not detected"
  };
}

export async function checkAcademicPptPreviewEnvironment(): Promise<AcademicPptPreviewEnvironmentCheck> {
  const [libreOffice, pdftoppm] = await Promise.all([
    findWorkingPreviewTool(getLibreOfficeCandidates(), ["--version"]),
    findWorkingPreviewTool(getPdfToImageCandidates(), ["-h"])
  ]);

  const nativePreviewAvailable = libreOffice.status === "available" && pdftoppm.status === "available";
  const reason =
    libreOffice.status === "missing"
      ? ACADEMIC_PPT_PREVIEW_FALLBACK_REASONS.libreOfficeMissing
      : pdftoppm.status === "missing"
        ? ACADEMIC_PPT_PREVIEW_FALLBACK_REASONS.pdftoppmMissing
        : undefined;

  return {
    libreOffice,
    pdftoppm,
    nativePreviewAvailable,
    reason,
    checkedAt: new Date().toISOString()
  };
}

export function toAcademicPptPreviewDiagnostics(
  environment: AcademicPptPreviewEnvironmentCheck,
  reason = environment.reason
): AcademicPptPreviewDiagnostics {
  return {
    libreOffice: environment.libreOffice.status,
    pdftoppm: environment.pdftoppm.status,
    nativePreview: environment.nativePreviewAvailable ? "available" : "unavailable",
    reason,
    checkedAt: environment.checkedAt
  };
}
