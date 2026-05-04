// ==UserScript==
// @name         AI summary
// @namespace    http://tampermonkey.net/
// @version      2.0.1
// @description  One-click extraction of webpage main content, with intelligent summarization via AI APIs; supports OpenAI, Anthropic, Gemini, DeepSeek, and other compatible interfaces.
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
    'use strict';

    /* ================================================
       Default configuration
    ================================================ */
    const DEFAULTS = {
        apiUrl: 'https://api.openai.com/v1/chat/completions',
        apiKey: '',
        model: 'gpt-5.5',
        maxTokens: 2048,
        temperature: 0.7,
        stream: true,
        maxContentLength: 16000,
        systemPrompt: '你是一个专业的网页内容分析助手，擅长提取和总结文章核心内容，回答简洁清晰。',
        userPrompt: `请对以下网页内容进行总结分析：

标题：{title}

正文：
{content}

请按以下格式回答：
📌 **主题**：一句话概括文章主题

🔑 **要点**：
- 要点一
- 要点二
- ……

💡 **总结**：简短结论`,
    };

    /* ================================================
       API presets
    ================================================ */
    const PRESETS = [
       { id: 'openai',    name: 'OpenAI',    url: 'https://api.openai.com/v1/chat/completions',                                               model: 'gpt-5.5' },
       { id: 'anthropic', name: 'Anthropic', url: 'https://api.anthropic.com/v1/messages',                                                    model: 'claude-opus-4.7' },
       { id: 'gemini',    name: 'Gemini',    url: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}',model: 'gemini-3.1-pro-preview' },
       { id: 'xai',       name: 'Xai',       url: 'https://api.x.ai/v1/chat/completions',                                                     model: 'gork-4.3' },
       { id: 'deepseek',  name: 'DeepSeek',  url: 'https://api.deepseek.com/v1/chat/completions',                                             model: 'deepseek-v4-pro' },
       { id: 'openrouter',name: 'Openrouter',url: 'https://openrouter.ai/api/v1/chat/completions',                                            model: 'google/gemini-3.1-pro-preview' },
    ];

    /* ================================================
       Configuration management
    ================================================ */
    const Cfg = {
        get: () => Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, GM_getValue(k, DEFAULTS[k])])),
        set: (obj) => Object.entries(obj).forEach(([k, v]) => GM_setValue(k, v)),
        reset: () => Object.entries(DEFAULTS).forEach(([k, v]) => GM_setValue(k, v)),
    };

    /* ================================================
       Content extraction
    ================================================ */
    function extractContent() {
        // Elements to remove
        const STRIP_SEL = [
            'script','style','noscript','iframe','svg','canvas',
            'nav','header','footer','aside','[role="navigation"]',
            '[class*="navbar"]','[class*="nav-"]','[id*="nav-"]',
            '[class*="sidebar"]','[class*="side-bar"]',
            '[class*="comment"]','[class*="footer"]','[class*="header"]',
            '[class*="banner"]','[class*="advertisement"]',
            '[class*="-ads"]','[class*="ads-"]','[id*="ads"]',
            '[class*="popup"]','[class*="modal"]','[class*="cookie"]',
            '.share','.social','.related','.recommend',
        ];
        // Preferred content selectors
        const CONTENT_SEL = [
            'article','[role="main"]','main',
            '.article-content','.article-body','.post-content',
            '.entry-content','.content-body','.news-content',
            '.detail-content','.story-content',
            '#article','#content','#main-content',
        ];

        try {
            const clone = document.documentElement.cloneNode(true);
            STRIP_SEL.forEach(s => {
                try { clone.querySelectorAll(s).forEach(e => e.remove()); } catch {}
            });

            for (const sel of CONTENT_SEL) {
                const el = clone.querySelector(sel);
                if (el) {
                    const t = (el.innerText || el.textContent || '').trim();
                    if (t.length > 300) return cleanText(t);
                }
            }
            // Fallback to body
            const body = clone.querySelector('body');
            return cleanText(body?.innerText || body?.textContent || document.body.textContent || '');
        } catch {
            return cleanText(document.body.textContent || '');
        }
    }

    function cleanText(t) {
        return t
            .replace(/[ \t]{2,}/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();
    }

/* ================================================
   Multi-provider adapter layer
================================================ */

/* Identify API provider based on URL */
function detectProvider(url) {
    if (url.includes('anthropic.com'))               return 'anthropic';
    if (url.includes('generativelanguage.googleapis')) return 'gemini';
    return 'openai'; // Default OpenAI compatibility format（DeepSeek/xAI/OpenRouter etc.）
}

/* Build request parameters for each provider */
function buildRequest(cfg, userMsg) {
    const provider = detectProvider(cfg.apiUrl);

    // ── Anthropic ──────────────────────────────────────────────────
    if (provider === 'anthropic') {
        return {
            url: cfg.apiUrl,
            headers: {
                'Content-Type':      'application/json',
                'x-api-key':         cfg.apiKey,
                'anthropic-version': '2023-06-01',
            },
            body: JSON.stringify({
                model:      cfg.model,
                max_tokens: +cfg.maxTokens,
                system:     cfg.systemPrompt,
                messages:   [{ role: 'user', content: userMsg }],
                stream:     cfg.stream,
            }),
        };
    }

    // ── Gemini ──────────────────────────────────────────────────────
    if (provider === 'gemini') {
        // URL formwork replace：{model} and {key}
        let url = cfg.apiUrl
            .replace('{model}', cfg.model)
            .replace('{key}',   cfg.apiKey);
        // Switch to streamGenerateContent endpoint when streaming output
        if (cfg.stream) {
            url = url.replace('generateContent', 'streamGenerateContent') + '&alt=sse';
        }
        return {
            url,
            headers: { 'Content-Type': 'application/json' }, // Key is in the URL, no need for header
            body: JSON.stringify({
                contents: [{
                    role:  'user',
                    parts: [{ text: userMsg }],
                }],
                systemInstruction: {
                    parts: [{ text: cfg.systemPrompt }],
                },
                generationConfig: {
                    maxOutputTokens: +cfg.maxTokens,
                    temperature:     +cfg.temperature,
                },
            }),
        };
    }

    // ── OpenAI compatible (DeepSeek / xAI / OpenRouter / Kimi, etc.)─────────
    return {
        url: cfg.apiUrl,
        headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${cfg.apiKey}`,
        },
        body: JSON.stringify({
            model:       cfg.model,
            messages: [
                { role: 'system', content: cfg.systemPrompt },
                { role: 'user',   content: userMsg },
            ],
            max_tokens:  +cfg.maxTokens,
            temperature: +cfg.temperature,
            stream:       cfg.stream,
        }),
    };
}

/* Parse SSE streaming data blocks and return text increments; '[DONE]' means end; null means skip */
function parseStreamChunk(provider, line) {
    if (!line.startsWith('data:')) return null;
    const raw = line.slice(5).trim();
    if (!raw) return null;

    try {
        // ── Anthropic SSE ────────────────────────────────────────────
        if (provider === 'anthropic') {
            const json = JSON.parse(raw);
            if (json.type === 'message_stop')  return '[DONE]';
            if (json.type === 'content_block_delta'
                && json.delta?.type === 'text_delta') {
                return json.delta.text;
            }
            return null;
        }

        // ── Gemini SSE ───────────────────────────────────────────────
        if (provider === 'gemini') {
            const text = JSON.parse(raw).candidates?.[0]?.content?.parts?.[0]?.text;
            return text || null;
        }

        // ── OpenAI SSE ───────────────────────────────────────────────
        if (raw === '[DONE]') return '[DONE]';
        return JSON.parse(raw).choices?.[0]?.delta?.content || null;

    } catch { return null; }
}

/* Parse the complete non-streaming response, or the complete text of the streaming response (for the bottom of the pocket) */
function parseFullResponse(provider, responseText) {
    // Try to parse the text as a stream SSE first (the bottom when onprogress is not triggered)
    if (responseText.includes('data:')) {
        let result = '';
        for (const line of responseText.split('\n')) {
            const delta = parseStreamChunk(provider, line.trim());
            if (delta && delta !== '[DONE]') result += delta;
        }
        if (result) return result;
    }
    // Then try to parse as a standard JSON (non-stream mode)
    try {
        const json = JSON.parse(responseText);
        if (provider === 'anthropic') return json.content?.[0]?.text || '';
        if (provider === 'gemini')    return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return json.choices?.[0]?.message?.content || '';
    } catch { return ''; }
}


/* Parse the error messages of each provider */
function parseErrorMsg(provider, responseText, status) {
    let msg = `HTTP ${status}`;
    try {
        const json = JSON.parse(responseText);
        if (provider === 'anthropic') msg = json.error?.message || msg;
        else if (provider === 'gemini') msg = json.error?.message || msg;
        else msg = json.error?.message || msg;
    } catch {}
    return msg;
}

/* ================================================
   API main function
================================================ */
let _req = null;

function callAPI(content, title, { onChunk, onDone, onError }) {
    const cfg = Cfg.get();
    if (!cfg.apiKey && !cfg.apiUrl.includes('{key}')) {
        onError('未设置 API Key，请点击 ⚙️ 进行配置');
        return;
    }

    const userMsg = cfg.userPrompt
        .replace('{title}',   title)
        .replace('{content}', String(content).slice(0, cfg.maxContentLength));

    const provider = detectProvider(cfg.apiUrl);
    const reqCfg   = buildRequest(cfg, userMsg);

    let buffer = '', fullText = '', finished = false;
    const finish = (text) => { if (!finished) { finished = true; onDone(text); } };

    _req = GM_xmlhttpRequest({
        method:  'POST',
        url:      reqCfg.url,
        headers:  reqCfg.headers,
        data:     reqCfg.body,
        timeout:  90000,

        onprogress: cfg.stream ? (ev) => {
            const newPart = ev.responseText.slice(buffer.length);
            buffer = ev.responseText;
            for (const line of newPart.split('\n')) {
                const delta = parseStreamChunk(provider, line.trim());
                if (delta === '[DONE]') { finish(fullText); return; }
                if (delta) { fullText += delta; onChunk(fullText); }
            }
        } : null,

        onload(res) {
            if (res.status < 200 || res.status >= 300) {
                return onError(parseErrorMsg(provider, res.responseText, res.status));
            }
            if (!cfg.stream) {
                fullText = parseFullResponse(provider, res.responseText);
                onChunk(fullText);
                finish(fullText);
                return;
            }
            // 流式兜底：如果 onprogress 没有触发（某些环境），则从完整响应里解析
            setTimeout(() => {
                if (!fullText) {
                    // onprogress 从未触发，手动从完整响应解析
                    fullText = parseFullResponse(provider, res.responseText);
                    if (fullText) onChunk(fullText);
                }
                finish(fullText);
            }, 0);
        },

        onerror:   () => onError('网络错误，请检查 API 地址与网络连接'),
        ontimeout: () => onError('请求超时（90s），请检查网络或 API 服务状态'),
    });
}

    /* ================================================
       简易 Markdown 渲染
    ================================================ */
    function renderMd(raw) {
        // 先转义 HTML 特殊字符
        const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

        const lines = esc(raw).split('\n');
        let html = '';
        let inUl = false;

        for (const rawLine of lines) {
            // 行内样式
            let line = rawLine
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/`(.+?)`/g, '<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px">$1</code>');

            // 标题
            if (/^#{1,3} /.test(rawLine)) {
                if (inUl) { html += '</ul>'; inUl = false; }
                html += `<h3 style="margin:10px 0 4px;font-size:14px;font-weight:700">${line.replace(/^#+\s*/, '')}</h3>`;
                continue;
            }

            // 列表
            if (/^[-*•] /.test(rawLine)) {
                if (!inUl) { html += '<ul style="padding-left:20px;margin:6px 0">'; inUl = true; }
                html += `<li style="margin:3px 0">${line.replace(/^[-*•]\s*/, '')}</li>`;
                continue;
            }

            if (inUl) { html += '</ul>'; inUl = false; }

            // 空行
            if (!rawLine.trim()) { html += '<br>'; continue; }

            html += `<p style="margin:5px 0">${line}</p>`;
        }
        if (inUl) html += '</ul>';
        return html;
    }

    /* ================================================
       工具函数
    ================================================ */
    const $ = id => document.getElementById(id);
    const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
    const toggle = (id, show) => $(id)?.classList.toggle('ais-off', !show);
    const setBody = html => { const b = $('ais-body'); if (b) b.innerHTML = html; };

    function showToast(msg, color = '#111827') {
        const t = document.createElement('div');
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
            t.style.cssText += ';opacity:0;transition:opacity .3s';
            setTimeout(() => t.remove(), 400);
        }, 2200);
    }

    function setLoading(v) {
        const run = $('ais-run'), stop = $('ais-stop');
        if (run)  run.style.display  = v ? 'none' : '';
        if (stop) stop.style.display = v ? ''     : 'none';
    }

    /* ================================================
       CSS 样式
    ================================================ */
    GM_addStyle(`
        @keyframes ais-spin { to { transform: rotate(360deg); } }
        @keyframes ais-blink { 50% { opacity: 0; } }
        @keyframes ais-ti { from { opacity:0; transform:translateY(8px); } }

        /* 面板隐藏态（带过渡动画） */
        .ais-off {
            opacity: 0 !important;
            pointer-events: none !important;
            transform: translateY(10px) scale(.97) !important;
        }

        /* 悬浮按钮 */
        #ais-fab {
            position: fixed; right: 22px; bottom: 22px; z-index: 2147483641;
            display: flex; align-items: center; justify-content: center;
            width: 52px; height: 52px; border-radius: 50%;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            border: none; cursor: pointer; color: #fff; font-size: 24px;
            box-shadow: 0 4px 18px rgba(99,102,241,.55);
            transition: transform .2s, box-shadow .2s;
            user-select: none;
        }
        #ais-fab:hover { transform: scale(1.12); box-shadow: 0 6px 24px rgba(99,102,241,.7); }
        #ais-fab:active { transform: scale(.95); }

        /* 面板通用样式 */
        #ais-main, #ais-settings {
            position: fixed; right: 22px; bottom: 86px; z-index: 2147483640;
            width: 420px; background: #fff; border-radius: 18px;
            box-shadow: 0 8px 40px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.06);
            display: flex; flex-direction: column; overflow: hidden;
            transition: opacity .22s ease, transform .22s ease;
            font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
            font-size: 14px;
        }

        /* 面板头部 */
        .ais-hd {
            display: flex; align-items: center; gap: 6px; padding: 12px 14px;
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: #fff; flex-shrink: 0;
        }
        .ais-hd-title { flex: 1; font-size: 14px; font-weight: 600; }
        .ais-hbtn {
            background: rgba(255,255,255,.22); border: none; color: #fff;
            border-radius: 7px; padding: 4px 9px; cursor: pointer;
            font-size: 12px; white-space: nowrap; transition: background .15s;
        }
        .ais-hbtn:hover { background: rgba(255,255,255,.38); }

        /* 元信息 */
        .ais-meta {
            padding: 6px 14px; font-size: 11px; color: #9ca3af;
            background: #fafafa; border-bottom: 1px solid #f3f4f6;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0;
        }

        /* 主体滚动区 */
        .ais-body {
            flex: 1; overflow-y: auto; padding: 14px;
            min-height: 160px; max-height: 440px;
        }
        .ais-body::-webkit-scrollbar { width: 4px; }
        .ais-body::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 4px; }

        /* 占位文字 */
        .ais-ph {
            color: #9ca3af; text-align: center; padding: 32px 12px;
            line-height: 1.8; font-size: 13px;
        }

        /* 加载动画 */
        .ais-loading {
            display: flex; align-items: center; justify-content: center;
            gap: 10px; color: #6366f1; padding: 32px; font-size: 13px;
        }
        .ais-spinner {
            width: 20px; height: 20px; border-radius: 50%;
            border: 2px solid #e0e7ff; border-top-color: #6366f1;
            animation: ais-spin .7s linear infinite; flex-shrink: 0;
        }

        /* 结果内容 */
        .ais-res { line-height: 1.8; color: #1f2937; font-size: 13.5px; }
        .ais-cursor::after {
            content: '▊'; color: #6366f1;
            animation: ais-blink .8s step-end infinite;
        }

        /* 错误提示 */
        .ais-err {
            background: #fef2f2; border-left: 3px solid #f87171;
            color: #dc2626; padding: 12px 14px; border-radius: 8px;
            font-size: 13px; line-height: 1.6;
        }

        /* 底部操作栏 */
        .ais-ft {
            display: flex; gap: 8px; padding: 10px 12px;
            border-top: 1px solid #f3f4f6; flex-shrink: 0;
        }
        .ais-btn {
            flex: 1; padding: 8px; border: none; border-radius: 9px;
            font-size: 13px; font-weight: 500; cursor: pointer;
            transition: all .15s;
        }
        .ais-primary {
            background: linear-gradient(135deg, #6366f1, #8b5cf6);
            color: #fff; box-shadow: 0 2px 8px rgba(99,102,241,.3);
        }
        .ais-primary:hover { opacity: .88; transform: translateY(-1px); }
        .ais-secondary { background: #f3f4f6; color: #374151; }
        .ais-secondary:hover { background: #e5e7eb; }
        .ais-danger { background: #fee2e2; color: #dc2626; }
        .ais-danger:hover { background: #fecaca; }

        /* ====== 设置面板 ====== */
        #ais-settings { max-height: 580px; }
        .ais-cfg-body { padding: 14px 16px; overflow-y: auto; flex: 1; }
        .ais-cfg-body::-webkit-scrollbar { width: 4px; }
        .ais-cfg-body::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 4px; }

        .ais-field { margin-bottom: 11px; }
        .ais-lbl {
            display: block; font-size: 11px; font-weight: 600; color: #6b7280;
            text-transform: uppercase; letter-spacing: .4px; margin-bottom: 4px;
        }
        .ais-inp, .ais-ta {
            width: 100%; padding: 8px 10px; border: 1.5px solid #e5e7eb;
            border-radius: 8px; font-size: 13px; color: #111; background: #fafafa;
            outline: none; transition: border-color .15s; box-sizing: border-box;
        }
        .ais-inp:focus, .ais-ta:focus { border-color: #6366f1; background: #fff; }
        .ais-ta { resize: vertical; min-height: 75px; }

        /* 预设按钮 */
        .ais-presets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
        .ais-pre {
            padding: 4px 11px; border: 1.5px solid #e0e7ff; background: #eef2ff;
            color: #4f46e5; border-radius: 20px; cursor: pointer;
            font-size: 12px; font-weight: 500; transition: all .15s;
        }
        .ais-pre:hover { background: #6366f1; color: #fff; border-color: #6366f1; }

        /* 开关 */
        .ais-row { display: flex; align-items: center; justify-content: space-between; }
        .ais-sw {
            position: relative; width: 40px; height: 22px; background: #d1d5db;
            border-radius: 11px; border: none; cursor: pointer; transition: background .2s;
            flex-shrink: 0;
        }
        .ais-sw.on { background: #6366f1; }
        .ais-sw::after {
            content: ''; position: absolute; width: 18px; height: 18px;
            background: #fff; border-radius: 50%; top: 2px; left: 2px;
            box-shadow: 0 1px 3px rgba(0,0,0,.25); transition: left .2s;
        }
        .ais-sw.on::after { left: 20px; }
    `);

    /* ================================================
       状态变量
    ================================================ */
    let panelOpen = false;
    let settingsOpen = false;
    let streaming = false;
    let fullText = '';

    /* ================================================
       构建主面板 HTML
    ================================================ */
    function abortAPI() {
    if (_req) { _req.abort(); _req = null; }
    }

    function createMainPanel() {
        const panel = document.createElement('div');
        panel.id = 'ais-main';
        panel.className = 'ais-off';
        panel.innerHTML = `
            <div class="ais-hd">
                <span class="ais-hd-title">🤖 AI 内容总结</span>
                <button class="ais-hbtn" id="ais-copy">📋 复制</button>
                <button class="ais-hbtn" id="ais-cfg-open">⚙️ 设置</button>
                <button class="ais-hbtn" id="ais-main-close">✕</button>
            </div>
            <div class="ais-meta" id="ais-meta">${esc(document.title)}</div>
            <div class="ais-body" id="ais-body">
                <div class="ais-ph">
                    点击下方「开始总结」按钮<br>AI 将自动提取并分析当前页面内容 📖
                </div>
            </div>
            <div class="ais-ft">
                <button class="ais-btn ais-danger" id="ais-stop" style="display:none">⏹ 停止</button>
                <button class="ais-btn ais-primary" id="ais-run">✨ 开始总结</button>
            </div>
        `;
        return panel;
    }

    /* ================================================
       构建设置面板 HTML
    ================================================ */
    function renderSettings(cfg) {
        let s = $('ais-settings');
        if (!s) {
            s = document.createElement('div');
            s.id = 'ais-settings';
            s.className = 'ais-off';
            document.body.appendChild(s);
        }
        s.innerHTML = `
            <div class="ais-hd">
                <span class="ais-hd-title">⚙️ API 设置</span>
                <button class="ais-hbtn" id="ais-cfg-close">✕</button>
            </div>
            <div class="ais-cfg-body">
                <div class="ais-presets">
                    ${PRESETS.map(p => `<button class="ais-pre" data-pid="${p.id}">${p.name}</button>`).join('')}
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
                    <div class="ais-row">
                        <label class="ais-lbl" style="margin:0">流式输出（Stream）</label>
                        <button class="ais-sw ${cfg.stream ? 'on' : ''}" id="f-stream"></button>
                    </div>
                </div>
                <div class="ais-field">
                    <label class="ais-lbl">系统提示词（System Prompt）</label>
                    <textarea class="ais-ta" id="f-sys">${esc(cfg.systemPrompt)}</textarea>
                </div>
                <div class="ais-field">
                    <label class="ais-lbl">用户提示词（变量：{title} {content}）</label>
                    <textarea class="ais-ta" id="f-prompt" style="min-height:140px">${esc(cfg.userPrompt)}</textarea>
                </div>
            </div>
            <div class="ais-ft">
                <button class="ais-btn ais-secondary" id="ais-cfg-reset">↩ 恢复默认</button>
                <button class="ais-btn ais-primary"   id="ais-cfg-save">💾 保存设置</button>
            </div>
        `;
        bindSettingsEvents();
    }

    /* ================================================
       事件绑定
    ================================================ */
    function bindMainEvents() {
        // 悬浮按钮
        $('ais-fab').addEventListener('click', () => {
            panelOpen = !panelOpen;
            toggle('ais-main', panelOpen);
            if (!panelOpen) { settingsOpen = false; toggle('ais-settings', false); }
        });

        // 关闭主面板
        $('ais-main-close').addEventListener('click', () => {
            panelOpen = false;    toggle('ais-main', false);
            settingsOpen = false; toggle('ais-settings', false);
        });

        // 打开/关闭设置
        $('ais-cfg-open').addEventListener('click', () => {
            settingsOpen = !settingsOpen;
            toggle('ais-settings', settingsOpen);
        });

        // 复制
        $('ais-copy').addEventListener('click', () => {
            if (!fullText) { showToast('暂无内容可复制'); return; }
            navigator.clipboard.writeText(fullText)
                .then(() => showToast('✓ 已复制到剪贴板', '#16a34a'))
                .catch(() => showToast('复制失败，请手动选择'));
        });

        // 停止
        $('ais-stop').addEventListener('click', () => {
            abortAPI();
            streaming = false;
            setLoading(false);
            if (fullText) {
                setBody(`<div class="ais-res">${renderMd(fullText)}</div>
                    <p style="color:#9ca3af;font-size:11px;margin:8px 0 0">⚠️ 已手动停止</p>`);
            } else {
                setBody(`<div class="ais-ph">已停止</div>`);
            }
        });

        // 开始总结
        $('ais-run').addEventListener('click', doSummary);
    }

    function bindSettingsEvents() {
        $('ais-cfg-close').addEventListener('click', () => {
            settingsOpen = false; toggle('ais-settings', false);
        });

        $('ais-cfg-save').addEventListener('click', () => {
            const savedUrl = $('f-url').value.trim();
            const savedKey = $('f-key').value.trim();
            // 找到当前 URL 对应的预设，把 Key 单独存一份
            const matchedPreset = PRESETS.find(p => savedUrl === p.url);
            if (matchedPreset && savedKey) {
                GM_setValue('apiKey_' + matchedPreset.id, savedKey);
            }
            Cfg.set({
                apiUrl:           savedUrl,
                apiKey:           savedKey,
                model:            $('f-model').value.trim(),
                maxTokens:        +$('f-tokens').value || 2000,
                maxContentLength: +$('f-maxlen').value || 8000,
                stream:           $('f-stream').classList.contains('on'),
                systemPrompt:     $('f-sys').value,
                userPrompt:       $('f-prompt').value,
            });
            settingsOpen = false; toggle('ais-settings', false);
            showToast('✓ 设置已保存', '#16a34a');
        });

        $('ais-cfg-reset').addEventListener('click', () => {
            if (!confirm('确认恢复所有默认设置？')) return;
            Cfg.reset();
            renderSettings(DEFAULTS);
            showToast('✓ 已恢复默认设置', '#16a34a');
        });

        $('f-stream').addEventListener('click', e => e.currentTarget.classList.toggle('on'));

        document.querySelectorAll('.ais-pre').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = PRESETS.find(x => x.id === btn.dataset.pid);
                if (p) {
                    $('f-url').value   = p.url;
                    $('f-model').value = p.model;
                    // 读取该服务商单独保存的 Key，没有则清空让用户填写
                    $('f-key').value   = GM_getValue('apiKey_' + p.id, '');
                }
            });
        });
    }

    /* ================================================
       核心：执行总结
    ================================================ */
    function doSummary() {
        if (streaming) return;
        streaming = true;
        fullText = '';
        $('ais-run').textContent = '✨ 开始总结';

        setLoading(true);
        setBody(`<div class="ais-loading"><div class="ais-spinner"></div> 正在提取页面内容...</div>`);

        const content = extractContent();
        const title   = document.title;

        if (!content || content.length < 50) {
            streaming = false;
            setLoading(false);
            setBody(`<div class="ais-err">❌ 页面内容提取失败或内容过少，请在有文章内容的页面使用</div>`);
            return;
        }

        // 更新元信息栏：显示字数
        const metaEl = $('ais-meta');
        if (metaEl) metaEl.textContent = `📄 ${esc(document.title)}  ·  提取 ${content.length} 字`;

        setBody(`<div class="ais-loading"><div class="ais-spinner"></div> AI 正在分析，请稍候...</div>`);

        callAPI(content, title, {
            onChunk(full) {
                fullText = full;
                const b = $('ais-body');
                if (b) {
                    b.innerHTML = `<div class="ais-res ais-cursor">${renderMd(full)}</div>`;
                    b.scrollTop = b.scrollHeight;
                }
            },
            onDone(full) {
                streaming = false;
                setLoading(false);
                fullText = full;
                const b = $('ais-body');
                if (b) b.innerHTML = `<div class="ais-res">${renderMd(full || '（AI 返回内容为空）')}</div>`;
                $('ais-run').textContent = '🔄 重新总结';
            },
            onError(err) {
                streaming = false;
                setLoading(false);
                setBody(`<div class="ais-err">❌ ${esc(err)}</div>`);
            },
        });
    }

    /* ================================================
       初始化
    ================================================ */
    function init() {
        // 悬浮按钮
        const fab = document.createElement('button');
        fab.id = 'ais-fab';
        fab.title = 'AI 内容总结';
        fab.textContent = '📍';

        // 主面板
        const mainPanel = createMainPanel();

        // 设置面板（占位，内容由 renderSettings 填充）
        const settingsPanel = document.createElement('div');
        settingsPanel.id = 'ais-settings';
        settingsPanel.className = 'ais-off';

        document.body.appendChild(fab);
        document.body.appendChild(mainPanel);
        document.body.appendChild(settingsPanel);

        renderSettings(Cfg.get());
        bindMainEvents();
    }

    /* ================================================
       油猴菜单命令
    ================================================ */
    GM_registerMenuCommand('🤖 AI 总结当前页面', () => {
        panelOpen = true; toggle('ais-main', true);
        doSummary();
    });
    GM_registerMenuCommand('⚙️ AI 总结器设置', () => {
        panelOpen = true; toggle('ais-main', true);
        settingsOpen = true; toggle('ais-settings', true);
    });

    /* ================================================
       启动
    ================================================ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
