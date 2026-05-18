import { Database, UploadCloud } from "lucide-react";

import { ChatAttachment } from "@/components/chat/chat-data";
import { ChatAttachmentCard } from "@/components/chat/chat-attachment-card";
import { Badge, Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";

export function ReferencePanel({
  files,
  onPreviewImage,
  onOpenFile
}: {
  model: string;
  files: ChatAttachment[];
  onPreviewImage: (attachment: ChatAttachment) => void;
  onOpenFile: (attachment: ChatAttachment) => void;
}) {
  return (
    <aside className="grid h-full min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden">
      <Card className="p-4">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-base font-medium text-[var(--color-text)]">智能体信息</h2>
          <Badge>在线</Badge>
        </div>
        <div className="rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] p-4">
          <p className="text-sm font-medium text-[var(--color-text)]">Nexus AI</p>
          <p className="mt-2 text-xs leading-5 text-[var(--color-text-muted)]">
            Nexus AI 是平台级智能创作中枢，统一调度多模态能力与内容生成链路，提供稳定、克制、可扩展的协同体验。
          </p>
        </div>
      </Card>

      <Card className="min-h-0 overflow-hidden p-4">
        <div className="mb-4 flex items-center gap-2">
          <Database className="h-4 w-4 text-[var(--color-text-muted)]" />
          <h2 className="text-base font-medium text-[var(--color-text)]">上传文件</h2>
        </div>
        {files.length ? (
          <div className="grid max-h-full gap-2 overflow-y-auto pr-1">
            {files.map((file) => (
              <ChatAttachmentCard
                key={`${file.id}-${file.status}`}
                attachment={file}
                onPreview={onPreviewImage}
                onOpenFile={onOpenFile}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            icon={UploadCloud}
            title="暂无上传文件"
            description="拖拽文件到对话区域，或点击输入框左侧附件按钮添加文件。"
          />
        )}
      </Card>
    </aside>
  );
}
