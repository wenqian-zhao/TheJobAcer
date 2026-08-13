# Local LaTeX Resume Editor

一个只在本机运行的求职准备工作台：打开完整 LaTeX 项目文件夹、编辑多文件简历、预览 PDF，并在同一个工作区和 Resume Agent 交互。默认项目是 `workspace/`，也可以从页面直接打开其他本地文件夹。

## macOS App

项目现在包含 Electron macOS App。开发时运行 `npm run desktop:dev`；使用 `npm run dist:mac` 生成 Apple Silicon 的 DMG 和 ZIP。App 首次启动会把默认项目复制到 Application Support，避免修改只读的应用包。签名与公证说明见 [`docs/macos-app.md`](docs/macos-app.md)。

## 启动

需要 Node.js 22 或更高版本：

```bash
npm start
```

然后访问 <http://127.0.0.1:4173>。

## 云端版本

`site/` 是用于 Sites 发布的浏览器本地版本。它保留编辑器、本地结构检查和模拟面试，项目内容只写入访问者当前浏览器的 localStorage。由于托管环境不能访问电脑文件系统或运行内置 Tectonic，打开本地文件夹、PDF 编译和远程模型 Agent 仍需使用上面的桌面版。

## LaTeX 编译器

项目内置 Tectonic 二进制和资源缓存，默认模板可以离线编译，不要求额外安装 MacTeX。当前仓库已包含 Apple Silicon macOS 版本，服务会根据 `platform-arch` 自动选择 `vendor/tectonic/` 下的对应二进制。

如果系统已经安装 Tectonic，开发时会优先使用系统命令并继续使用项目内缓存；设置 `USE_BUNDLED_TECTONIC=1` 可以强制选择项目内版本。没有 Tectonic 时才回退到 `latexmk` 或 `pdflatex`。

## 工作区

- `简历工作流 / 简历编辑器`：通过可折叠文件树编辑完整项目；`.tex`、`.cls`、`.sty`、`.bib` 等文本文件使用 CodeMirror 6，字体和图片等二进制资源会保留并显示在树中。
- `PDF 预览`：使用本地 PDF.js 画布渲染，支持分页、缩放、适宽、整页、旋转与下载；预览层由 CV Studio 自己控制，便于后续加入搜索、标注和源码定位。
- `PDF 圈选 Agent`：点击预览工具栏的“圈选问 Agent”进入全屏交互模式，在页面上圈画目标区域（或用“整页”键盘按钮），再点击标记向 Agent 描述文字、数字或版式修改。系统会同时提供区域图像和本机提取文字，让 Agent 搜索真实 LaTeX 源码后生成可审阅修改。
- `我的 CV`：把多个独立 LaTeX 文件夹保存在本机项目库中，一键切换、导入已有 CV，或从当前 CV 复制出新的求职版本。复制会保留嵌套源码、模板、字体和图片，但排除 Git、回收区与编译产物；每个 CV 拥有独立的主文档和 Agent 对话。
- `材料收件箱`：把杂乱的 CV 全文、职位描述、HR / recruiter 聊天截图、个人项目笔记、头像、PDF 或其他文件一次粘贴或拖入。PDF 会先在本机提取文字并渲染页面预览；视觉模型按语义提取、分类。本地模式不会假装识图，但用户可以把明确的本人头像标为个人照片；其他未读懂图片 / 扫描 PDF 不能直接入库。
- `信息银行`：CV 作为来源被拆成十类个人信息，确认后的职位描述和个人材料保存在本机；可跨两列全局搜索、按类别筛选、跨页选择与批量删除，并且只用显式勾选的内容生成互不覆盖的独立 LaTeX 项目。
- `打开文件夹`：输入本地文件夹绝对路径后直接打开项目。保存会写回原文件，主文档可在顶栏切换。
- `专注模式`：隐藏产品导航和顶栏，让文件树、编辑器与 PDF 预览占满窗口；`Cmd/Ctrl + Shift + F` 进入，`Esc` 退出。
- `面试准备 / 模拟面试`：选择行为、技术或产品方向，逐题回答并获得结构化反馈与追问。评分在本机完成。

首次打开会先看到产品首页，点击“进入工作台”进入左侧栏工作区。侧栏的“我的 CV”会记录最近打开的本地项目；从项目库移除只会删掉列表记录，不会删除磁盘文件。编辑器页面右侧同时提供 PDF 预览和 Resume Agent。两条分隔线可以拖拽调整大小，每个 pane 都可以暂时隐藏。点击侧栏边缘的小把手即可折叠为 12px 窄轨道或完整展开；窄屏布局会始终保留顶部导航。侧栏状态、工作区尺寸、主题、CV 项目库和 Agent 配置都会保存在本机浏览器中。

