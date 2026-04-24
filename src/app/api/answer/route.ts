import { NextResponse } from "next/server";
import { createOpenAI } from "@ai-sdk/openai";
import { streamObject } from "ai";
import { z } from "zod";

import { redis } from "@/lib/redis";
import type {
  AnswerRequest,
  Message,
  ApiErrorResponse,
} from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_TTL_SECONDS = 60 * 60 * 6;

function normalizeEnvValue(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
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

    const apiKey = process.env.LLM_API_KEY || process.env.DEEPSEEK_API_KEY || "";
    const baseUrl = process.env.LLM_BASE_URL || process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/v1";
    
    if (!apiKey) {
      return NextResponse.json<ApiErrorResponse>(
        { error: "未配置 LLM API Key" },
        { status: 500 },
      );
    }

    const openai = createOpenAI({
      apiKey: normalizeEnvValue(apiKey),
      baseURL: normalizeEnvValue(baseUrl),
    });

    const modelName = process.env.LLM_MODEL || "deepseek-chat";

    const result = streamObject({
      model: openai(normalizeEnvValue(modelName)),
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      schema: z.object({
        score: z.number().min(1).max(5).describe('候选人的回答得分，1到5的整数'),
        feedback: z.string().describe('对候选人回答的评价和改进建议，可以直接指出不足'),
        nextQuestion: z.string().describe('接下来追问的问题或者切换到的新知识点问题'),
      }),
      onFinish: async ({ object }) => {
        if (object) {
          const response = {
            score: object.score,
            feedback: object.feedback,
            nextQuestion: object.nextQuestion,
          };
          const updatedHistory: Message[] = [
            ...messages,
            { role: "assistant", content: JSON.stringify(response) },
          ];
          await redis.set(key, updatedHistory, { ex: SESSION_TTL_SECONDS });
        }
      }
    });

    return result.toTextStreamResponse();
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json<ApiErrorResponse>(
      { error: `提交回答失败：${message}` },
      { status: 500 },
    );
  }
}
