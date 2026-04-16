import { NextResponse } from "next/server";

import { llmChat, safeJsonParse } from "@/lib/ai";
import { redis } from "@/lib/redis";
import type {
  AnswerRequest,
  AnswerResponse,
  Message,
  ApiErrorResponse,
} from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_TTL_SECONDS = 60 * 60 * 6;

function isValidScore(score: unknown): score is 1 | 2 | 3 | 4 | 5 {
  return score === 1 || score === 2 || score === 3 || score === 4 || score === 5;
}

export async function POST(req: Request) {
  try {
    const json = (await req.json().catch(() => null)) as AnswerRequest | null;

    if (!json?.sessionId || typeof json.sessionId !== "string") {
      return NextResponse.json<ApiErrorResponse>(
        { error: "缺少 sessionId" },
        { status: 400 },
      );
    }

    if (!json.answer || typeof json.answer !== "string") {
      return NextResponse.json<ApiErrorResponse>(
        { error: "请输入你的回答" },
        { status: 400 },
      );
    }

    const key = `session:${json.sessionId}`;
    const history = (await redis.get<Message[]>(key)) ?? null;

    if (!history || !Array.isArray(history)) {
      return NextResponse.json<ApiErrorResponse>(
        { error: "会话不存在或已过期，请刷新或重设面试" },
        { status: 404 },
      );
    }

    const messages: Message[] = [...history, { role: "user", content: json.answer }];

    const raw = await llmChat({
      messages,
      temperature: 0.4,
      maxTokens: 400,
    });

    const parsed = safeJsonParse<{
      score: unknown;
      feedback: unknown;
      nextQuestion: unknown;
    }>(raw);

    if (!isValidScore(parsed.score)) {
      throw new Error("模型返回的 score 不合法");
    }

    if (typeof parsed.feedback !== "string" || !parsed.feedback.trim()) {
      throw new Error("模型返回的 feedback 不合法");
    }

    if (typeof parsed.nextQuestion !== "string" || !parsed.nextQuestion.trim()) {
      throw new Error("模型返回的 nextQuestion 不合法");
    }

    const response: AnswerResponse = {
      score: parsed.score,
      feedback: parsed.feedback.trim(),
      nextQuestion: parsed.nextQuestion.trim(),
    };

    const updatedHistory: Message[] = [
      ...messages,
      { role: "assistant", content: JSON.stringify(response) },
    ];

    await redis.set(key, updatedHistory, { ex: SESSION_TTL_SECONDS });

    return NextResponse.json<AnswerResponse>(response);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json<ApiErrorResponse>(
      { error: `提交回答失败：${message}` },
      { status: 500 },
    );
  }
}
