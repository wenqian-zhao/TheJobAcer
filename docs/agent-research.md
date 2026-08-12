# Resume Agent 技术选型与安全边界

日期：2026-08-06  
适用版本：CV Studio 0.8.0

## 2026-08-10：视觉交互 Agent MVP

现有 `ToolLoopAgent` 已经具备读取、搜索、提案、临时编译和审批写入能力，因此 PDF 交互功能继续复用同一条受限 Agent 主干，不引入第二套编排框架。PDF.js 在本机完成页面渲染、圈选坐标归一化和区域文字提取；远程请求只携带用户主动选中的带标记图像裁剪与区域文字。

视觉图像用于理解排版、位置和“这里看起来不对”的反馈，PDF 文字用于建立确定性锚点。Agent 指令要求先用 `search_project` / `read_project_file` 定位真实 LaTeX，再生成修改并临时编译，禁止只凭像素猜测源码文件。图像 data URL 在服务端校验为 PNG/JPEG/WebP、归一化坐标与 2.5 MB 上限；本地非 AI 模式不会消费或转发图像。

Provider 配置从 Agent 窗口内部设置提升为 App 级全局 profile。所有 Agent 入口共享同一个本机浏览器存储配置，并继续支持服务进程环境变量提供密钥。

## 结论

CV Studio 的核心 Agent 采用 **AI SDK `ToolLoopAgent` + CV 专用受限工具**。OpenAI 与 Anthropic 使用这套核心循环；Hermes Agent 通过其官方 OpenAI-compatible gateway 作为可选的独立 Agent 后端接入，但不随 CV Studio 安装，也不作为默认运行时。

这不是一次单轮“把整份简历塞给模型”的包装：模型会在最多 8 步内自主选择列文件、读取、搜索、确定性检查、提出文件修改和临时编译。所有提案先停留在内存，界面展示 diff，服务端通过路径、内容 hash 和 patch 校验后才会写回。

## 选型比较

| 方案 | 优势 | 主要代价 / 风险 | 决策 |
| --- | --- | --- | --- |
| 手写 fetch + JSON | 依赖少 | 只有单轮生成；循环、工具错误、停止条件和上下文都要重复造轮子 | 淘汰旧实现 |
| Vercel AI SDK `ToolLoopAgent` | Provider 中立；成熟的工具调用、步骤控制、错误与 usage 结构；Node 22 适配 | 增加约 13 个服务端包；需要自行定义安全工具边界 | **核心方案** |
| OpenAI Agents SDK | handoff、guardrail、session、trace 完整 | 对当前双 Provider 产品更偏 OpenAI；功能面大于当前需求 | 暂不采用 |
| LangGraph | 持久图工作流与复杂恢复能力强 | 图状态和基础设施对单人本地 CV 编辑器过重 | 暂不采用 |
| Hermes Agent | 完整个人 Agent、记忆、技能、终端及 OpenAI-compatible API | 独立 Python 3.11 运行时；默认全局状态；终端/文件权限边界远大于 CV 项目 | **可选 gateway，不内嵌** |

AI SDK 官方把 Agent 定义为“模型 + 工具 + 循环”，并推荐从 `ToolLoopAgent` 开始：<https://ai-sdk.dev/docs/agents/overview>。循环停止与步骤控制见 <https://ai-sdk.dev/docs/agents/loop-control>。

OpenAI 的当前模型指导建议推理与工具调用工作流使用 Responses API：<https://developers.openai.com/api/docs/guides/latest-model>。CV Studio 因此对 OpenAI 默认使用 Responses API，同时保留 Chat Completions 模式以兼容用户显式配置的代理。

## 为什么不直接内嵌 Hermes

Hermes 是一个优秀但边界不同的产品。官方仓库包含持久记忆、技能、终端、浏览器与多消息平台入口：<https://github.com/NousResearch/hermes-agent>。它的 API Server 提供 `hermes gateway`、`/v1/responses` 与 `/v1/chat/completions`，默认位于 `127.0.0.1:8642`：<https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/api-server.md>。

直接把 Hermes 作为内置 backbone 会引入三个不必要风险：

1. CV Studio 是 Node 22 本地应用，Hermes 需要独立 Python 运行时、进程生命周期和全局配置目录。
2. Hermes 的完整终端与文件能力远大于“只读当前简历、提出可审阅改动”的权限需求。
3. 把 Hermes 的内部 Agent 循环再包进 CV Studio 的工具循环，会形成双重编排，错误与审批语义反而更难解释。

因此 0.8.0 只提供显式 Hermes Gateway 配置。用户必须自己启动并信任 Hermes；界面会提示其权限更宽。CV Studio 会给它一份有大小上限的项目文本快照，由 Hermes 在服务端运行自己的循环，不再外包一层 CV 工具调用；CV Studio 仍通过项目路径、扩展名、大小、内容 hash 和 patch 校验保护最终写入。

## 核心运行时工具（OpenAI / Anthropic）

- `list_project_files`：列出当前文本文件、大小与主文档。
- `read_project_file`：读取单个项目文本，单次最多 80,000 字符。
- `search_project`：大小写不敏感的字面量搜索，最多 40 条命中。
- `inspect_resume`：确定性检查联系方式、结构、行动动词、量化结果和篇幅。
- `propose_file_edits`：在内存中暂存新建、完整替换或删除操作；删除会从临时编译快照中移除目标，但不会直接改动磁盘。
- `compile_project`：复制项目（包括字体和图片）到系统临时目录，叠加内存提案后使用本地编译器验证，随后删除临时目录。

## 安全与稳定性约束

- 文件内容一律被视为不可信文档数据，不能覆盖系统指令。
- 工具路径必须是项目相对路径；阻止绝对路径、`..` 和 NUL。
- Agent 不能执行 shell 或直接写盘；它只能提出受支持文本文件的新建、修改或删除操作。删除不能指向当前主文档，必须单独由用户确认，应用时移动到项目内的 `.cvstudio-trash/` 以便恢复。
- 单文件上限 750 KB；单轮最多 8 步、12 个文件提案和 300 秒。
- 远程 Provider 缺少 key 时返回明确错误，不再静默伪装成本地 Agent。
- 会话历史按项目保存在当前浏览器 session 中，最多发送最近 12 条消息。
- OpenAI / Anthropic / Hermes 的内容只发送到用户明确选择的 Base URL；本地检查不联网。

## 依赖检查

本次锁定的主要新增依赖为 `ai@7.0.55`、`@ai-sdk/openai@4.0.32`、`@ai-sdk/anthropic@4.0.33` 和 `zod@4.4.3`。AI SDK 与 Provider 包使用 Apache-2.0，Zod 使用 MIT；安装审计为 0 个漏洞。它们只运行在本地 Node 服务，不进入浏览器 bundle。

像素 UI 没有引入 NES.css。其公开 npm 版本与构建依赖明显老于现有 Node 22 架构，因此本项目使用原生 CSS token、硬边框和离线系统字体栈，避免额外运行时与 CDN。
