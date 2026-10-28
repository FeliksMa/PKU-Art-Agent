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

## 快速安装：只配置一次

需要 Node.js 22 或以上版本，以及支持 GM API 的 Tampermonkey。你不需要每次打开教学网都重新输入密钥。

1. 下载项目源码并解压，安装 `release/PKU-Art-AI.user.js`。已有普通 PKU Art 时请禁用旧脚本，避免重复运行。
2. **Windows 双击项目中的 `启动课程助手.cmd`**。它会自动初始化本机配置、启动服务并打开本机设置页。已有 Node.js 时不必先安装 npm 依赖。保留服务窗口；遇到端口已占用时会打开已有服务的设置页。
3. 在本机设置页选择 DeepSeek，填写你的 API Key，点击 **保存到这台电脑**。设置立即生效。API 地址和模型名称已有默认值，使用其他模型时可以修改。
4. 点击 **复制配对码**。打开教学网 → 课程助手 → 设置，粘贴配对码，启用助手，点击“连接并刷新模型”，选择模型并保存。配对也只需做一次。
5. 以后直接打开课程助手使用。标题栏的“已开启 / 已关闭”可以开关助手，输入框上方可以切换已配置的模型。

**重新登录教学网、刷新页面或关闭浏览器：** 保存的密钥、配对信息和助手开关会保留，本机服务继续运行即可。

**电脑重启、手动关闭服务窗口：** 双击 `启动课程助手.cmd` 再次启动。已保存的密钥会自动读取，无需再填写。当前版本不会自行加入 Windows 开机启动。

**关闭课程助手：** 会停止当前模型任务和本页附件队列，但保留配置。重新开启即可继续使用。开关助手、切换模型、保存密钥都不会调用模型；发送任务时才使用 API 配额。

macOS / Linux，或希望使用命令行启动：

```sh
node bridge/server.js --open
```

本机服务默认监听 `127.0.0.1:17321`。设置页为 `http://127.0.0.1:17321/settings`，通过启动器打开时会自动带入配对信息；直接打开时可从本机 `.agent-token.local` 文件复制配对码。不要把配对码当成 API Key。

API Key 在本机 `agent.config.local.json` 中保存为明文，该文件以及其临时文件均已被 Git 忽略。不要分享该文件。设置页不会返回已保存的完整密钥。留空保存表示沿用原密钥，勾选“清除已保存的 API Key”才会删除。密钥也不会写入油猴脚本或上传到 GitHub。

若你先前使用 PowerShell 环境变量配置了密钥，仍然兼容；建议在本机设置页填写并保存一次，之后不再依赖临时环境变量。持久保存的密钥优先于环境变量。

首次请求本机服务时，Tampermonkey 可能要求允许连接 `127.0.0.1`。附件下载需要 Tampermonkey 的下载功能正常工作，设置方式与原项目一致。Safari 的 UserScripts 不支持本助手所需的完整 GM API。

## 开发者安装与构建

```sh
npm ci
npm run test:agent
npm run build:local
```

然后安装 `dist/pku-art.user.js`。普通用户可以直接使用 `release/PKU-Art-AI.user.js`，不用构建。

## 新增模型配置

推荐在课程助手设置中点击“配置 API”，在弹窗中点击“打开本机配置页”，然后点击“新增模型”，填写名称、API 地址、模型名称和密钥并保存。可以在本机设置页开关各个模型，设置立即生效；回到侧栏刷新模型列表即可选择。

开发者也可以手动编辑 `agent.config.local.json` 的 `providers` 数组，重启服务：

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
- 在本机设置页保存的密钥会自动读取；高级用法也支持 `apiKeyEnv` 指定的环境变量。教学网页面无权修改本机密钥或模型地址。
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

网页正文、课程名、资源清单和用户输入会发送到所选模型服务。API Key 仅在本机服务内使用，并可在本机配置文件中长期保存；网页工具不会读取 Cookie、浏览器密码或录播 JWT。URL 中常见的凭证参数与正文中的 Bearer/JWT 会进行过滤，但自动过滤不是完整的数据脱敏保证，发送前请预览。对话与下载队列仅保留在当前页面内存中。

配对码保存在油猴存储中，它允许访问本机模型代理，可能产生 API 费用。不要分享配对码或安装来源不明的脚本。本版沿用上游的页面注入模式，不能把它当作对恶意页面脚本的强隔离环境；未来如需要更强隔离，应迁移到浏览器扩展的隔离执行环境。

## 故障排查

- 无法连接：确认 `npm run agent` 正在运行、地址端口一致、配对码正确，且油猴允许本机请求。
- 模型请求失败：在本机模型设置页检查是否已保存密钥，确认接口前缀与模型名正确，再检查供应商账户和网络。
- 无课程内容：打开具体课程内容页；未加载和跨域 iframe 不会被自动读取。
- 无录播入口：打开“课堂实录”列表页；当前版本不会自动遍历全部课程、全部分页。
- 下载失败：检查登录状态和油猴下载权限，保留页面；失败任务可重新请求下载。
- 修改配置没有生效：本机设置页保存会立即生效；刷新网页模型列表即可。手工编辑配置文件后需重启服务。

## 换电脑使用

每台电脑独立安装脚本、启动本机服务，并配置模型与配对一次。相同的代码和配置流程可以复用；127.0.0.1 永远表示当前电脑，不会连接上一台电脑。本版本没有云同步。建议每台电脑使用独立的 API Key，方便单独撤销。不要将包含明文 apiKey 的本机配置文件、配对码上传 GitHub 或当作公共模板分享。通用模板是 agent.config.example.json，不含个人密钥。
