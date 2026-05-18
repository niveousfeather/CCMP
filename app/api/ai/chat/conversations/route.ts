import { NextRequest, NextResponse } from "next/server";

import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

function makeTitle(text?: string | null) {
  const compact = (text || "").replace(/\s+/g, " ").trim();
  return compact ? (compact.length > 20 ? `${compact.slice(0, 20)}...` : compact) : "新对话";
}

function formatConversation(
  conversation: {
    id: string;
    userId: string;
    title: string;
    model: string;
    createdAt: Date;
    updatedAt: Date;
    messages: Array<{ content: string; createdAt: Date }>;
  },
  favoriteId?: string
) {
  const lastMessage = conversation.messages[0];
  return {
    userId: conversation.userId,
    conversationId: conversation.id,
    type: "chat",
    title: conversation.title,
    summary: lastMessage?.content || "Nexus AI 已就绪。输入问题，或上传文档开始分析。",
    status: "活跃",
    model: conversation.model,
    isFavorite: Boolean(favoriteId),
    favoriteId,
    createdAt: conversation.createdAt.toISOString(),
    updatedAt: conversation.updatedAt.toISOString()
  };
}

export async function GET() {
  const { user, response } = await requireUser();
  if (response) return response;

  const [conversations, favorites] = await Promise.all([
    prisma.chatConversation.findMany({
      where: { userId: user!.id },
      orderBy: { updatedAt: "desc" },
      take: 100,
      include: {
        messages: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: { content: true, createdAt: true }
        }
      }
    }),
    prisma.favorite.findMany({
      where: { userId: user!.id, targetType: "chat" },
      select: { id: true, targetId: true }
    })
  ]);

  const favoriteMap = new Map(favorites.map((favorite) => [favorite.targetId, favorite.id]));

  return NextResponse.json({
    conversations: conversations.map((conversation) => formatConversation(conversation, favoriteMap.get(conversation.id)))
  });
}

export async function POST(request: NextRequest) {
  const { user, response } = await requireUser();
  if (response) return response;

  const body = (await request.json().catch(() => null)) as {
    title?: string;
    model?: string;
    firstMessage?: string;
  } | null;

  const model = body?.model || "Nexus AI";
  const conversation = await prisma.chatConversation.create({
    data: {
      userId: user!.id,
      title: body?.title?.trim() || makeTitle(body?.firstMessage),
      model
    },
    include: {
      messages: {
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { content: true, createdAt: true }
      }
    }
  });

  return NextResponse.json({ conversation: formatConversation(conversation) }, { status: 201 });
}
