"use client";

import {
  BarChart3,
  Bot,
  ChevronDown,
  FileText,
  History,
  Image,
  LayoutDashboard,
  LogOut,
  Menu,
  MoreHorizontal,
  Box,
  Network,
  Search,
  Settings,
  Sparkles,
  Users,
  Video
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ReactNode, useEffect, useMemo, useRef, useState } from "react";

import { BrandLogo } from "@/components/brand-logo";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type User = {
  username: string;
  role: "ADMIN" | "TEACHER" | "STUDENT";
};

type RecentConversation = {
  conversationId: string;
  title: string;
  summary?: string;
  updatedAt?: string;
};

type ConversationsResponse = {
  conversations?: RecentConversation[];
};

const navItems = [
  { href: "/workspace", label: "工作台", icon: LayoutDashboard },
  { href: "/chat", label: "Nexus Agent", icon: Bot },
  { href: "/smart-tools", label: "智能工具", icon: Sparkles },
  { href: "/model3d", label: "3D工作区", icon: Box },
  { href: "/image", label: "图片生成", icon: Image },
  { href: "/video", label: "视频生成", icon: Video },
  { href: "/history", label: "历史记录", icon: History },
  { href: "/settings", label: "设置", icon: Settings }
];

const agentSubItems = [
  { href: "/chat?view=chat", label: "新对话", icon: FileText, newDraft: true },
  { href: "/chat?view=discover", label: "发现智能体", icon: Search },
  { href: "/chat?view=graph", label: "知识图谱", icon: Network }
];

const navActiveClass =
  "border border-blue-200 bg-gradient-to-r from-blue-50 to-white text-blue-700 shadow-sm";

