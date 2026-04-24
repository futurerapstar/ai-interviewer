import { NextResponse } from "next/server";
import pdfParse from "pdf-parse";

export const runtime = "nodejs";
// 限制大文件上传，避免 Serverless 超时或内存溢出
export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "请上传 PDF 文件" }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "只能解析 PDF 格式的文件" }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    const data = await pdfParse(buffer);
    const text = data.text;

    if (!text || !text.trim()) {
      return NextResponse.json(
        { error: "无法提取文本，请确保上传的不是纯图片扫描版 PDF" },
        { status: 400 }
      );
    }

    return NextResponse.json({ text: text.trim() });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(
      { error: `解析 PDF 失败：${message}` },
      { status: 500 }
    );
  }
}
