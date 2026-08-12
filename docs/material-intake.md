# Material Inbox and Information Bank

“材料收件箱”是 CV Studio 的 zero-to-organized 入口。它接受一次混合输入，而不是要求用户预先判断内容属于哪一类。

## 输入与确认

- 文本框保留普通粘贴文字；富文本粘贴的 HTML 会和纯文本一起保存在原始提交中。
- 剪贴板图片与通过选择器 / 拖放加入的文件保存为本地来源附件。单个附件上限 5 MB，总计上限 16 MB；附件是 provenance，不是银行里的知识本体。
- PDF.js 会先在本机从最多 20 页提取文字，并为前 3 页生成视觉预览。文字型 PDF 可以直接进入本地分类；扫描 PDF 的页面预览可交给配置好的视觉模型理解。
- OpenAI、Anthropic 或 Hermes 使用与 Resume Agent 相同的全局配置。远程分类会接收文字、可读取文本文件 / PDF 的提取内容，以及最多 8 张图片或 PDF 页面预览。
- 本地模式不声称可以读取图片。没有可读文字的图片或扫描 PDF 会标为“未提取”，必须启用视觉模型、由用户补充可靠转录 / 描述，或移除，不能直接入库。
- CV / 简历只被视为来源，不再作为一个完整 `cv` 条目入库。模型与本地规则会把其中的事实拆成个人简介、工作经历、项目经历、教育经历、专业技能、荣誉和奖项、课外活动、社会实践、论文发表、演讲和讲座等独立个人信息。
- 模型输出不会直接入库。用户可以修改每个 segment 的分类、标题、摘要与提取内容，然后显式确认；服务端会再次拒绝没有任何可复用内容或结构化字段的条目。

## 本地数据模型

`.cvstudio-bank/bank.json` 保存三个层次：

1. `submissions`：原始文字、HTML、附件引用和时间；
2. `items`：用户确认后的 `job` 与 `personal` 提取结果、`extractionStatus`、个人信息类目与结构化字段；
3. `assets`：来源附件元数据，二进制内容位于 `.cvstudio-bank/assets/`。

信息银行使用“全部 / 职位描述 / 个人信息”三列。点击任意列会把它平滑展开为主内容区，其余列收起为可点击索引；系统开启 `prefers-reduced-motion` 时会取消过渡。个人信息按常用程度排列：个人简介、工作经历、项目经历、教育经历、专业技能、荣誉和奖项、课外活动、社会实践、论文发表、演讲和讲座，再到其他内容。

银行卡片以 profile、experience、project、education、skill、job requirements 等类型化字段为主体，只把小缩略图和附件数量显示为来源凭证。从可见银行移除条目不会同时销毁原始 submission 或附件，便于后续恢复和审计。这个目录位于 App 的默认工作区数据根中，不放进用户当前打开的任意外部 LaTeX 项目。旧版 `cv` 条目读取时会作为个人信息显示；新解析不会再写入 `cv` 类型。

## CV generation

生成器聚合个人信息条目中的 profile、experience、project、education、skill 与 photo 字段；可选一个 job 条目提供目标职位和关键词。缺少的信息保持为空，不会被规则层编造。

生成项目包含：

- `resume.tex`：`geekplux/cv_resume` 蓝色经典方向的 CV Studio portable edition；
- `assets/profile.*`：选中的个人图片（如果存在）；
- `source-data.json`：本次生成使用的已审核结构化材料；
- `README.md` 与 `LICENSE.geekplux-cv.txt`：模板来源、适配说明和 MIT 许可证。

原模板使用 `moderncv`、`xeCJK` 和特定系统字体。项目内置 Tectonic 的离线 bundle 不包含 `moderncv.cls`，因此 portable edition 使用已经随 App 验证的基础 LaTeX 包，同时保留蓝色、经典信息层级和许可证归属。

每次生成都会创建新的独立文件夹，不覆盖当前 CV。服务端切换到新项目后，前端将它追加进持久化“我的 CV”项目库；用户可以继续用同一份素材针对不同职位生成多份 CV，在项目库中切换，并为每份 CV 保留独立源码、资源、主文档和 Agent 会话。