窗格和 Agent 拖拽由 interact.js 提供惯性与边界约束。浮动 Agent 始终自由落位；如果需要停靠，可使用标题栏的停靠位置选择器。

### Resume Agent

Agent 有三种明确区分的运行方式：`本地检查（非 AI）`不需要 API key，只执行确定性结构检查；OpenAI 与 Anthropic 会启动 CV Studio 的受限多步 Agent，按需列出、读取和搜索项目文件，在内存里生成可审阅的新建、修改或删除操作，并在独立临时项目中编译验证；可选的 Hermes Gateway 会接收有大小上限的项目快照，并运行 Hermes 自己的服务端 Agent 循环。远程 Agent 与材料分析的单次请求上限为 300 秒；缺少 key 或连接失败时会明确报错，不会静默伪装成本地 Agent。

侧栏的 `AI Provider`、首页的 `AI 设置` 与 Resume Agent 标题栏的设置按钮会打开同一份全局配置。Provider、Model、API key、Base URL、API 模式与修改审批偏好只需设置一次，Resume Agent、PDF 视觉 Agent 和材料收件箱会共同使用。OpenAI 默认使用 Responses API，Anthropic 使用 Messages API；Hermes 默认连接用户自行启动的 `http://127.0.0.1:8642/v1` gateway。Hermes 自身拥有更宽的本机工具权限，因此只应连接你信任的实例。只有用户主动提交 Agent 请求时，相关项目文本、已选择的 PDF 图像或当次收件箱材料才会发送到选中的地址；密钥与地址不会写入 `workspace/`。

材料收件箱的分类结果必须先由用户确认才会写入 `.cvstudio-bank/`，客户端和服务端都会阻止没有提取内容的附件占位条目。生成器提供 `geekplux/cv_resume`、Awesome-CV、AltaCV 与 moderncv banking 四种方向的 portable templates，生成前可查看版式预览；它们保留来源与许可证说明，使用 PingFang SC / 离线缓存的 FandolSong 中文字体回退，并以 App 内置 Tectonic 编译验证。详细数据流见 [`docs/material-intake.md`](docs/material-intake.md)。

也可以在启动服务前设置 `OPENAI_API_KEY`、`ANTHROPIC_API_KEY` 或 `HERMES_API_KEY`；界面只读取“是否已配置”的状态，不会读取或返回服务端密钥。

Agent 默认以浮动窗口打开，位置选择器会显示“悬浮”，也可以显式停靠在工作区四个位置。输入消息后按 `Enter` 发送，`Shift + Enter` 换行；标题栏的 `↺` 会清空当前项目会话。最小化后，右下角启动器可用于重新调出，也可按 `Cmd/Ctrl + Shift + A` 切换。工具轨迹会显示 `READ`、`SEARCH`、`PROPOSE`、`COMPILE` 等实际动作。文件操作默认先展示 diff，由用户确认后应用；新建和修改可以选择自动应用，删除始终需要单独确认。服务端会校验文件路径、存在状态、内容 hash 和 patch，避免过期提案覆盖或删除已经变化的文件。批准删除后，文件会移入项目内隐藏的 `.cvstudio-trash/`，而不是立即永久清除。框架调研与设计边界见 [`docs/agent-research.md`](docs/agent-research.md)。

## 快捷键

- `Cmd/Ctrl + S`：保存
- `Cmd/Ctrl + Enter`：保存并编译
- `Cmd/Ctrl + F`：在 CodeMirror 中搜索
- `Cmd/Ctrl + Shift + F`：进入或退出专注模式
- `Cmd/Ctrl + Shift + A`：显示或最小化 Resume Agent
- `Esc`：退出专注模式
- `Tab`：在编辑器插入两个空格

## 项目结构

- `public/`：浏览器界面
- `site/`：Sites 云端入口与浏览器本地适配层
- `agent-runtime.mjs`：多步 Resume Agent、Provider 与受限项目工具
- `intake-runtime.mjs`：多模态材料分类、结构规范化与 CV 模板生成
- `server.js`：本地文件与编译服务
- `workspace/resume.tex`：简历 LaTeX 源码
- `workspace/`：完整 LaTeX 项目文件
- `docs/agent-research.md`：Resume Agent 框架调研与集成决策
- `docs/material-intake.md`：材料收件箱、三类素材银行与模板生成边界
- `docs/open-source-foundations.md`：开源组件、许可证与后续选型原则
- `CHANGELOG.md`：版本日志
