// ==UserScript==
// @name         AI summary
// @namespace    http://tampermonkey.net/
// @version      2.4.7
// @description  一键抓取网页正文，通过 AI API 智能总结；支持追问及多轮对话；支持 OpenAI/Anthropic/Gemini/DeepSeek等兼容接口
// @author       Septuagint,URL:https://Candy-spt.com/
// @match        *://*/*
// @grant        GM_xmlhttpRequest
// @grant        GM_setValue
// @grant        GM_getValue
// @grant        GM_addStyle
// @grant        GM_registerMenuCommand
// @connect      *
// @run-at       document-end
// ==/UserScript==

(function () {
  "use strict";

  /* ================================================
       默认配置
    ================================================ */
  const DEFAULTS = {
    apiUrl: "https://openrouter.ai/api/v1/chat/completions",
    apiKey: "",
    model: "google/gemini-3.1-pro-preview",
    maxTokens: 2048,
    temperature: 0.7,
    stream: true,
    maxContentLength: 16000,
    systemPrompt:
      "你是一个专业的网页内容分析助手，擅长提取和总结文章核心内容，回答简洁清晰。",
    userPrompt: `请对以下网页内容进行总结分析：

标题：{title}

正文：
{content}

请按以下格式回答：
📌 **主题**：一句话概括文章主题

🔑 **要点**：
- 要点一
- 要点二
- 要点三

💡 **总结**：简短结论`,
  };

  /* ================================================
       API 预设
    ================================================ */
  const PRESETS = [
    {
      id: "openai",
      name: "OpenAI",
      url: "https://api.openai.com/v1/chat/completions",
      model: "gpt-5.5",
    },
    {
      id: "anthropic",
      name: "Anthropic",
      url: "https://api.anthropic.com/v1/messages",
      model: "claude-opus-4.7",
    },
    {
      id: "gemini",
      name: "Gemini",
      url: "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}",
      model: "gemini-3.1-pro-preview",
    },
    {
      id: "xai",
      name: "xAI",
      url: "https://api.x.ai/v1/chat/completions",
      model: "gork-4.3",
    },
    {
      id: "deepseek",
      name: "DeepSeek",
      url: "https://api.deepseek.com/v1/chat/completions",
      model: "deepseek-v4-pro",
    },
    {
      id: "openrouter",
      name: "Openrouter",
      url: "https://openrouter.ai/api/v1/chat/completions",
      model: "google/gemini-3.1-pro-preview",
    },
  ];

  /* ================================================
       配置管理
    ================================================ */
  const Cfg = {
    get: () =>
      Object.fromEntries(
        Object.keys(DEFAULTS).map((k) => [k, GM_getValue(k, DEFAULTS[k])]),
      ),
    set: (obj) => Object.entries(obj).forEach(([k, v]) => GM_setValue(k, v)),
    reset: () =>
      Object.entries(DEFAULTS).forEach(([k, v]) => GM_setValue(k, v)),
  };

  /* ================================================
       正文提取
    ================================================ */
  function extractContent() {
    const STRIP_SEL = [
      "script",
      "style",
      "noscript",
      "iframe",
      "svg",
      "canvas",
      "nav",
      "header",
      "footer",
      "aside",
      '[role="navigation"]',
      '[class*="navbar"]',
      '[class*="nav-"]',
      '[id*="nav-"]',
      '[class*="sidebar"]',
      '[class*="side-bar"]',
      '[class*="comment"]',
      '[class*="footer"]',
      '[class*="header"]',
      '[class*="banner"]',
      '[class*="advertisement"]',
      '[class*="-ads"]',
      '[class*="ads-"]',
      '[id*="ads"]',
      '[class*="popup"]',
      '[class*="modal"]',
      '[class*="cookie"]',
      ".share",
      ".social",
      ".related",
      ".recommend",
    ];
    const CONTENT_SEL = [
      "article",
      '[role="main"]',
      "main",
      ".article-content",
      ".article-body",
      ".post-content",
      ".entry-content",
      ".content-body",
      ".news-content",
      ".detail-content",
      ".story-content",
      "#article",
      "#content",
      "#main-content",
    ];

    try {
      const clone = document.documentElement.cloneNode(true);
      STRIP_SEL.forEach((s) => {
        try {
          clone.querySelectorAll(s).forEach((e) => e.remove());
        } catch {}
      });

      for (const sel of CONTENT_SEL) {
        const el = clone.querySelector(sel);
        if (el) {
          const t = (el.innerText || el.textContent || "").trim();
          if (t.length > 300) return cleanText(t);
        }
      }
      const body = clone.querySelector("body");
      return cleanText(
        body?.innerText || body?.textContent || document.body.textContent || "",
      );
    } catch {
      return cleanText(document.body.textContent || "");
    }
  }

  function cleanText(t) {
    return t
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }

  /* ================================================
   多提供商适配层
================================================ */

  function detectProvider(url) {
    if (url.includes("anthropic.com")) return "anthropic";
    if (url.includes("generativelanguage.googleapis")) return "gemini";
    return "openai";
  }

  function buildRequest(cfg, messages) {
    const provider = detectProvider(cfg.apiUrl);

    if (provider === "anthropic") {
      return {
        url: cfg.apiUrl,
        headers: {
          "Content-Type": "application/json",
          "x-api-key": cfg.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: cfg.model,
          max_tokens: +cfg.maxTokens,
          system: cfg.systemPrompt,
          messages: messages,
          stream: cfg.stream,
        }),
      };
    }

    if (provider === "gemini") {
      let url = cfg.apiUrl
        .replace("{model}", cfg.model)
        .replace("{key}", cfg.apiKey);
      if (cfg.stream)
        url =
          url.replace("generateContent", "streamGenerateContent") + "&alt=sse";

      const contents = messages.map((m) => ({
        role: m.role === "assistant" ? "model" : "user",
        parts: [{ text: m.content }],
      }));

      return {
        url,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: contents,
          systemInstruction: { parts: [{ text: cfg.systemPrompt }] },
          generationConfig: {
            maxOutputTokens: +cfg.maxTokens,
            temperature: +cfg.temperature,
          },
        }),
      };
    }

    return {
      url: cfg.apiUrl,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${cfg.apiKey}`,
      },
      body: JSON.stringify({
        model: cfg.model,
        messages: [{ role: "system", content: cfg.systemPrompt }, ...messages],
        max_tokens: +cfg.maxTokens,
        temperature: +cfg.temperature,
        stream: cfg.stream,
      }),
    };
  }

  function parseStreamChunk(provider, line) {
    if (!line.startsWith("data:")) return null;
    const raw = line.slice(5).trim();
    if (!raw) return null;
    try {
      if (provider === "anthropic") {
        const json = JSON.parse(raw);
        if (json.type === "message_stop") return "[DONE]";
        if (
          json.type === "content_block_delta" &&
          json.delta?.type === "text_delta"
        )
          return json.delta.text;
        return null;
      }
      if (provider === "gemini")
        return (
          JSON.parse(raw).candidates?.[0]?.content?.parts?.[0]?.text || null
        );
      if (raw === "[DONE]") return "[DONE]";
      return JSON.parse(raw).choices?.[0]?.delta?.content || null;
    } catch {
      return null;
    }
  }

  function parseFullResponse(provider, responseText) {
    if (responseText.includes("data:")) {
      let result = "";
      for (const line of responseText.split("\n")) {
        const delta = parseStreamChunk(provider, line.trim());
        if (delta && delta !== "[DONE]") result += delta;
      }
      if (result) return result;
    }
    try {
      const json = JSON.parse(responseText);
      if (provider === "anthropic") return json.content?.[0]?.text || "";
      if (provider === "gemini")
        return json.candidates?.[0]?.content?.parts?.[0]?.text || "";
      return json.choices?.[0]?.message?.content || "";
    } catch {
      return "";
    }
  }

  function parseErrorMsg(provider, responseText, status) {
    let msg = `HTTP ${status}`;
    try {
      const json = JSON.parse(responseText);
      msg = json.error?.message || msg;
    } catch {}
    return msg;
  }

  /* ================================================
   API 调用主函数
================================================ */
  let _req = null;

  function callAPI(messages, { onChunk, onDone, onError }) {
    const cfg = Cfg.get();
    if (!cfg.apiKey && !cfg.apiUrl.includes("{key}")) {
      onError("未设置 API Key，请点击 ⚙️ 进行配置");
      return;
    }

    const provider = detectProvider(cfg.apiUrl);
    const reqCfg = buildRequest(cfg, messages);

    let buffer = "",
      fullText = "",
      finished = false;
    const finish = (text) => {
      if (!finished) {
        finished = true;
        onDone(text);
      }
    };

    _req = GM_xmlhttpRequest({
      method: "POST",
      url: reqCfg.url,
      headers: reqCfg.headers,
      data: reqCfg.body,
      timeout: 90000,
      onprogress: cfg.stream
        ? (ev) => {
            const newPart = ev.responseText.slice(buffer.length);
            buffer = ev.responseText;
            for (const line of newPart.split("\n")) {
              const delta = parseStreamChunk(provider, line.trim());
              if (delta === "[DONE]") {
                finish(fullText);
                return;
              }
              if (delta) {
                fullText += delta;
                onChunk(fullText);
              }
            }
          }
        : null,
      onload(res) {
        if (res.status < 200 || res.status >= 300)
          return onError(parseErrorMsg(provider, res.responseText, res.status));
        if (!cfg.stream) {
          fullText = parseFullResponse(provider, res.responseText);
          onChunk(fullText);
          finish(fullText);
          return;
        }
        setTimeout(() => {
          if (!fullText) {
            fullText = parseFullResponse(provider, res.responseText);
            if (fullText) onChunk(fullText);
          }
          finish(fullText);
        }, 0);
      },
      onerror: () => onError("网络错误，请检查 API 地址与网络连接"),
      ontimeout: () => onError("请求超时（90s），请检查网络或 API 服务状态"),
    });
  }

  /* ================================================
       简易 Markdown 渲染
    ================================================ */
  function renderMd(raw) {
    const esc = (s) =>
      s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    const lines = esc(raw).split("\n");
    let html = "";
    let inUl = false;

    for (const rawLine of lines) {
      let line = rawLine
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(
          /`(.+?)`/g,
          '<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px">$1</code>',
        );

      if (/^#{1,3} /.test(rawLine)) {
        if (inUl) {
          html += "</ul>";
          inUl = false;
        }
        html += `<h3 style="margin:10px 0 4px;font-size:14px;font-weight:700">${line.replace(/^#+\s*/, "")}</h3>`;
        continue;
      }

      if (/^[-*•] /.test(rawLine)) {
        if (!inUl) {
          html += '<ul style="padding-left:20px;margin:6px 0">';
          inUl = true;
        }
        html += `<li style="margin:3px 0">${line.replace(/^[-*•]\s*/, "")}</li>`;
        continue;
      }

      if (inUl) {
        html += "</ul>";
        inUl = false;
      }
      if (!rawLine.trim()) {
        html += "<br>";
        continue;
      }
      html += `<p style="margin:5px 0">${line}</p>`;
    }
    if (inUl) html += "</ul>";
    return html;
  }

  /* ================================================
       工具函数
    ================================================ */
  const $ = (id) => document.getElementById(id);
  const esc = (s) =>
    String(s || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  const toggle = (id, show) => $(id)?.classList.toggle("ais-off", !show);
  const setBody = (html) => {
    const b = $("ais-body");
    if (b) b.innerHTML = html;
  };

  function showToast(msg, color = "#111827") {
    const t = document.createElement("div");
    t.style.cssText = `
            position:fixed;right:22px;bottom:86px;z-index:2147483645;
            background:${color};color:#fff;padding:9px 16px;
            border-radius:10px;font-size:13px;
            box-shadow:0 4px 16px rgba(0,0,0,.25);
            font-family:system-ui,-apple-system,sans-serif;
            animation:ais-ti .25s ease;pointer-events:none;
        `;
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => {
      t.style.cssText += ";opacity:0;transition:opacity .3s";
      setTimeout(() => t.remove(), 400);
    }, 2200);
  }

  function setLoading(v) {
    const run = $("ais-run"),
      stop = $("ais-stop"),
      chat = $("ais-chat-wrap");
    if (stop) stop.style.display = v ? "" : "none";
    if (v) {
      if (run) run.style.display = "none";
      if (chat) chat.style.display = "none";
    }
  }

  /* ================================================
       CSS 样式
    ================================================ */
  GM_addStyle(`
        @keyframes ais-spin { to { transform: rotate(360deg); } }
        @keyframes ais-blink { 50% { opacity: 0; } }
        @keyframes ais-ti { from { opacity:0; transform:translateY(8px); } }

        .ais-off { opacity: 0 !important; pointer-events: none !important; transform: translateY(10px) scale(.97) !important; }

        #ais-fab { position: fixed; right: 22px; bottom: 22px; z-index: 2147483641; display: flex; align-items: center; justify-content: center; width: 35px; height: 35px; border-radius: 50%; background: linear-gradient(135deg, #F8F8F8, #F8F8F8); border: none; cursor: pointer; color: #fff; font-size: 24px; box-shadow: 1px 4px 18px rgba(125,125,125,.6); transition: transform .2s, box-shadow .2s; user-select: none; }
        #ais-fab:hover { transform: scale(1.12); box-shadow: 0 6px 24px rgba(150,150,150,.5); }
        #ais-fab:active { transform: scale(.95); }

        #ais-main, #ais-settings { position: fixed; right: 22px; bottom: 86px; z-index: 2147483640; width: 420px; background: #fff; border-radius: 18px; box-shadow: 0 8px 40px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.06); display: flex; flex-direction: column; overflow: hidden; transition: opacity .22s ease, transform .22s ease; font-family: system-ui, -apple-system, 'Segoe UI', sans-serif; font-size: 14px; }

        .ais-hd { display: flex; align-items: center; gap: 6px; padding: 12px 14px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; flex-shrink: 0; cursor: move; user-select: none; }
        .ais-hd-title { flex: 1; font-size: 14px; font-weight: 600; }
        .ais-hbtn { background: rgba(255,255,255,.22); border: none; color: #fff; border-radius: 7px; padding: 4px 9px; cursor: pointer; font-size: 12px; white-space: nowrap; transition: background .15s; }
        .ais-hbtn:hover { background: rgba(255,255,255,.38); }
        .ais-meta { padding: 6px 14px; font-size: 11px; color: #9ca3af; background: #fafafa; border-bottom: 1px solid #f3f4f6; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0; }
        .ais-body { flex: 1; overflow-y: auto; padding: 14px; min-height: 160px; max-height: 440px; scroll-behavior: smooth; }
        .ais-body::-webkit-scrollbar { width: 4px; }
        .ais-body::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 4px; }

        .ais-ph { color: #9ca3af; text-align: center; padding: 32px 12px; line-height: 1.8; font-size: 13px; }
        .ais-loading { display: flex; align-items: center; justify-content: center; gap: 10px; color: #6366f1; padding: 32px; font-size: 13px; }
        .ais-spinner { width: 20px; height: 20px; border-radius: 50%; border: 2px solid #e0e7ff; border-top-color: #6366f1; animation: ais-spin .7s linear infinite; flex-shrink: 0; }

        .ais-res { line-height: 1.8; color: #1f2937; font-size: 13.5px; }
        .ais-cursor::after { content: '▊'; color: #6366f1; animation: ais-blink .8s step-end infinite; }
        .ais-err { background: #fef2f2; border-left: 3px solid #f87171; color: #dc2626; padding: 12px 14px; border-radius: 8px; font-size: 13px; line-height: 1.6; }

        .ais-ft { display: flex; gap: 8px; padding: 10px 12px; border-top: 1px solid #f3f4f6; flex-shrink: 0; }
        .ais-btn { flex: 1; padding: 8px; border: none; border-radius: 9px; font-size: 13px; font-weight: 500; cursor: pointer; transition: all .15s; }
        .ais-primary { background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; box-shadow: 0 2px 8px rgba(99,102,241,.3); }
        .ais-primary:hover { opacity: .88; transform: translateY(-1px); }
        .ais-secondary { background: #f3f4f6; color: #374151; }
        .ais-secondary:hover { background: #e5e7eb; }
        .ais-danger { background: #fee2e2; color: #dc2626; }
        .ais-danger:hover { background: #fecaca; }

        .ais-chat-wrap { display: flex; flex: 1; gap: 8px; align-items: center; }
        .ais-chat-input { flex: 1; padding: 7px 10px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 13px; outline: none; background: #fafafa; transition: border-color .15s; }
        .ais-chat-input:focus { border-color: #6366f1; background: #fff; }
        .ais-btn-square { width: 34px; height: 34px; padding: 0; display: flex; align-items: center; justify-content: center; flex-shrink: 0; border-radius: 8px; font-size: 15px; }
        .ais-user-msg { background: #f3f4f6; padding: 10px 12px; border-radius: 8px; margin: 16px 0 8px; font-size: 13px; color: #374151; word-break: break-word; border-left: 3px solid #9ca3af; }

        #ais-settings { max-height: 580px; }
        .ais-cfg-body { padding: 14px 16px; overflow-y: auto; flex: 1; }
        .ais-cfg-body::-webkit-scrollbar { width: 4px; }
        .ais-cfg-body::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 4px; }
        .ais-field { margin-bottom: 11px; }
        .ais-lbl { display: block; font-size: 11px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: .4px; margin-bottom: 4px; }
        .ais-inp, .ais-ta { width: 100%; padding: 8px 10px; border: 1.5px solid #e5e7eb; border-radius: 8px; font-size: 13px; color: #111; background: #fafafa; outline: none; transition: border-color .15s; box-sizing: border-box; }
        .ais-inp:focus, .ais-ta:focus { border-color: #6366f1; background: #fff; }
        .ais-ta { resize: vertical; min-height: 75px; }
        .ais-presets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
        .ais-pre { padding: 4px 11px; border: 1.5px solid #e0e7ff; background: #eef2ff; color: #4f46e5; border-radius: 20px; cursor: pointer; font-size: 12px; font-weight: 500; transition: all .15s; }
        .ais-pre:hover { background: #6366f1; color: #fff; border-color: #6366f1; }
        .ais-row { display: flex; align-items: center; justify-content: space-between; }
        .ais-sw { position: relative; width: 40px; height: 22px; background: #d1d5db; border-radius: 11px; border: none; cursor: pointer; transition: background .2s; flex-shrink: 0; }
        .ais-sw.on { background: #6366f1; }
        .ais-sw::after { content: ''; position: absolute; width: 18px; height: 18px; background: #fff; border-radius: 50%; top: 2px; left: 2px; box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: left .2s; }
        .ais-sw.on::after { left: 20px; }
    `);

  /* ================================================
       状态变量
    ================================================ */
  let panelOpen = false;
  let settingsOpen = false;
  let streaming = false;
  let fullText = "";
  let chatHistory = [];
  let currentResNode = null;

  /* ================================================
       构建主面板 HTML
    ================================================ */
  function abortAPI() {
    if (_req) {
      _req.abort();
      _req = null;
    }
  }

  function createMainPanel() {
    const panel = document.createElement("div");
    panel.id = "ais-main";
    panel.className = "ais-off";
    panel.innerHTML = `
            <div class="ais-hd">
                <span class="ais-hd-title">🤖 AI 内容总结与对话</span>
                <button class="ais-hbtn" id="ais-copy">📋 复制</button>
                <button class="ais-hbtn" id="ais-cfg-open">⚙️ 设置</button>
                <button class="ais-hbtn" id="ais-main-close">✕</button>
            </div>
            <div class="ais-meta" id="ais-meta">${esc(document.title)}</div>
            <div class="ais-body" id="ais-body">
                <div class="ais-ph">点击下方「开始总结」按钮<br>AI 将自动提取并分析当前页面内容 📖</div>
            </div>
            <div class="ais-ft" id="ais-ft-actions">
                <button class="ais-btn ais-danger" id="ais-stop" style="display:none">⏹ 停止</button>
                <button class="ais-btn ais-primary" id="ais-run">✨ 开始总结</button>
                <div class="ais-chat-wrap" id="ais-chat-wrap" style="display:none;">
                    <button class="ais-btn ais-secondary ais-btn-square" id="ais-re-run" title="重新总结">🔄</button>
                    <input type="text" class="ais-chat-input" id="ais-chat-input" placeholder="输入追问内容，回车发送...">
                    <button class="ais-btn ais-primary ais-btn-square" id="ais-chat-send" title="发送">⬆️</button>
                </div>
            </div>
        `;
    return panel;
  }

  /* ================================================
       构建设置面板 HTML
    ================================================ */
  function renderSettings(cfg) {
    let s = $("ais-settings");
    if (!s) {
      s = document.createElement("div");
      s.id = "ais-settings";
      s.className = "ais-off";
      document.body.appendChild(s);
    }
    s.innerHTML = `
            <div class="ais-hd" style="cursor:default;">
                <span class="ais-hd-title">⚙️ API 设置</span>
                <button class="ais-hbtn" id="ais-cfg-close">✕</button>
            </div>
            <div class="ais-cfg-body">
                <div class="ais-presets">
                    ${PRESETS.map((p) => `<button class="ais-pre" data-pid="${p.id}">${p.name}</button>`).join("")}
                </div>
                <div class="ais-field">
                    <label class="ais-lbl">API 地址</label>
                    <input class="ais-inp" id="f-url" value="${esc(cfg.apiUrl)}" placeholder="https://api.openai.com/v1/chat/completions">
                </div>
                <div class="ais-field">
                    <label class="ais-lbl">API Key</label>
                    <input class="ais-inp" id="f-key" type="password" value="${esc(cfg.apiKey)}" placeholder="sk-...">
                </div>
                <div class="ais-field">
                    <label class="ais-lbl">模型名称</label>
                    <input class="ais-inp" id="f-model" value="${esc(cfg.model)}" placeholder="gpt-3.5-turbo">
                </div>
                <div class="ais-field">
                    <label class="ais-lbl">最大输出 Token</label>
                    <input class="ais-inp" id="f-tokens" type="number" value="${cfg.maxTokens}" min="100" max="8000">
                </div>
                <div class="ais-field">
                    <label class="ais-lbl">最大正文字符数（超出自动截断）</label>
                    <input class="ais-inp" id="f-maxlen" type="number" value="${cfg.maxContentLength}" min="1000" max="50000">
                </div>
                <div class="ais-field">
                    <div class="ais-row"><label class="ais-lbl" style="margin:0">流式输出（Stream）</label><button class="ais-sw ${cfg.stream ? "on" : ""}" id="f-stream"></button></div>
                </div>
                <div class="ais-field"><label class="ais-lbl">系统提示词</label><textarea class="ais-ta" id="f-sys">${esc(cfg.systemPrompt)}</textarea></div>
                <div class="ais-field"><label class="ais-lbl">用户提示词</label><textarea class="ais-ta" id="f-prompt" style="min-height:140px">${esc(cfg.userPrompt)}</textarea></div>
            </div>
            <div class="ais-ft">
                <button class="ais-btn ais-secondary" id="ais-cfg-reset">↩ 恢复默认</button>
                <button class="ais-btn ais-primary" id="ais-cfg-save">💾 保存设置</button>
            </div>
        `;
    bindSettingsEvents();
  }

  /* ================================================
       使面板可拖动
    ================================================ */
  function makeDraggable(panelId) {
    const panel = $(panelId);
    const hd = panel.querySelector(".ais-hd");
    let isDragging = false,
      offset = { x: 0, y: 0 };

    hd.addEventListener("mousedown", (e) => {
      if (e.target.tagName.toLowerCase() === "button") return;
      isDragging = true;
      const rect = panel.getBoundingClientRect();
      offset.x = e.clientX - rect.left;
      offset.y = e.clientY - rect.top;
      panel.style.transition = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      let left = e.clientX - offset.x;
      let top = e.clientY - offset.y;
      left = Math.max(0, Math.min(window.innerWidth - panel.offsetWidth, left));
      top = Math.max(0, Math.min(window.innerHeight - panel.offsetHeight, top));

      panel.style.left = left + "px";
      panel.style.top = top + "px";
      panel.style.right = "auto";
      panel.style.bottom = "auto";
    });

    document.addEventListener("mouseup", () => {
      if (isDragging) {
        isDragging = false;
        panel.style.transition = "opacity .22s ease, transform .22s ease";
      }
    });
  }

  /* ================================================
       动态定位主面板（跟随悬浮按钮）
    ================================================ */
  function positionMainPanelBasedOnFab() {
    const fab = $("ais-fab");
    const mainPanel = $("ais-main");
    const fabRect = fab.getBoundingClientRect();
    const isLeft = fabRect.left < window.innerWidth / 2;

    mainPanel.style.right = "auto";
    mainPanel.style.bottom = "auto";

    let leftPos = isLeft ? fabRect.right + 15 : fabRect.left - 420 - 15;
    leftPos = Math.max(10, Math.min(window.innerWidth - 420 - 10, leftPos));
    mainPanel.style.left = leftPos + "px";

    let topPos = fabRect.top;

    const panelHeight = mainPanel.offsetHeight || 420;

    if (topPos + panelHeight > window.innerHeight) {
      topPos = window.innerHeight - panelHeight - 8;
    }

    topPos = Math.max(8, topPos);

    mainPanel.style.top = topPos + "px";

    mainPanel.style.top = Math.max(10, topPos) + "px";
  }

  /* ================================================
       事件绑定
    ================================================ */
  function bindMainEvents() {
    const PEEK_LEFT = 16,
      PEEK_RIGHT = 24,
      DRAG_THRESHOLD = 8;
    const fab = $("ais-fab");
    let isDragging = false,
      hasMoved = false;
    window.snapSide = "right";
    let offset = { x: 0, y: 0 },
      startPos = { x: 0, y: 0 };

    fab.addEventListener("mousedown", (e) => {
      isDragging = true;
      hasMoved = false;
      const rect = fab.getBoundingClientRect();
      offset.x = e.clientX - rect.left;
      offset.y = e.clientY - rect.top;
      startPos.x = e.clientX;
      startPos.y = e.clientY;
      fab.style.transition = "none";
    });

    document.addEventListener("mousemove", (e) => {
      if (!isDragging) return;
      const dx = e.clientX - startPos.x,
        dy = e.clientY - startPos.y;
      if (!hasMoved && Math.sqrt(dx * dx + dy * dy) > DRAG_THRESHOLD) {
        hasMoved = true;
        fab.style.transition = "all 0.12s ease-out";
        fab.style.left = e.clientX - offset.x + "px";
        fab.style.top = e.clientY - offset.y + "px";
        return;
      }
      if (!hasMoved) return;
      fab.style.transition = "none";

      let left = Math.max(
        10,
        Math.min(
          window.innerWidth - fab.offsetWidth - 10,
          e.clientX - offset.x,
        ),
      );
      let top = Math.max(
        10,
        Math.min(
          window.innerHeight - fab.offsetHeight - 10,
          e.clientY - offset.y,
        ),
      );

      fab.style.left = left + "px";
      fab.style.top = top + "px";
      fab.style.right = "auto";
      fab.style.bottom = "auto";
    });

    document.addEventListener("mouseup", () => {
      if (!isDragging) return;
      isDragging = false;
      if (!hasMoved) return;

      const rect = fab.getBoundingClientRect();
      const isLeft = rect.left < window.innerWidth / 2;
      fab.style.transition = "all 0.35s cubic-bezier(0.25, 1.4, 0.4, 1)";
      fab.style.left =
        (isLeft
          ? -(fab.offsetWidth - PEEK_LEFT) + 10
          : window.innerWidth - PEEK_RIGHT - 10) + "px";
      fab.style.top = rect.top + "px";

      GM_setValue("fab_position", {
        xRatio: rect.left / window.innerWidth,
        yRatio: rect.top / window.innerHeight,
      });
      window.snapSide = isLeft ? "left" : "right";
    });

    fab.addEventListener("mouseenter", () => {
      const rect = fab.getBoundingClientRect();
      fab.style.transition = "all 0.25s ease-out";
      if (rect.left < window.innerWidth / 2) fab.style.left = 15 + "px";
      else fab.style.left = window.innerWidth - fab.offsetWidth - 15 + "px";
    });

    fab.addEventListener("mouseleave", () => {
      if (isDragging) return;
      const rect = fab.getBoundingClientRect();
      fab.style.transition = "all 0.3s cubic-bezier(0.25, 1.4, 0.4, 1)";
      if (rect.left < window.innerWidth / 2)
        fab.style.left = -(fab.offsetWidth - PEEK_LEFT) + 10 + "px";
      else fab.style.left = window.innerWidth - PEEK_RIGHT - 10 + "px";
    });

    fab.addEventListener("click", (e) => {
      if (hasMoved) {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
      panelOpen = !panelOpen;
      if (panelOpen) positionMainPanelBasedOnFab(); // 动态计算跟随位置
      toggle("ais-main", panelOpen);
      if (!panelOpen) {
        settingsOpen = false;
        toggle("ais-settings", false);
      }
    });

    $("ais-main-close").addEventListener("click", () => {
      panelOpen = false;
      toggle("ais-main", false);
      settingsOpen = false;
      toggle("ais-settings", false);
    });

    $("ais-cfg-open").addEventListener("click", () => {
      settingsOpen = !settingsOpen;
      if (settingsOpen) {
        // 基于主面板当前位置生成设置窗口
        const mainRect = $("ais-main").getBoundingClientRect();
        const sPanel = $("ais-settings");

        sPanel.style.right = "auto";
        sPanel.style.bottom = "auto";

        let left = mainRect.left;
        let top = mainRect.top;

        sPanel.style.visibility = "hidden";
        sPanel.classList.remove("ais-off");

        const rect = sPanel.getBoundingClientRect();
        const width = rect.width;
        const height = rect.height;

        if (left + width > window.innerWidth) {
          left = window.innerWidth - width - 10;
        }

        if (top + height > window.innerHeight) {
          top = window.innerHeight - height - 20;
        }

        left = Math.max(10, left);
        top = Math.max(10, top);

        sPanel.style.left = left + "px";
        sPanel.style.top = top + "px";

        sPanel.style.visibility = "";
      }
      toggle("ais-settings", settingsOpen);
    });

    $("ais-copy").addEventListener("click", () => {
      if (!fullText) {
        showToast("暂无内容可复制");
        return;
      }
      navigator.clipboard
        .writeText(fullText)
        .then(() => showToast("✓ 已复制到剪贴板", "#16a34a"))
        .catch(() => showToast("复制失败，请手动选择"));
    });

    $("ais-stop").addEventListener("click", () => {
      abortAPI();
      streaming = false;
      setLoading(false);
      if (currentResNode) {
        currentResNode.innerHTML = renderMd(fullText || "已手动停止");
        currentResNode.classList.remove("ais-cursor");
        currentResNode.removeAttribute("id");
      }
      if (chatHistory.length > 0) {
        if (fullText)
          chatHistory.push({ role: "assistant", content: fullText });
        $("ais-run").style.display = "none";
        $("ais-chat-wrap").style.display = "flex";
      } else {
        $("ais-run").style.display = "";
        $("ais-run").textContent = "🔄 重新总结";
      }
    });

    $("ais-run").addEventListener("click", doSummary);
    $("ais-re-run").addEventListener("click", doSummary);
    $("ais-chat-send").addEventListener("click", doFollowUp);
    $("ais-chat-input").addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        doFollowUp();
      }
    });
  }

  function bindSettingsEvents() {
    $("ais-cfg-close").addEventListener("click", () => {
      settingsOpen = false;
      toggle("ais-settings", false);
    });

    $("ais-cfg-save").addEventListener("click", () => {
      const savedUrl = $("f-url").value.trim();
      const savedKey = $("f-key").value.trim();
      const matchedPreset = PRESETS.find((p) => savedUrl === p.url);
      if (matchedPreset && savedKey)
        GM_setValue("apiKey_" + matchedPreset.id, savedKey);

      Cfg.set({
        apiUrl: savedUrl,
        apiKey: savedKey,
        model: $("f-model").value.trim(),
        maxTokens: +$("f-tokens").value || 2000,
        maxContentLength: +$("f-maxlen").value || 8000,
        stream: $("f-stream").classList.contains("on"),
        systemPrompt: $("f-sys").value,
        userPrompt: $("f-prompt").value,
      });
      settingsOpen = false;
      toggle("ais-settings", false);
      showToast("✓ 设置已保存", "#16a34a");
    });

    $("ais-cfg-reset").addEventListener("click", () => {
      if (!confirm("确认恢复所有默认设置？")) return;
      Cfg.reset();
      renderSettings(DEFAULTS);
      showToast("✓ 已恢复默认设置", "#16a34a");
    });

    $("f-stream").addEventListener("click", (e) =>
      e.currentTarget.classList.toggle("on"),
    );
    document.querySelectorAll(".ais-pre").forEach((btn) => {
      btn.addEventListener("click", () => {
        const p = PRESETS.find((x) => x.id === btn.dataset.pid);
        if (p) {
          $("f-url").value = p.url;
          $("f-model").value = p.model;
          $("f-key").value = GM_getValue("apiKey_" + p.id, "");
        }
      });
    });
  }

  /* ================================================
       执行总结 (首次)
    ================================================ */
  function doSummary() {
    if (streaming) return;
    streaming = true;
    fullText = "";
    chatHistory = [];
    $("ais-run").style.display = "";
    $("ais-run").textContent = "✨ 开始总结";
    $("ais-chat-wrap").style.display = "none";
    setLoading(true);
    setBody(
      `<div class="ais-loading"><div class="ais-spinner"></div> 正在提取页面内容...</div>`,
    );

    const content = extractContent();
    const title = document.title;
    const cfg = Cfg.get();
    if (!content || content.length < 50) {
      streaming = false;
      setLoading(false);
      setBody(`<div class="ais-err">❌ 页面内容提取失败或内容过少</div>`);
      $("ais-run").style.display = "";
      return;
    }

    const metaEl = $("ais-meta");
    if (metaEl)
      metaEl.textContent = `📄 ${esc(title)}  ·  提取 ${content.length} 字`;
    const userMsg = cfg.userPrompt
      .replace("{title}", title)
      .replace("{content}", String(content).slice(0, cfg.maxContentLength));
    chatHistory.push({ role: "user", content: userMsg });
    setBody(
      `<div id="ais-current-res" class="ais-res ais-cursor"><div class="ais-loading" style="padding:10px 0;"><div class="ais-spinner"></div> AI 正在分析...</div></div>`,
    );
    currentResNode = $("ais-current-res");

    callAPI(chatHistory, {
      onChunk(full) {
        fullText = full;
        if (currentResNode) {
          currentResNode.innerHTML = renderMd(full);
          const b = $("ais-body");
          if (b) b.scrollTop = b.scrollHeight;
        }
      },
      onDone(full) {
        streaming = false;
        setLoading(false);
        fullText = full;
        if (currentResNode) {
          currentResNode.innerHTML = renderMd(full || "（AI 返回内容为空）");
          currentResNode.classList.remove("ais-cursor");
          currentResNode.removeAttribute("id");
        }
        chatHistory.push({ role: "assistant", content: full });
        $("ais-run").style.display = "none";
        $("ais-chat-wrap").style.display = "flex";
        $("ais-chat-input").focus();
        positionMainPanelBasedOnFab();
      },
      onError(err) {
        streaming = false;
        setLoading(false);
        setBody(`<div class="ais-err">❌ ${esc(err)}</div>`);
        $("ais-run").style.display = "";
        $("ais-run").textContent = "🔄 重新总结";
      },
    });
  }

  /* ================================================
       执行追问 (多轮对话)
    ================================================ */
  function doFollowUp() {
    if (streaming) return;
    const inputEl = $("ais-chat-input");
    const question = inputEl.value.trim();
    if (!question) return;

    inputEl.value = "";
    streaming = true;
    fullText = "";
    setLoading(true);
    const b = $("ais-body");
    b.insertAdjacentHTML(
      "beforeend",
      `<div class="ais-user-msg">👤 ${esc(question)}</div><div id="ais-current-res" class="ais-res ais-cursor">正在思考...</div>`,
    );
    currentResNode = $("ais-current-res");
    b.scrollTop = b.scrollHeight;
    chatHistory.push({ role: "user", content: question });

    callAPI(chatHistory, {
      onChunk(full) {
        fullText = full;
        if (currentResNode) {
          currentResNode.innerHTML = renderMd(full);
          if (b) b.scrollTop = b.scrollHeight;
        }
      },
      onDone(full) {
        streaming = false;
        setLoading(false);
        fullText = full;
        if (currentResNode) {
          currentResNode.innerHTML = renderMd(full || "（AI 返回内容为空）");
          currentResNode.classList.remove("ais-cursor");
          currentResNode.removeAttribute("id");
          if (b) b.scrollTop = b.scrollHeight;
        }
        chatHistory.push({ role: "assistant", content: full });
        $("ais-run").style.display = "none";
        $("ais-chat-wrap").style.display = "flex";
        $("ais-chat-input").focus();
      },
      onError(err) {
        streaming = false;
        setLoading(false);
        if (currentResNode) {
          currentResNode.outerHTML = `<div class="ais-err" style="margin-top:10px;">❌ ${esc(err)}</div>`;
          if (b) b.scrollTop = b.scrollHeight;
        }
        chatHistory.pop();
        inputEl.value = question;
        $("ais-run").style.display = "none";
        $("ais-chat-wrap").style.display = "flex";
      },
    });
  }

  /* ================================================
       初始化
    ================================================ */
  function init() {
    const fab = document.createElement("button");
    fab.id = "ais-fab";
    fab.title = "AI 内容总结";
    fab.textContent = "📍";
    const pos = GM_getValue("fab_position");
    Object.assign(fab.style, { position: "fixed" });

    if (pos) {
      if (pos.xRatio !== undefined && pos.yRatio !== undefined) {
        fab.style.left = pos.xRatio * window.innerWidth + "px";
        fab.style.top = pos.yRatio * window.innerHeight + "px";
      } else {
        fab.style.left = pos.left;
        fab.style.top = pos.top;
        fab.style.right = pos.right;
        fab.style.bottom = pos.bottom;
      }
    } else {
      fab.style.right = "22px";
      fab.style.bottom = "22px";
    }
    document.body.appendChild(fab);

    window.addEventListener("resize", () => {
      const pos = GM_getValue("fab_position");
      if (!pos || pos.xRatio === undefined) return;
      fab.style.transition = "none";
      fab.style.top = pos.yRatio * window.innerHeight + "px";
      if (pos && pos.xRatio !== undefined)
        window.snapSide = pos.xRatio < 0.5 ? "left" : "right";
      if (window.snapSide === "left")
        fab.style.left = -(fab.offsetWidth - 16) + 10 + "px";
      else fab.style.left = window.innerWidth - 24 - 10 + "px";
    });

    setTimeout(() => {
      const rect = fab.getBoundingClientRect();
      fab.style.transition = "none";
      if (rect.left < window.innerWidth / 2)
        fab.style.left = -(fab.offsetWidth - 16) + 10 + "px";
      else fab.style.left = window.innerWidth - 24 - 10 + "px";
    }, 50);

    const mainPanel = createMainPanel();
    const settingsPanel = document.createElement("div");
    settingsPanel.id = "ais-settings";
    settingsPanel.className = "ais-off";
    document.body.appendChild(mainPanel);
    document.body.appendChild(settingsPanel);

    renderSettings(Cfg.get());
    bindMainEvents();
    makeDraggable("ais-main"); // 激活拖动
    makeDraggable("ais-settings"); // 激活设置面板拖动
  }

  GM_registerMenuCommand("🤖 AI 总结当前页面", () => {
    panelOpen = true;
    positionMainPanelBasedOnFab();
    toggle("ais-main", true);
    doSummary();
  });
  GM_registerMenuCommand("⚙️ AI 总结器设置", () => {
    panelOpen = true;
    positionMainPanelBasedOnFab();
    toggle("ais-main", true);
    settingsOpen = true;

    // 确保设置界面也原位置覆盖
    const mainRect = $("ais-main").getBoundingClientRect();
    const sPanel = $("ais-settings");
    sPanel.style.right = "auto";
    sPanel.style.bottom = "auto";
    sPanel.style.left = mainRect.left + "px";
    sPanel.style.top = mainRect.top + "px";

    toggle("ais-settings", true);
  });

  if (document.readyState === "loading")
    document.addEventListener("DOMContentLoaded", init);
  else init();
})();
