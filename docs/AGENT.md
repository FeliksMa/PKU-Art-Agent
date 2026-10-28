# PKU Art AI：安装与配置

这是基于 [Arthals / PKU-Art](https://github.com/zhuozhiyongde/PKU-Art) 的社区扩展，保留 GPL-3.0 许可证与原作者署名。AI 默认关闭。普通美化和原有录播下载可以独立使用。

## 当前实现的范围

| 功能 | 状态 |
| --- | --- |
| PKU Art 风格入口、对话侧栏、主题切换 | 已实现，继承原项目 `--c-*` 变量 |
| DeepSeek / OpenAI Chat Completions 兼容服务 | 已实现，可添加多个配置 |
| 当前页面与可访问的同源 iframe 正文 | 已实现，每次任务明确授权共享 |
| 已发现课程页面的只读访问 | 已实现，每页单独确认，限制路径与来源 |
| 作业要求整理 | 模型根据实际读取的正文生成，不能推断未读取附件 |
| 课程附件批量下载 | 已实现，逐批确认，顺序队列、取消、失败状态 |
| 录播入口整理 | 已实现，识别播放器链接和教学网 `playVideo.action` |
| 跨页面批量录播下载、断点恢复 | 尚未实现；原有单节录播下载保留 |
| PDF / Word 正文解析、OCR、语音转写 | 尚未集成，作为独立工具扩展 |
| Codex App Server / MCP | 架构预留，尚未实现连接器 |
| 自动提交作业、发消息、选退课、执行任意代码 | 不提供工具 |

“已排队”和“已完成”是不同状态。关闭或刷新网页会停止本页任务。模型供应商必须支持工具调用，只有普通聊天能力的兼容服务不能完整执行 Agent 任务。

## 快速安装

需要 Node.js 22 或以上版本，以及支持 GM API 的 Tampermonkey。Safari 的 UserScripts 不支持本助手所需的完整 GM API。

1. 下载源码并解压，在项目目录打开终端。
2. 安装依赖并初始化本机配置：

```sh
npm ci
npm run agent:init
```

初始化只在文件不存在时创建 `agent.config.local.json` 和 `.agent-token.local`，不会覆盖现有配置。两者已加入 Git 忽略规则。

3. 编辑 `agent.config.local.json`，确认模型地址、模型名和环境变量名称。模型名应以供应商当前支持的名称为准。
4. 在运行本机服务的终端设置 API Key。以下为占位示例，不要把真实密钥提交到仓库：

Windows PowerShell：

```powershell
$env:DEEPSEEK_API_KEY = '在此填入你的密钥'
npm run agent
```

macOS / Linux：

```sh
export DEEPSEEK_API_KEY='在此填入你的密钥'
npm run agent
```

服务只监听 `127.0.0.1`，默认端口 `17321`。保持终端运行。这个服务与上游的图片开发服务器 `server.py` 无关。

5. 运行 `npm run build:local`，将 `dist/pku-art.user.js` 安装到 Tampermonkey。已有普通 PKU Art 时请禁用旧脚本，避免重复修改页面。源码包同时提供 `release/PKU-Art-AI.user.js`，普通用户可以直接安装此文件。
6. 打开教学网，点击右下角“课程助手”→“设置”。启用助手，将 `.agent-token.local` 的内容填入“配对码”，点击“连接并刷新模型”，选择配置并保存。**这里填写的是配对码，不是 API Key。**
7. 输入任务，点击“预览共享内容”，确认后勾选本次共享授权并发送。对于下载或读取额外页面，助手会显示具体清单再请求确认。

首次请求本机服务时，Tampermonkey 可能要求允许连接 `127.0.0.1`。附件下载需要 Tampermonkey 的下载功能正常工作，设置方式与原项目一致。真实教学网页面及不同浏览器的权限行为仍需在已登录环境验收。

## 新增模型配置

向本机配置的 `providers` 数组增加一个对象，重启服务，再在网页设置中刷新模型列表：

```json
{
  "id": "another-provider",
  "label": "我的另一个模型",
  "protocol": "openai-chat-completions",
  "baseURL": "https://provider.example/v1",
  "model": "model-name",
  "apiKeyEnv": "ANOTHER_MODEL_API_KEY",
  "maxTokens": 4096,
  "extraBody": {}
}
```

- `id` 唯一，不随显示名称变化；网页只保存这个 ID。
- `baseURL` 是接口前缀，程序会追加 `/chat/completions`。不能填完整的 completion 地址。
- 密钥从 `apiKeyEnv` 指定的环境变量读取，不接受网页上传的密钥或目标模型地址。
- `extraBody` 用于供应商特有参数，例如禁用思考模式；不能覆盖 messages、tools、model 等核心字段。
- `enabled: false` 可以隐藏配置。远程地址要求 HTTPS；本机模型允许回环 HTTP。没有密钥校验的本机服务可将指定环境变量设为无敏感含义的占位值。
- Responses、Anthropic 等其他协议需要实现新的适配器，不能只修改 `protocol` 名称。

## 独立发布

本版本使用独立的默认名称和 namespace，默认关闭脚本自动更新，避免被原项目 CDN 覆盖。发布自己的版本时在本地 `.env` 配置：

```dotenv
VERSION=2.6.27-ai.1
USERSCRIPT_NAME=PKU-Art AI (Community)
USERSCRIPT_NAMESPACE=your-account/pku-art-agent
AUTHOR=Arthals and community contributors
SUPPORT_URL=https://github.com/your-account/your-repo/issues
UPDATE_URL=https://raw.githubusercontent.com/your-account/your-repo/main/release/PKU-Art-AI.user.js
DOWNLOAD_URL=https://raw.githubusercontent.com/your-account/your-repo/main/release/PKU-Art-AI.user.js
```

只有同时提供两个更新地址才会启用自动更新。`npm run build:local` 不依赖原作者未公开的 `update-cdn.py`，也不会上传至原作者 CDN。

## 费用、数据与限制

模型调用使用用户自己的 API 配额；本项目不提供共享密钥。每次任务最多 8 轮模型调用，每轮最多 8 个工具调用；单次下载最多 20 个附件，队列最多 30 个待执行项。停止模型任务与停止下载队列是两个独立按钮。

网页正文、课程名、资源清单和用户输入会发送到所选模型服务。API Key 仅在本机服务内使用；网页工具不会读取 Cookie、浏览器密码或录播 JWT。URL 中常见的凭证参数与正文中的 Bearer/JWT 会进行过滤，但自动过滤不是完整的数据脱敏保证，发送前请预览。对话与下载队列仅保留在当前页面内存中。

配对码保存在油猴存储中，它允许访问本机模型代理，可能产生 API 费用。不要分享配对码或安装来源不明的脚本。本版沿用上游的页面注入模式，不能把它当作对恶意页面脚本的强隔离环境；未来如需要更强隔离，应迁移到浏览器扩展的隔离执行环境。

## 故障排查

- 无法连接：确认 `npm run agent` 正在运行、地址端口一致、配对码正确，且油猴允许本机请求。
- 模型请求失败：检查配置的 `apiKeyEnv` 是否在启动服务的同一终端设置，确认接口前缀与模型名正确，再检查供应商账户和网络。
- 无课程内容：打开具体课程内容页；未加载和跨域 iframe 不会被自动读取。
- 无录播入口：打开“课堂实录”列表页；当前版本不会自动遍历全部课程、全部分页。
- 下载失败：检查登录状态和油猴下载权限，保留页面；失败任务可重新请求下载。
- 修改配置没有生效：重启本机服务，刷新网页的模型列表并保存。
