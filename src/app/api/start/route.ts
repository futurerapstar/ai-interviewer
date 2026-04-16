import { NextResponse } from "next/server";

import { llmChat } from "@/lib/ai";
import { redis } from "@/lib/redis";
import {
  INTERVIEW_SYSTEM_PROMPT,
  START_QUESTION_USER_PROMPT,
} from "@/lib/prompts";
import type { Message, StartResponse } from "@/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SESSION_TTL_SECONDS = 60 * 60 * 6;

export async function POST() {
  try {
    const sessionId = crypto.randomUUID();

    const question = (await llmChat({
      messages: [
        {
          role: "system",
          content:
            "你是一位资深前端技术面试官。现在请直接给出第一个技术问题。只输出问题本身，不要输出任何多余内容。",
        },
        { role: "user", content: START_QUESTION_USER_PROMPT },
      ],
      temperature: 0.7,
      maxTokens: 200,
    })).trim();

    const messages: Message[] = [
      { role: "system", content: INTERVIEW_SYSTEM_PROMPT },
      { role: "assistant", content: question },
    ];

    await redis.set(`session:${sessionId}`, messages, { ex: SESSION_TTL_SECONDS });

    const body: StartResponse = { sessionId, question };
    return NextResponse.json(body);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `初始化面试失败：${message}` },
      { status: 500 },
    );
  }
}
