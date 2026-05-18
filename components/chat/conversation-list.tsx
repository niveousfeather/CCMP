"use client";

import { Heart, MessageSquare, Search, Trash2 } from "lucide-react";

import { Conversation } from "@/components/chat/chat-data";
import { Badge } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onToggleFavorite,
  onDelete
}: {
  conversations: Conversation[];
  activeId: string;
  onSelect: (id: string) => void;
  onToggleFavorite?: (conversation: Conversation) => void;
  onDelete?: (id: string) => void;
}) {
  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-[color:var(--color-border)] bg-[var(--color-bg-elevated)] p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-base font-medium text-[var(--color-text)]">历史对话</h2>
          <p className="mt-1 text-xs text-[var(--color-text-faint)]">当前账号的真实对话记录</p>
        </div>
        <MessageSquare className="h-4 w-4 text-[var(--color-text-muted)]" />
      </div>
      <div className="mb-4 flex h-9 items-center gap-2 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-soft)] px-3">
        <Search className="h-4 w-4 text-[var(--color-text-faint)]" />
        <span className="text-xs text-[var(--color-text-faint)]">搜索对话</span>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pr-1">
        {conversations.length ? (
          <div className="grid gap-2">
            {conversations.map((conversation) => {
              const active = conversation.conversationId === activeId;
              return (
                <button
                  key={conversation.conversationId}
                  type="button"
                  onClick={() => onSelect(conversation.conversationId)}
                  className={cn(
                    "rounded-lg border p-3 text-left transition",
                    active
                      ? "border-[color:var(--color-border-strong)] bg-[var(--color-soft)]"
                      : "border-[color:var(--color-border)] bg-transparent hover:bg-[var(--color-hover)]"
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="line-clamp-1 text-sm font-medium text-[var(--color-text)]">{conversation.title}</h3>
                    <div className="flex shrink-0 items-center gap-1">
                      <Badge>{conversation.status}</Badge>
                      {onToggleFavorite && !conversation.conversationId.startsWith("draft-") ? (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            onToggleFavorite(conversation);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              onToggleFavorite(conversation);
                            }
                          }}
                          className="grid h-6 w-6 place-items-center rounded-md text-[var(--color-text-faint)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
                          aria-label="切换收藏"
                        >
                          <Heart className={cn("h-3.5 w-3.5", conversation.isFavorite && "fill-current")} />
                        </span>
                      ) : null}
                      {onDelete && !conversation.conversationId.startsWith("draft-") ? (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            event.stopPropagation();
                            onDelete(conversation.conversationId);
                          }}
                          onKeyDown={(event) => {
                            if (event.key === "Enter" || event.key === " ") {
                              event.preventDefault();
                              event.stopPropagation();
                              onDelete(conversation.conversationId);
                            }
                          }}
                          className="grid h-6 w-6 place-items-center rounded-md text-[var(--color-text-faint)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
                          aria-label="删除对话"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--color-text-muted)]">
                    {conversation.summary}
                  </p>
                  <div className="mt-3 flex items-center justify-between text-xs text-[var(--color-text-faint)]">
                    <span>Nexus AI</span>
                    <span>{conversation.updatedAt}</span>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <EmptyState
            icon={MessageSquare}
            title="暂无历史对话"
            description="发送第一条消息后，对话会保存到这里。"
            className="py-16"
          />
        )}
      </div>
    </aside>
  );
}
