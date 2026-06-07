import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  Copy,
  Download,
  FileText,
  KeyRound,
  Loader2,
  Mic,
  Mic2,
  Paperclip,
  Play,
  RefreshCcw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Square,
  Wand2,
  X
} from 'lucide-react';

type ProviderId = 'siliconflow' | 'qwen' | 'zhipu' | 'deepseek' | 'custom';
type OutputMode = 'assignment' | 'research' | 'coding' | 'writing' | 'analysis' | 'general';

type Provider = {
  id: ProviderId;
  name: string;
  baseUrl: string;
  model: string;
  note: string;
};

type Attachment = {
  id: string;
  name: string;
  type: string;
  size: number;
  summary: string;
  status: 'ready' | 'error';
};

const providers: Provider[] = [
  {
    id: 'siliconflow',
    name: '硅基流动 SiliconFlow',
    baseUrl: 'https://api.siliconflow.cn/v1',
    model: 'deepseek-ai/DeepSeek-V4-Flash',
    note: '已内置 SiliconFlow Key，默认使用 DeepSeek V4 Flash 文本模型。'
  },
  {
    id: 'qwen',
    name: '阿里云百炼 Qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-plus',
    note: '通义千问官方接口，中文稳定，需在百炼控制台创建 API Key。'
  },
  {
    id: 'zhipu',
    name: '智谱 BigModel GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    model: 'glm-4-flash-250414',
    note: '国产 GLM 系列接口，含免费文本模型，需在 BigModel 控制台创建 API Key。'
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    model: 'deepseek-v4-flash',
    note: 'OpenAI 兼容接口，长上下文与推理能力强，API 通常按量计费。'
  },
  {
    id: 'custom',
    name: '自定义兼容接口',
    baseUrl: '',
    model: '',
    note: '用于 OpenRouter、本地代理、公司网关或其他 OpenAI-compatible 服务。'
  }
];

const modeLabels: Record<OutputMode, string> = {
  assignment: '作业/课程任务',
  research: '资料调研',
  coding: '编程开发',
  writing: '写作润色',
  analysis: '数据/文档分析',
  general: '通用任务'
};

const modelHints: Record<OutputMode, string> = {
  assignment: '优先使用具备中文理解和长上下文能力的通用模型；涉及数学、代码或严谨推理时使用推理模型。',
  research: '使用支持联网检索或可处理长上下文的模型；要求引用来源并标注检索日期。',
  coding: '使用代码能力强的模型；要求给出文件结构、关键实现和测试命令。',
  writing: '使用擅长中文表达的通用模型；要求先确认受众、语气和交付格式。',
  analysis: '使用长上下文或表格能力强的模型；要求列出假设、方法、计算过程和结论。',
  general: '使用中文通用模型；要求先澄清目标、约束、输出格式和评价标准。'
};

const bundledKeyMask = 23;
const bundledKeyPayload = [
  100, 79, 28, 92, 42, 63, 126, 124, 81, 84, 74, 58, 58, 124, 103, 76, 75, 93, 58, 49, 99, 125, 73,
  94, 91, 56, 49, 105, 116, 83, 71, 72, 38, 44, 101, 109, 80, 88, 76, 38, 57, 109, 114, 70, 92, 92,
  39, 59, 100, 103, 82
];
const siliconFlowBaseUrl = 'https://api.siliconflow.cn/v1';
const siliconFlowTextModel = 'deepseek-ai/DeepSeek-V4-Flash';
const siliconFlowAsrModel = 'FunAudioLLM/SenseVoiceSmall';
const maxAttachmentChars = 3600;

