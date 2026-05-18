import type { ExtractedDocument } from "@/lib/agent/types";
import { callKimiChat, getKimiSummaryModel, uploadKimiFile } from "@/lib/agent/skills/parse-document";

const imageExtensions = new Set(["png", "jpg", "jpeg", "webp"]);
const MAX_IMAGE_BYTES = 15 * 1024 * 1024;
const MAX_IMAGES = 4;

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

export function isImageUnderstandingFile(file: File) {
  return file.type.startsWith("image/") || imageExtensions.has(getExtension(file.name));
}

function parseImageUnderstanding(content: string, fileName: string, fileId: string) {
  const normalized = content.trim();
  return {
    fileName,
    fileId,
    content: normalized,
    extractedMarkdown: [`## 图片：${fileName}`, "", normalized].join("\n")
  };
}

function buildKimiImageMessages({
  userText,
  file,
  fileId
}: {
  userText: string;
  file: File;
  fileId: string;
}) {
  return [
    {
      role: "system" as const,
      content:
        "你是 Nexus Agent 的图片理解与 OCR 工具层。请客观分析用户上传的图片，不要编造看不到的细节。优先提取图片中的文字、表格、图表、页面结构、题目信息和关键事实，输出适合继续交给主模型回答或生成文档的 Markdown。"
    },
    {
      role: "user" as const,
      content: [
        {
          type: "text",
          text: [
            `用户问题：${userText || "请分析这张图片。"}`,
            `图片文件名：${file.name}`,
            "",
            "输出要求：",
            "1. 用 Markdown 输出。",
            "2. 包含：图片概览、可见文字/OCR、结构化要点、可用于后续回答或写作的整理内容。",
            "3. 如果图片包含表格，请尽量用 Markdown 表格还原。",
            "4. 如果无法识别或画面不清晰，请明确说明。"
          ].join("\n")
        },
        {
          type: "image_url",
          image_url: { url: `ms://${fileId}` }
        }
      ]
    }
  ];
}

export async function parseImagesWithVision(files: File[], userText: string, signal: AbortSignal): Promise<ExtractedDocument[]> {
  const imageFiles = files.filter(isImageUnderstandingFile).slice(0, MAX_IMAGES);
  const results: ExtractedDocument[] = [];

  for (const file of imageFiles) {
    if (file.size > MAX_IMAGE_BYTES) throw new Error("IMAGE_FILE_TOO_LARGE");
    const fileId = await uploadKimiFile(file, "image", signal);
    const content = await callKimiChat({
      model: process.env.AGENT_KIMI_IMAGE_MODEL || getKimiSummaryModel(),
      messages: buildKimiImageMessages({ userText, file, fileId }),
      signal
    });
    results.push(parseImageUnderstanding(content, file.name, fileId));
  }

  return results;
}
