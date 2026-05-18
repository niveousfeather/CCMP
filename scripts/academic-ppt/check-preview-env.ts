import { checkAcademicPptPreviewEnvironment } from "../../lib/smart-tools/academic-ppt/preview-tools";

function installAdvice() {
  if (process.platform === "win32") {
    return [
      "Windows 安装建议：",
      "- 安装 LibreOffice，并确保 soffice.exe 可用，或设置 LIBREOFFICE_PATH / SOFFICE_PATH。",
      "- 安装 Poppler for Windows，并将 pdftoppm 加入 PATH，或设置 PDFTOPPM_PATH。"
    ];
  }
  if (process.platform === "darwin") {
    return [
      "macOS 安装建议：",
      "- brew install --cask libreoffice",
      "- brew install poppler"
    ];
  }
  return [
    "Linux 安装建议：",
    "- 安装 libreoffice / soffice。",
    "- 安装 poppler-utils，确保 pdftoppm 可用。"
  ];
}

async function main() {
  const result = await checkAcademicPptPreviewEnvironment();
  const lines = [
    "academic-ppt preview environment",
    `LibreOffice: ${result.libreOffice.status}`,
    `pdftoppm: ${result.pdftoppm.status}`,
    `Native preview: ${result.nativePreviewAvailable ? "available" : "unavailable"}`,
    `Reason: ${result.reason || "PPTX -> PDF -> PNG conversion tools are available."}`
  ];

  if (!result.nativePreviewAvailable) lines.push("", ...installAdvice());

  process.stderr.write(`${lines.join("\n")}\n`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "academic-ppt preview environment check failed");
  process.exit(1);
});
