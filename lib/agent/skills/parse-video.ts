import type { ExtractedDocument } from "@/lib/agent/types";
import { callKimiChat, getKimiSummaryModel, uploadKimiFile } from "@/lib/agent/skills/parse-document";

const videoExtensions = new Set(["mp4", "mov", "webm", "m4v"]);
const MAX_VIDEO_BYTES = 80 * 1024 * 1024;
const MAX_VIDEOS = 2;

function getExtension(fileName: string) {
  return fileName.split(".").pop()?.toLowerCase() || "";
}

export function isVideoUnderstandingFile(file: File) {
  return file.type.startsWith("video/") || videoExtensions.has(getExtension(file.name));
}

function buildKimiVideoMessages({
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
        "你是 Nexus Agent 的视频理解工具层。请客观分析用户上传的视频，不要编造看不到的内容。请提取视频主题、场景变化、关键画面、可见文字、人物/物体行为、时间顺序和可用于后续回答或写作的要点。"
    },
    {
      role: "user" as const,
      content: [
        {
          type: "text",
          text: [
            `用户问题：${userText || "请总结这个视频。"}`,
            `视频文件名：${file.name}`,
            "",
            "输出要求：",
            "1. 用 Markdown 输出。",
            "2. 包含：视频概览、分段要点、可见文字、关键结论、后续回答可用素材。",
            "3. 如果无法识别或视频不清晰，请明确说明。"
          ].join("\n")
        },
        {
          type: "video_url",
          video_url: { url: `ms://${fileId}` }
        }
      ]
    }
  ];
}

function parseVideoUnderstanding(content: string, fileName: string, fileId: string) {
  const normalized = content.trim();
  return {
    fileName,
    fileId,
    content: normalized,
    extractedMarkdown: [`## 视频：${fileName}`, "", normalized].join("\n")
  };
}

export async function parseVideosWithKimi(files: File[], userText: string, signal: AbortSignal): Promise<ExtractedDocument[]> {
  const videoFiles = files.filter(isVideoUnderstandingFile).slice(0, MAX_VIDEOS);
  const results: ExtractedDocument[] = [];

  for (const file of videoFiles) {
    if (file.size > MAX_VIDEO_BYTES) throw new Error("VIDEO_FILE_TOO_LARGE");
    const fileId = await uploadKimiFile(file, "video", signal);
    const content = await callKimiChat({
      model: process.env.AGENT_KIMI_VIDEO_MODEL || getKimiSummaryModel(),
      messages: buildKimiVideoMessages({ userText, file, fileId }),
      signal
    });
    results.push(parseVideoUnderstanding(content, file.name, fileId));
  }

  return results;
}
