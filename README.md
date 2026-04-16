# AI 面试考官（Next.js 全栈应用）

一个用于技术面试练习的 Web 应用：打开页面即开始面试，AI 逐轮提问、对你的回答评分并给出改进建议，同时通过 Upstash Redis 持久化会话历史，适配 Vercel 的无状态运行环境。

## 技术栈

- **Next.js**：App Router + TypeScript
- **样式**：Tailwind CSS
- **AI 模型**：DeepSeek API（OpenAI 兼容格式）
- **会话存储**：Upstash Redis（REST）
- **部署**：Vercel

## 功能

- **自动开始面试**：进入页面自动创建 `sessionId` 并拿到第一问
- **多轮对话**：提交回答后返回 `score (1-5) + feedback + nextQuestion`
- **对话历史展示**：聊天式 UI 展示问题/回答/评价
- **会话持久化**：Redis 存储每个 `sessionId` 的消息历史
- **重设面试**：一键重新开始新 session
- **加载态与错误提示**：AI/Redis 异常时前端可见

## 环境变量

本项目不会提交 `.env.local`，请使用模板文件：

1. 复制模板

```bash
copy .env.example .env.local
```

2. 填写以下变量

- `DEEPSEEK_API_KEY`
- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

可选：

- `DEEPSEEK_BASE_URL`（默认 `https://api.deepseek.com`）

## 本地运行

```bash
npm install
npm run dev
```

打开：

- http://localhost:3000

## Vercel 部署

- 在 Vercel 创建项目并导入仓库
- 在 Vercel 项目的 **Environment Variables** 中配置：
  - `DEEPSEEK_API_KEY`
  - `UPSTASH_REDIS_REST_URL`
  - `UPSTASH_REDIS_REST_TOKEN`
- 部署完成后直接访问即可

## API 说明

- `POST /api/start`
  - 返回：`{ sessionId, question }`
- `POST /api/answer`
  - 入参：`{ sessionId, answer }`
  - 返回：`{ score, feedback, nextQuestion }`
