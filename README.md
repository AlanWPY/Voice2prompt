# Voice2Prompt

Voice2Prompt 是一个可部署到 GitHub Pages、Cloudflare Pages 或任何静态托管平台的前端应用。它把中文语音输入、手动补充文本和附件摘要整理成高质量 AI 提示词。

## 功能

- 中文语音识别：使用浏览器 Web Speech API，语言设置为 `zh-CN`。
- 麦克风检测：通过 `getUserMedia` 和 `enumerateDevices` 检查可用音频输入。
- 附件解析：前端读取 TXT、Markdown、CSV、JSON、PDF、DOCX；图片和其他文件会作为附件说明加入 prompt。
- Prompt 生成：无 API Key 时使用本地规则生成；有 API Key 时调用 OpenAI-compatible Chat Completions 接口优化。
- 静态发布友好：不需要自建服务器，不在代码中硬编码 API Key。

## 为什么不把 API Key 写进静态网站

GitHub Pages 这类静态站会把所有前端代码公开给访问者。任何写入前端代码、环境变量或构建产物中的站点级 API Key 都会被用户看到并滥用。因此本项目默认采用 BYOK（Bring Your Own Key，用户自带 Key）：

1. 用户在页面中输入自己的 API Key。
2. Key 只存在当前浏览器；可选择保存到 localStorage。
3. 如果要隐藏站点级 Key，需要增加后端或无服务器代理，例如 Cloudflare Workers、Vercel Functions、Netlify Functions。

## 可选中文模型 API

页面已预设以下 OpenAI 兼容接口：

- SiliconFlow：`https://api.siliconflow.cn/v1`，默认模型 `deepseek-ai/DeepSeek-V4-Flash`。项目已按需求内置并轻量混淆 SiliconFlow API Key；语音转文字默认使用 `FunAudioLLM/SenseVoiceSmall`。
- 阿里云百炼 Qwen：`https://dashscope.aliyuncs.com/compatible-mode/v1`，默认模型 `qwen-plus`。百炼文档提供 OpenAI 兼容 Chat Completions，并在控制台 API Key 页面创建密钥。
- 智谱 BigModel GLM：`https://open.bigmodel.cn/api/paas/v4`，默认模型 `glm-4-flash-250414`。智谱文档说明 `GLM-4-Flash-250414` 是免费文本模型；价格、限速和额度请以控制台为准。
- DeepSeek：`https://api.deepseek.com`，默认模型 `deepseek-v4-flash`。官方 API 价格页显示按量计费，适合作为低成本高质量选项。

静态站直连 API 时还取决于模型服务是否允许浏览器 CORS 请求。当前已用浏览器内 fetch 验证 SiliconFlow 文本接口和语音转文字接口可用。如果某个平台阻止跨域请求，需要使用自定义 Base URL 指向你自己的 Cloudflare Workers、Vercel Functions 或其他代理服务。

## API Key 获取方式

- SiliconFlow：登录 SiliconFlow 官网，进入 API Keys，点击 Create API Key。
- 阿里云百炼：进入 Alibaba Cloud Model Studio 控制台，选择区域，进入 API Key 页面，点击 Create API Key。
- 智谱 BigModel：进入 BigModel 控制台，打开 API Key 页面创建项目密钥。
- DeepSeek：进入 DeepSeek Platform，在 API keys 页面创建密钥，并确认账户余额或额度。

## 语音识别说明

浏览器语音识别使用 Web Speech API 的 `SpeechRecognition`，并设置 `lang = "zh-CN"`。该能力不是所有浏览器都支持；Chrome 等浏览器的识别可能依赖云端识别服务，离线不可用。麦克风列表通过 `navigator.mediaDevices.enumerateDevices()` 获取，该 API 需要 HTTPS 或 localhost 安全上下文。

## 本地开发

```bash
npm install
npm run dev
```

## 构建

```bash
npm run build
```

构建产物在 `dist/`，可直接上传到静态托管平台。

## GitHub Pages 发布

如果仓库根目录就是本项目，可增加 GitHub Actions：

```yaml
name: Deploy static site

on:
  push:
    branches: [main]

permissions:
  contents: read
  pages: write
  id-token: write

jobs:
  build:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: npm
      - run: npm ci
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with:
          path: dist
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    needs: build
    steps:
      - id: deployment
        uses: actions/deploy-pages@v4
```