export function AppShell({ user, children }: { user: User; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const isAcademicPptWorkbench = pathname === "/smart-tools/academic-ppt";
  const isWidePage =
    pathname === "/chat" ||
    pathname === "/model3d" ||
    pathname === "/image" ||
    pathname === "/video" ||
    isAcademicPptWorkbench;
  const isAgentPage = pathname === "/chat";
  const items = useMemo(
    () =>
      user.role === "ADMIN"
        ? [...navItems, { href: "/analytics", label: "数据分析", icon: BarChart3 }, { href: "/users", label: "用户", icon: Users }]
        : navItems,
    [user.role]
  );

  useEffect(() => {
    if (isAcademicPptWorkbench) return;

    const hrefs = new Set([...items.map((item) => item.href), ...agentSubItems.map((item) => item.href)]);
    hrefs.forEach((href) => {
      try {
        router.prefetch(href);
      } catch {
        // Prefetch is a best-effort navigation hint; page loading still works without it.
      }
    });
  }, [isAcademicPptWorkbench, items, router]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <div className="min-h-screen">
      <aside className="fixed left-0 top-0 z-30 hidden h-screen w-56 border-r border-[color:var(--color-border)] bg-[var(--color-bg-elevated)] p-3 backdrop-blur lg:block">
        <Link href="/" className="mb-8 flex h-12 items-center gap-3 px-2">
          <BrandLogo />
        </Link>

        <nav className="grid gap-1">
          {isAgentPage ? <AgentNavigation items={items} /> : <DefaultNavigation items={items} pathname={pathname} />}
        </nav>
      </aside>

      <div className="lg:pl-56">
        <header className="sticky top-0 z-20 border-b border-[color:var(--color-border)] bg-[var(--color-bg)] px-4 backdrop-blur md:px-8">
          <div
            className={cn(
              "mx-auto flex h-16 w-full items-center justify-between",
              isWidePage ? "max-w-none" : "max-w-[1360px]"
            )}
          >
            <div className="flex items-center gap-3">
              <Menu className="h-5 w-5 text-[var(--color-text-muted)] lg:hidden" />
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <ThemeToggle />
              <div className="hidden text-right sm:block">
                <p className="text-sm text-[var(--color-text)]">{user.username}</p>
                <p className="text-xs text-[var(--color-text-faint)]">
                  {user.role === "ADMIN" ? "管理员" : user.role === "STUDENT" ? "学生" : "教师"}
                </p>
              </div>
              <Button variant="ghost" size="icon" onClick={logout} aria-label="退出登录">
                <LogOut className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </header>

        <main
          className={cn(
            "mx-auto w-full px-4 py-8 pb-24 md:px-8 lg:pb-8",
            isAcademicPptWorkbench && "px-3 py-3 md:px-4 md:py-4 lg:pb-4",
            isWidePage ? "max-w-none" : "max-w-[1360px]"
          )}
        >
          {children}
        </main>
      </div>

      <nav className="fixed bottom-0 left-0 right-0 z-30 grid grid-cols-5 border-t border-[color:var(--color-border)] bg-[var(--color-bg-elevated)] px-2 py-2 backdrop-blur lg:hidden">
        {[navItems[0], navItems[1], navItems[2], navItems[3], navItems[5]].map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "grid place-items-center gap-1 rounded-lg py-2 text-[11px] text-[var(--color-text-faint)]",
                active && navActiveClass
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function DefaultNavigation({
  items,
  pathname
}: {
  items: Array<{ href: string; label: string; icon: typeof Bot }>;
  pathname: string;
}) {
  return (
    <>
      {items.map((item) => {
        const Icon = item.icon;
        const active = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex h-10 items-center gap-3 rounded-lg border border-transparent px-3 text-sm text-[var(--color-text-muted)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]",
              active && navActiveClass
            )}
          >
            <Icon className="h-4 w-4" />
            {item.label}
          </Link>
        );
      })}
    </>
  );
}

function AgentNavigation({
  items
}: {
  items: Array<{ href: string; label: string; icon: typeof Bot }>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [recentConversations, setRecentConversations] = useState<RecentConversation[]>([]);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    loadRecentConversations();
    const handleRefresh = () => loadRecentConversations();
    window.addEventListener("nexus-chat-conversations-updated", handleRefresh);
    return () => window.removeEventListener("nexus-chat-conversations-updated", handleRefresh);
  }, []);

  useEffect(() => {
    const saved = window.localStorage.getItem("nexus-agent-pinned-conversations");
    if (saved) setPinnedIds(JSON.parse(saved) as string[]);
  }, []);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!menuRef.current?.contains(event.target as Node)) setOpenMenuId(null);
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  const sortedConversations = useMemo(() => {
    const pinRank = new Map(pinnedIds.map((id, index) => [id, index]));
    return [...recentConversations].sort((a, b) => {
      const aPinned = pinRank.has(a.conversationId);
      const bPinned = pinRank.has(b.conversationId);
      if (aPinned && bPinned) return pinRank.get(a.conversationId)! - pinRank.get(b.conversationId)!;
      if (aPinned) return -1;
      if (bPinned) return 1;
      return 0;
    });
  }, [pinnedIds, recentConversations]);

  async function loadRecentConversations() {
    try {
      const response = await fetch("/api/ai/chat/conversations");
      const data = (await response.json().catch(() => ({}))) as ConversationsResponse;
      if (response.ok) setRecentConversations((data.conversations || []).slice(0, 12));
    } catch {
      setRecentConversations([]);
    }
  }

  function createNewDraftHref() {
    return `/chat?view=chat&draft=${Date.now()}`;
  }

  function getConversationTitle(conversation: RecentConversation) {
    const source = conversation.title && conversation.title !== "新对话" ? conversation.title : conversation.summary || "新对话";
    const compact = source.replace(/\s+/g, " ").trim();
    return compact.length > 15 ? `${compact.slice(0, 15)}...` : compact || "新对话";
  }

  function togglePin(conversationId: string) {
    setPinnedIds((current) => {
      const next = current.includes(conversationId)
        ? current.filter((id) => id !== conversationId)
        : [conversationId, ...current];
      window.localStorage.setItem("nexus-agent-pinned-conversations", JSON.stringify(next));
      return next;
    });
    setOpenMenuId(null);
  }

  async function renameConversation(conversation: RecentConversation) {
    const nextTitle = window.prompt("重命名会话", getConversationTitle(conversation))?.trim();
    if (!nextTitle) return;
    const response = await fetch(`/api/ai/chat/conversations/${encodeURIComponent(conversation.conversationId)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: nextTitle })
    });
    if (response.ok) {
      setRecentConversations((current) =>
        current.map((item) => (item.conversationId === conversation.conversationId ? { ...item, title: nextTitle } : item))
      );
      window.dispatchEvent(new Event("nexus-chat-conversations-updated"));
    }
    setOpenMenuId(null);
  }

  async function deleteConversation(conversationId: string) {
    const confirmed = window.confirm("确定删除这条对话记录吗？");
    if (!confirmed) return;
    const response = await fetch(`/api/ai/chat/conversations/${encodeURIComponent(conversationId)}`, { method: "DELETE" });
    if (response.ok) {
      setRecentConversations((current) => current.filter((item) => item.conversationId !== conversationId));
      if (pathname === "/chat") router.push(createNewDraftHref());
    }
    setOpenMenuId(null);
  }

  const workspaceItem = items.find((item) => item.href === "/workspace");
  const WorkspaceIcon = workspaceItem?.icon || LayoutDashboard;
  const agentView = searchParams.get("view") || (searchParams.get("conversationId") ? "chat" : "chat");

  return (
    <>
      {workspaceItem ? (
        <Link
          href={workspaceItem.href}
          className="mb-2 flex h-10 items-center gap-3 rounded-lg border border-transparent px-3 text-sm text-[var(--color-text-muted)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
        >
          <WorkspaceIcon className="h-4 w-4" />
          {workspaceItem.label}
        </Link>
      ) : null}

      <div className="mb-2 w-full overflow-hidden rounded-xl border border-[color:var(--color-border)] bg-[var(--color-soft)] p-2">
        <div className="flex h-10 items-center justify-between rounded-lg border border-blue-200 bg-gradient-to-r from-blue-50 to-white px-2 text-sm font-semibold text-blue-700 shadow-sm">
          <span className="flex items-center gap-3">
            <Bot className="h-4 w-4" />
            Nexus Agent
          </span>
          <ChevronDown className="h-4 w-4 text-[var(--color-text-faint)]" />
        </div>
        <div className="mt-1 grid gap-1">
          {agentSubItems.map((item) => {
            const Icon = item.icon;
            const view = new URLSearchParams(item.href.split("?")[1] || "").get("view") || "chat";
            const active = agentView === view;
            return (
              <Link
                key={item.href}
                href={item.href}
                onClick={
                  item.newDraft
                    ? (event) => {
                        event.preventDefault();
                        router.push(createNewDraftHref());
                      }
                    : undefined
                }
                className={cn(
                  "flex h-9 items-center gap-3 rounded-lg border border-transparent px-3 text-sm text-[var(--color-text-muted)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]",
                  active && navActiveClass
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </div>
        <div className="mt-3 border-t border-[color:var(--color-border)] pt-3">
          <div className="mb-1 px-2 text-xs font-medium text-[var(--color-text-faint)]">最近对话</div>
          <div className="grid max-h-[36vh] min-w-0 gap-1 overflow-y-auto overflow-x-hidden pr-1">
            {sortedConversations.length ? (
              sortedConversations.map((conversation) => {
                const pinned = pinnedIds.includes(conversation.conversationId);
                return (
                  <div key={conversation.conversationId} className="group relative flex h-9 min-w-0 items-center gap-1 overflow-visible">
                    <Link
                      href={`/chat?view=chat&conversationId=${encodeURIComponent(conversation.conversationId)}`}
                      className="min-w-0 flex-1 overflow-hidden rounded-lg px-3 py-2 text-xs text-[var(--color-text-muted)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
                      title={getConversationTitle(conversation)}
                    >
                      <span className="block truncate">{pinned ? "置顶 · " : ""}{getConversationTitle(conversation)}</span>
                    </Link>
                    <button
                      type="button"
                      className="grid h-7 w-7 shrink-0 place-items-center rounded-md text-[var(--color-text-faint)] opacity-0 transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text)] group-hover:opacity-100"
                      aria-label="对话操作"
                      onClick={(event) => {
                        event.preventDefault();
                        event.stopPropagation();
                        setOpenMenuId((current) => (current === conversation.conversationId ? null : conversation.conversationId));
                      }}
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {openMenuId === conversation.conversationId ? (
                      <div
                        ref={menuRef}
                        className="absolute right-0 top-8 z-40 w-28 rounded-lg border border-[color:var(--color-border)] bg-[var(--color-bg-elevated)] p-1 text-xs shadow-[var(--shadow-panel)]"
                      >
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
                          onClick={() => togglePin(conversation.conversationId)}
                        >
                          {pinned ? "取消置顶" : "置顶"}
                        </button>
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-[var(--color-text-muted)] hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]"
                          onClick={() => renameConversation(conversation)}
                        >
                          重命名
                        </button>
                        <button
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-red-600 hover:bg-red-50"
                          onClick={() => deleteConversation(conversation.conversationId)}
                        >
                          删除
                        </button>
                      </div>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div className="px-2 py-2 text-xs text-[var(--color-text-faint)]">暂无历史对话</div>
            )}
          </div>
        </div>
      </div>

      {items
        .filter((item) => item.href !== "/workspace" && item.href !== "/chat")
        .map((item) => {
          const Icon = item.icon;
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex h-10 items-center gap-3 rounded-lg border border-transparent px-3 text-sm text-[var(--color-text-muted)] transition hover:bg-[var(--color-hover)] hover:text-[var(--color-text)]",
                active && navActiveClass
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
            </Link>
          );
        })}
    </>
  );
}