function getBundledApiKey() {
  return bundledKeyPayload
    .map((code, index) => String.fromCharCode(code ^ ((bundledKeyMask + index * 13) % 91)))
    .join('');
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function cleanText(text: string) {
  return text.replace(/\s+/g, ' ').trim();
}

function truncate(text: string, max = maxAttachmentChars) {
  const normalized = cleanText(text);
  if (normalized.length <= max) return normalized;
  return `${normalized.slice(0, max)}\n\n[已截断，仅保留前 ${max} 字用于生成 prompt]`;
}

async function extractAttachment(file: File): Promise<Attachment> {
  const id = `${file.name}-${file.lastModified}-${crypto.randomUUID()}`;
  const extension = file.name.split('.').pop()?.toLowerCase() ?? '';

  try {
    if (extension === 'pdf' || file.type === 'application/pdf') {
      const [pdfjsLib, workerModule] = await Promise.all([
        import('pdfjs-dist'),
        import('pdfjs-dist/build/pdf.worker.min.mjs?url')
      ]);
      pdfjsLib.GlobalWorkerOptions.workerSrc = workerModule.default;
      const buffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;
      const pageTexts: string[] = [];
      const pageCount = Math.min(pdf.numPages, 12);
      for (let pageNumber = 1; pageNumber <= pageCount; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const content = await page.getTextContent();
        pageTexts.push(
          content.items
            .map((item) => ('str' in item ? item.str : ''))
            .join(' ')
        );
      }
      return {
        id,
        name: file.name,
        type: file.type || 'PDF',
        size: file.size,
        summary: truncate(`PDF 共 ${pdf.numPages} 页，已读取前 ${pageCount} 页：${pageTexts.join('\n')}`),
        status: 'ready'
      };
    }

    if (extension === 'docx') {
      const mammothModule = await import('mammoth/mammoth.browser');
      const mammoth = mammothModule.default;
      const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
      return {
        id,
        name: file.name,
        type: file.type || 'DOCX',
        size: file.size,
        summary: truncate(result.value),
        status: 'ready'
      };
    }

    if (
      file.type.startsWith('text/') ||
      ['md', 'txt', 'csv', 'json', 'html', 'xml', 'rtf', 'log'].includes(extension)
    ) {
      return {
        id,
        name: file.name,
        type: file.type || extension.toUpperCase(),
        size: file.size,
        summary: truncate(await file.text()),
        status: 'ready'
      };
    }

    return {
      id,
      name: file.name,
      type: file.type || '未知类型',
      size: file.size,
      summary: '该附件无法在浏览器中可靠抽取正文。生成的 prompt 会要求目标 AI 先读取并理解该附件。',
      status: 'ready'
    };
  } catch (error) {
    return {
      id,
      name: file.name,
      type: file.type || '未知类型',
      size: file.size,
      summary: error instanceof Error ? error.message : '附件解析失败',
      status: 'error'
    };
  }
}

function buildPromptRequest(rawInput: string, attachments: Attachment[], mode: OutputMode, extra: string) {
  const attachmentBlock =
    attachments.length === 0
      ? '无附件。'
      : attachments
          .map(
            (file, index) =>
              `附件${index + 1}：${file.name}（${file.type}，${formatBytes(file.size)}）\n内容摘要：${file.summary}`
          )
          .join('\n\n');

  return `请把用户的简短语音需求改写成一段高质量、可直接复制给其他 AI 的中文提示词。

要求：
1. 不要编造附件中不存在的信息；如果附件正文缺失，要求目标 AI 先读取附件。
2. 明确任务目标、背景、输入材料、处理步骤、输出格式、质量标准、需要使用的方法/模型/数据。
3. 如果用户需求不完整，先在 prompt 中列出需要目标 AI 合理确认的问题，再给出可执行版本。
4. 输出只包含最终 prompt，不要解释你的改写过程。
5. 适用场景：${modeLabels[mode]}。

用户原始语音/文字：
${rawInput || '用户尚未输入明确需求，请根据附件和场景生成通用任务 prompt。'}

附件信息：
${attachmentBlock}

额外要求：
${extra || '无。'}

模型建议：
${modelHints[mode]}`;
}

function buildLocalPrompt(rawInput: string, attachments: Attachment[], mode: OutputMode, extra: string) {
  const attachmentNames =
    attachments.length > 0
      ? attachments
          .map((file, index) => `附件${index + 1}「${file.name}」：${file.summary.slice(0, 300)}`)
          .join('\n')
      : '无附件。';

  return `你是一名专业 AI 助手。请根据以下需求完成任务，并在不确定时先说明假设。

【任务类型】
${modeLabels[mode]}

【用户需求】
${rawInput || '请阅读附件并判断用户希望完成的任务。'}

【附件】
${attachmentNames}

【执行要求】
1. 先读取并理解所有附件，提炼任务目标、限制条件、评分标准或隐含要求。
2. 给出完成方案：包括步骤、所需数据、可使用的方法、工具或模型。
3. 如涉及作业或报告，请保持学术诚信：展示思路、过程和可验证依据，不替用户伪造经历或来源。
4. 如涉及计算、代码、表格或文档，请说明使用的数据、公式、模型、文件结构和测试/校验方法。
5. 如信息不足，请先列出必须澄清的问题；在可合理假设处给出假设并继续完成。

【输出格式】
- 任务理解
- 完成步骤
- 关键结果或正文
- 引用/依据/数据来源（如适用）
- 交付文件格式与命名建议
- 自检清单

【额外要求】
${extra || '无。'}

【模型选择建议】
${modelHints[mode]}`;
}

async function callOpenAiCompatible(params: {
  baseUrl: string;
  apiKey: string;
  model: string;
  prompt: string;
  signal: AbortSignal;
}) {
  const endpoint = `${params.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const response = await fetch(endpoint, {
    method: 'POST',
    signal: params.signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${params.apiKey}`
    },
    body: JSON.stringify({
      model: params.model,
      temperature: 0.35,
      max_tokens: 2200,
      messages: [
        {
          role: 'system',
          content:
            '你是资深提示词工程师，擅长把中文口语需求、附件描述和隐含约束改写为可执行的高质量 prompt。'
        },
        {
          role: 'user',
          content: params.prompt
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`API 请求失败：${response.status} ${text.slice(0, 260)}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('API 未返回可用内容。');
  return content.trim();
}

async function transcribeWithSiliconFlow(blob: Blob, apiKey: string) {
  const extension = blob.type.includes('mp4') ? 'mp4' : blob.type.includes('wav') ? 'wav' : 'webm';
  const form = new FormData();
  form.append('model', siliconFlowAsrModel);
  form.append('file', blob, `voice2prompt.${extension}`);

  const response = await fetch(`${siliconFlowBaseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`
    },
    body: form
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`语音转文字失败：${response.status} ${text.slice(0, 220)}`);
  }

  const data = await response.json();
  const text = data?.text;
  if (!text) throw new Error('语音转文字未返回文本。');
  return cleanText(text);
}

export default function App() {
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [microphones, setMicrophones] = useState<MediaDeviceInfo[]>([]);
  const [selectedMicrophoneId, setSelectedMicrophoneId] = useState('');
  const [micStatus, setMicStatus] = useState('等待检测麦克风');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [attachmentBusy, setAttachmentBusy] = useState(false);
  const [mode, setMode] = useState<OutputMode>('assignment');
  const [extra, setExtra] = useState('请给出可直接提交或继续加工的成果，并说明推荐文件格式。');
  const [selectedProvider, setSelectedProvider] = useState<ProviderId>('siliconflow');
  const [customBaseUrl, setCustomBaseUrl] = useState('');
  const [model, setModel] = useState(providers[0].model);
  const [apiKey, setApiKey] = useState(getBundledApiKey());
  const [rememberKey, setRememberKey] = useState(false);
  const [generatedPrompt, setGeneratedPrompt] = useState('');
  const [status, setStatus] = useState('准备就绪');
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const provider = useMemo(
    () => providers.find((item) => item.id === selectedProvider) ?? providers[0],
    [selectedProvider]
  );

  const baseUrl = selectedProvider === 'custom' ? customBaseUrl : provider.baseUrl;

  useEffect(() => {
    setSpeechSupported(
      Boolean(
        (typeof navigator.mediaDevices?.getUserMedia === 'function' && 'MediaRecorder' in window) ||
          window.SpeechRecognition ||
          window.webkitSpeechRecognition
      )
    );
    const stored = localStorage.getItem('voice2prompt_api_key');
    if (stored) {
      setApiKey(stored);
      setRememberKey(true);
    }
  }, []);

  useEffect(() => {
    if (rememberKey && apiKey) localStorage.setItem('voice2prompt_api_key', apiKey);
    if (!rememberKey) localStorage.removeItem('voice2prompt_api_key');
  }, [apiKey, rememberKey]);

  function updateProvider(id: ProviderId) {
    const next = providers.find((item) => item.id === id) ?? providers[0];
    setSelectedProvider(id);
    setModel(next.model);
    if (id === 'siliconflow') setApiKey(getBundledApiKey());
    if (id === 'custom') setCustomBaseUrl(customBaseUrl || 'https://api.example.com/v1');
  }

  async function detectMicrophones() {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicStatus('当前浏览器不支持麦克风权限检测');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter((device) => device.kind === 'audioinput');
      setMicrophones(audioInputs);
      setSelectedMicrophoneId((current) => {
        if (current && audioInputs.some((device) => device.deviceId === current)) return current;
        return audioInputs[0]?.deviceId ?? '';
      });
      setMicStatus(audioInputs.length > 0 ? `已检测到 ${audioInputs.length} 个麦克风` : '未发现可用麦克风');
    } catch (error) {
      setMicStatus(error instanceof Error ? `麦克风不可用：${error.message}` : '麦克风权限被拒绝');
    }
  }

  async function startListening() {
    if (typeof navigator.mediaDevices?.getUserMedia === 'function' && 'MediaRecorder' in window && apiKey) {
      try {
        const selectedDevice = microphones.find((device) => device.deviceId === selectedMicrophoneId);
        const audioConstraints: MediaTrackConstraints = {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          ...(selectedMicrophoneId ? { deviceId: { exact: selectedMicrophoneId } } : {})
        };
        const stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
        const preferredMimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
          ? 'audio/webm;codecs=opus'
          : MediaRecorder.isTypeSupported('audio/mp4')
            ? 'audio/mp4'
            : '';
        const recorder = preferredMimeType ? new MediaRecorder(stream, { mimeType: preferredMimeType }) : new MediaRecorder(stream);
        audioChunksRef.current = [];
        audioStreamRef.current = stream;
        mediaRecorderRef.current = recorder;

        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) audioChunksRef.current.push(event.data);
        };

        recorder.onstop = async () => {
          const mimeType = recorder.mimeType || preferredMimeType || 'audio/webm';
          const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
          audioStreamRef.current?.getTracks().forEach((track) => track.stop());
          audioStreamRef.current = null;
          mediaRecorderRef.current = null;
          setIsListening(false);
          setInterimTranscript('');

          if (!audioBlob.size) {
            setStatus('未录到有效音频，请重新录音。');
            return;
          }

          setStatus(`正在使用 ${siliconFlowAsrModel} 转写语音`);
          try {
            const text = await transcribeWithSiliconFlow(audioBlob, apiKey);
            setTranscript((current) => `${current}${current ? '，' : ''}${text}`);
            setStatus('云端语音转文字完成');
          } catch (error) {
            setStatus(error instanceof Error ? error.message : '云端语音转文字失败');
          }
        };

        recorder.start(1000);
        setIsListening(true);
        setInterimTranscript(`正在录音，停止后由 ${siliconFlowAsrModel} 转写`);
        setStatus(`正在录音：${selectedDevice?.label || '默认麦克风'}`);
        return;
      } catch (error) {
        setStatus(error instanceof Error ? `云端录音启动失败，尝试浏览器识别：${error.message}` : '云端录音启动失败，尝试浏览器识别');
      }
    }

    if (!speechSupported) {
      setStatus('当前浏览器不支持 Web Speech API，建议使用 Chrome、Edge 或 Safari。');
      return;
    }

    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!Recognition) return;

    const recognition = new Recognition();
    recognition.lang = 'zh-CN';
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setIsListening(true);
      setStatus('正在识别中文语音');
    };

    recognition.onend = () => {
      setIsListening(false);
      setInterimTranscript('');
    };

    recognition.onerror = (event) => {
      setStatus(`语音识别错误：${event.error || event.message}`);
      setIsListening(false);
    };

    recognition.onresult = (event) => {
      let finalText = '';
      let interimText = '';
      for (let index = event.resultIndex; index < event.results.length; index += 1) {
        const result = event.results[index];
        const text = result[0]?.transcript ?? '';
        if (result.isFinal) finalText += text;
        else interimText += text;
      }
      if (finalText) {
        setTranscript((current) => `${current}${current ? '，' : ''}${cleanText(finalText)}`);
      }
      setInterimTranscript(interimText);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }

  function stopListening() {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      try {
        mediaRecorderRef.current.requestData();
      } catch {
        // Some browsers throw if no data is ready; stop() will still flush what it has.
      }
      mediaRecorderRef.current.stop();
      setStatus('录音已停止，正在准备转写');
      return;
    }
    recognitionRef.current?.stop();
    setIsListening(false);
  }

  async function handleFiles(files: FileList | null) {
    if (!files?.length) return;
    setAttachmentBusy(true);
    setStatus('正在解析附件');
    const parsed = await Promise.all(Array.from(files).map(extractAttachment));
    setAttachments((current) => [...current, ...parsed]);
    setAttachmentBusy(false);
    setStatus('附件解析完成');
  }

  async function generatePrompt(useAi: boolean) {
    const rawInput = cleanText(`${transcript} ${interimTranscript}`);
    if (!rawInput && attachments.length === 0) {
      setStatus('请先录入语音、文字或上传附件。');
      return;
    }

    const draftRequest = buildPromptRequest(rawInput, attachments, mode, extra);

    if (!useAi || !apiKey || !baseUrl || !model) {
      setGeneratedPrompt(buildLocalPrompt(rawInput, attachments, mode, extra));
      setStatus(apiKey ? '已用本地规则生成 prompt' : '未配置 API Key，已用本地规则生成 prompt');
      return;
    }

    abortRef.current?.abort();
    abortRef.current = new AbortController();
    setIsGenerating(true);
    setStatus('正在调用大模型优化 prompt');
    try {
      const result = await callOpenAiCompatible({
        baseUrl,
        apiKey,
        model,
        prompt: draftRequest,
        signal: abortRef.current.signal
      });
      setGeneratedPrompt(result);
      setStatus('AI 优化完成');
    } catch (error) {
      const message = error instanceof Error ? error.message : '未知错误';
      setGeneratedPrompt(buildLocalPrompt(rawInput, attachments, mode, extra));
      setStatus(`AI 调用失败，已回退到本地规则：${message}`);
    } finally {
      setIsGenerating(false);
    }
  }

  async function copyPrompt() {
    if (!generatedPrompt) return;
    await navigator.clipboard.writeText(generatedPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  function downloadPrompt() {
    if (!generatedPrompt) return;
    const blob = new Blob([generatedPrompt], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `voice2prompt-${new Date().toISOString().slice(0, 10)}.md`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div className="hero-copy">
          <span className="eyebrow">
            <Sparkles size={16} />
            Voice2Prompt
          </span>
          <h1>语音转提示词工具</h1>
          <p>面向学习、办公和创作场景，将语音需求、文字补充和附件信息整理为可执行的 AI Prompt。</p>
        </div>
        <div className="status-strip">
          <span className={speechSupported ? 'dot ok' : 'dot warn'} />
          {speechSupported ? `已配置云端 STT：${siliconFlowAsrModel}` : '当前浏览器不支持语音输入'}
          <span className="divider" />
          {status}
        </div>
      </section>

      <section className="workspace">
        <div className="left-rail">
          <div className="panel voice-panel">
            <div className="panel-title">
              <Mic2 size={18} />
              <h2>语音与需求</h2>
            </div>

            <div className="mic-actions">
              <button className="secondary-btn" type="button" onClick={detectMicrophones}>
                <Settings2 size={17} />
                检测麦克风
              </button>
              <button
                className={isListening ? 'danger-btn' : 'primary-btn'}
                type="button"
                onClick={isListening ? stopListening : startListening}
              >
                {isListening ? <Square size={17} /> : <Play size={17} />}
                {isListening ? '停止录音' : '开始录音'}
              </button>
            </div>

            <div className="mic-status">
              <Mic size={16} />
              <span>{micStatus}</span>
            </div>

            {microphones.length > 0 && (
              <label className="field-label" htmlFor="microphone-select">
                输入设备
                <select
                  id="microphone-select"
                  value={selectedMicrophoneId}
                  onChange={(event) => {
                    setSelectedMicrophoneId(event.target.value);
                    const selected = microphones.find((device) => device.deviceId === event.target.value);
                    setMicStatus(`已选择：${selected?.label || '默认麦克风'}`);
                  }}
                >
                  {microphones.map((device, index) => (
                    <option key={device.deviceId || index} value={device.deviceId}>
                      {device.label || `麦克风 ${index + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            )}

            <label className="field-label" htmlFor="transcript">
              识别结果 / 手动补充
            </label>
            <textarea
              id="transcript"
              value={transcript}
              onChange={(event) => setTranscript(event.target.value)}
              placeholder="例如：请完成附件1中的作业，写成 Word 文档，要求有步骤和参考资料。"
            />
            {interimTranscript && <div className="interim">正在识别：{interimTranscript}</div>}

            <label className="field-label" htmlFor="mode">
              任务类型
            </label>
            <div className="mode-grid" id="mode">
              {(Object.keys(modeLabels) as OutputMode[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  className={mode === key ? 'mode-chip active' : 'mode-chip'}
                  onClick={() => setMode(key)}
                >
                  {modeLabels[key]}
                </button>
              ))}
            </div>

            <label className="field-label" htmlFor="extra">
              额外要求
            </label>
            <textarea
              className="small-textarea"
              id="extra"
              value={extra}
              onChange={(event) => setExtra(event.target.value)}
            />
          </div>

          <div className="panel">
            <div className="panel-title">
              <Paperclip size={18} />
              <h2>附件</h2>
            </div>
            <label className="upload-zone">
              <input
                type="file"
                multiple
                accept=".txt,.md,.pdf,.docx,.csv,.json,.html,.xml,.rtf,.log,image/*"
                onChange={(event) => handleFiles(event.target.files)}
              />
              {attachmentBusy ? <Loader2 className="spin" size={22} /> : <FileText size={22} />}
              <span>{attachmentBusy ? '正在解析附件' : '点击上传或拖入附件'}</span>
              <small>支持 TXT、Markdown、CSV、JSON、PDF、DOCX；图片会作为附件说明加入 prompt。</small>
            </label>

            <div className="attachment-list">
              {attachments.map((file) => (
                <div className="attachment-item" key={file.id}>
                  <div>
                    <strong>{file.name}</strong>
                    <span>
                      {file.type} · {formatBytes(file.size)}
                    </span>
                  </div>
                  <button
                    className="icon-btn"
                    type="button"
                    aria-label={`移除 ${file.name}`}
                    onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))}
                  >
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="right-rail">
          <div className="panel api-panel">
            <div className="panel-title">
              <KeyRound size={18} />
              <h2>AI 优化配置</h2>
            </div>

            <div className="provider-grid">
              {providers.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={selectedProvider === item.id ? 'provider-card active' : 'provider-card'}
                  onClick={() => updateProvider(item.id)}
                >
                  <strong>{item.name}</strong>
                  <span>{item.note}</span>
                </button>
              ))}
            </div>

            <div className="settings-grid">
              <label>
                Base URL
                <input
                  value={baseUrl}
                  disabled={selectedProvider !== 'custom'}
                  onChange={(event) => setCustomBaseUrl(event.target.value)}
                  placeholder="https://api.example.com/v1"
                />
              </label>
              <label>
                模型
                <input value={model} onChange={(event) => setModel(event.target.value)} placeholder="模型 ID" />
              </label>
              <label className="full">
                API Key
                <input
                  type="password"
                  value={apiKey}
                  onChange={(event) => setApiKey(event.target.value)}
                  placeholder="只保存在你的浏览器中；不要写入代码仓库"
                />
              </label>
            </div>

            <label className="remember-row">
              <input type="checkbox" checked={rememberKey} onChange={(event) => setRememberKey(event.target.checked)} />
              记住 API Key 到本机 localStorage
            </label>

            <div className="security-note">
              <ShieldCheck size={17} />
              已按要求内置 SiliconFlow API Key，并做轻量混淆；文本模型默认 {siliconFlowTextModel}，语音模型默认 {siliconFlowAsrModel}。
            </div>
          </div>

          <div className="panel output-panel">
            <div className="output-head">
              <div className="panel-title">
                <Bot size={18} />
                <h2>生成结果</h2>
              </div>
              <div className="output-actions">
                <button className="secondary-btn" type="button" onClick={() => generatePrompt(false)}>
                  <RefreshCcw size={16} />
                  本地生成
                </button>
                <button className="primary-btn" type="button" onClick={() => generatePrompt(true)} disabled={isGenerating}>
                  {isGenerating ? <Loader2 className="spin" size={16} /> : <Wand2 size={16} />}
                  AI 优化
                </button>
              </div>
            </div>

            <textarea
              className="prompt-output"
              value={generatedPrompt}
              onChange={(event) => setGeneratedPrompt(event.target.value)}
              placeholder="生成后的高质量 prompt 会显示在这里。"
            />

            <div className="result-toolbar">
              <button className="secondary-btn" type="button" onClick={copyPrompt} disabled={!generatedPrompt}>
                {copied ? <CheckCircle2 size={16} /> : <Copy size={16} />}
                {copied ? '已复制' : '复制'}
              </button>
              <button className="secondary-btn" type="button" onClick={downloadPrompt} disabled={!generatedPrompt}>
                <Download size={16} />
                下载 Markdown
              </button>
            </div>

            <div className="status-box">
              <AlertCircle size={16} />
              <span>{status}</span>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
