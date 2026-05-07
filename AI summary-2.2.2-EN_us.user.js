// ==UserScript==
// @name         AI summary
// @namespace    http://tampermonkey.net/
// @version      2.2.2
// @description  One-click capture of webpage content, intelligent summary via AI API; supports OpenAI/Anthropic/Gemini/DeepSeek and other compatible interfaces
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
       Default Configuration
    ================================================ */
    const DEFAULTS = {
        apiUrl: 'https://openrouter.ai/api/v1/chat/completions',
        apiKey: '',
        model: 'google/gemini-3.1-pro-preview',
        maxTokens: 2048,
        temperature: 0.7,
        stream: true,
        maxContentLength: 16000,
        systemPrompt: 'You are a professional web content analysis assistant, skilled at extracting and summarizing the core content of articles, providing concise and clear answers.',
        userPrompt: `Please provide a summary and analysis of the following webpage content:

Title: {title}

Content:
{content}

Please respond in the following format:
📌 **Theme**: One sentence summarizing the article theme

🔑 **Key Points**:
- Point one
- Point two
- Point three

💡 **Summary**: Brief conclusion`,
    };

    /* ================================================
       API Presets
    ================================================ */
    const PRESETS = [
       { id: 'openai',    name: 'OpenAI',    url: 'https://api.openai.com/v1/chat/completions',                                             model: 'gpt-5.5' },
       { id: 'anthropic', name: 'Anthropic', url: 'https://api.anthropic.com/v1/messages',                                                    model: 'claude-opus-4.7' },
       { id: 'gemini',    name: 'Gemini',    url: 'https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={key}',model: 'gemini-3.1-pro-preview' },
       { id: 'xai',       name: 'Xai',       url: 'https://api.x.ai/v1/chat/completions',                                                    model: 'gork-4.3' },
       { id: 'deepseek',  name: 'DeepSeek',  url: 'https://api.deepseek.com/v1/chat/completions',                                             model: 'deepseek-v4-pro' },
       { id: 'openrouter',name: 'Openrouter',url: 'https://openrouter.ai/api/v1/chat/completions',                                             model: 'google/gemini-3.1-pro-preview' },
    ];

    /* ================================================
       Configuration Management
    ================================================ */
    const Cfg = {
        get: () => Object.fromEntries(Object.keys(DEFAULTS).map(k => [k, GM_getValue(k, DEFAULTS[k])])),
        set: (obj) => Object.entries(obj).forEach(([k, v]) => GM_setValue(k, v)),
        reset: () => Object.entries(DEFAULTS).forEach(([k, v]) => GM_setValue(k, v)),
    };

/* ================================================
       Content Extraction
    ================================================ */
    function extractContent() {
        // Useless elements that need to be removed
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
        // Content selectors to try first
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
    Multi-provider Adaptation Layer
================================================ */

/** Identify API provider based on URL */
function detectProvider(url) {
    if (url.includes('anthropic.com'))return 'anthropic';
    if (url.includes('generativelanguage.googleapis')) return 'gemini';
    return 'openai'; // Default OpenAI compatible format (applicable to DeepSeek/xAI/OpenRouter etc.)
}

/** Build request parameters for each provider */
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
        // URL template replacement: {model} and {key}
        let url = cfg.apiUrl
            .replace('{model}', cfg.model)
            .replace('{key}',cfg.apiKey);
        // Switch to streamGenerateContent endpoint for streaming output
        if (cfg.stream) {
            url = url.replace('generateContent', 'streamGenerateContent') + '&alt=sse';
        }
        return {
            url,
            headers: { 'Content-Type': 'application/json' }, // key is in URL, no header needed
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

    // ── OpenAI Compatible (DeepSeek / xAI / OpenRouter / Kimi etc.) ─────────
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
                { role: 'user', content: userMsg },
            ],
            max_tokens:  +cfg.maxTokens,
            temperature: +cfg.temperature,
            stream:       cfg.stream,
        }),
    };
}

/** Parse SSE streaming data chunks, return text increment; '[DONE]' indicates completion; null means skip */
function parseStreamChunk(provider, line) {
    if (!line.startsWith('data:')) return null;
    const raw = line.slice(5).trim();
    if (!raw) return null;

    try {
        // ── Anthropic SSE ────────────────────────────────────────────
        if (provider === 'anthropic') {
            const json = JSON.parse(raw);
            if (json.type === 'message_stop') return '[DONE]';
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

/** Parse non-streaming full response, or the full text of a streaming response (fallback use) */
function parseFullResponse(provider, responseText) {
    // First try parsing as streaming SSE text (fallback when onprogress is not triggered)
    if (responseText.includes('data:')) {
        let result = '';
        for (const line of responseText.split('\n')) {
            const delta = parseStreamChunk(provider, line.trim());
            if (delta && delta !== '[DONE]') result += delta;
        }
        if (result) return result;
    }
    // Then try parsing as standard JSON (non-streaming mode)
    try {
        const json = JSON.parse(responseText);
        if (provider === 'anthropic') return json.content?.[0]?.text || '';
        if (provider === 'gemini') return json.candidates?.[0]?.content?.parts?.[0]?.text || '';
        return json.choices?.[0]?.message?.content || '';
    } catch { return ''; }
}


/** Parse error messages from each provider */
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
    API Calling Main Function
================================================ */
let _req = null;

function callAPI(content, title, { onChunk, onDone, onError }) {
    const cfg = Cfg.get();
    if (!cfg.apiKey && !cfg.apiUrl.includes('{key}')) {
        onError('API Key not set, please click ⚙️ to configure');
        return;
    }

    const userMsg = cfg.userPrompt
        .replace('{title}', title)
        .replace('{content}', String(content).slice(0, cfg.maxContentLength));

    const provider = detectProvider(cfg.apiUrl);
    const reqCfg = buildRequest(cfg, userMsg);

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
            // Streaming fallback: If onprogress did not trigger (certain environments), parse from full response
            setTimeout(() => {
                if (!fullText) {
                    // onprogress never triggered, manually parse from full response
                    fullText = parseFullResponse(provider, res.responseText);
                    if (fullText) onChunk(fullText);
                }
                finish(fullText);
            }, 0);
        },

        onerror:   () => onError('Network error, please check API address and network connection'),
        ontimeout: () => onError('Request timeout (90s), please check network or API service status'),
    });
}

/* ================================================
        Simple Markdown Rendering
    ================================================ */
    function renderMd(raw) {
        // Escape HTML special characters first
        const esc = s => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

        const lines = esc(raw).split('\n');
        let html = '';
        let inUl = false;

        for (const rawLine of lines) {
            // Inline styles
            let line = rawLine
                .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
                .replace(/\*(.+?)\*/g, '<em>$1</em>')
                .replace(/`(.+?)`/g, '<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px">$1</code>');

            // Headers
            if (/^#{1,3} /.test(rawLine)) {
                if (inUl) { html += '</ul>'; inUl = false; }
                html += `<h3 style="margin:10px 0 4px;font-size:14px;font-weight:700">${line.replace(/^#+\s*/, '')}</h3>`;
                continue;
            }

            // Lists
            if (/^[-*•] /.test(rawLine)) {
                if (!inUl) { html += '<ul style="padding-left:20px;margin:6px 0">'; inUl = true; }
                html += `<li style="margin:3px 0">${line.replace(/^[-*•]\s*/, '')}</li>`;
                continue;
            }

            if (inUl) { html += '</ul>'; inUl = false; }

            // Empty lines
            if (!rawLine.trim()) { html += '<br>'; continue; }

            html += `<p style="margin:5px 0">${line}</p>`;
        }
        if (inUl) html += '</ul>';
        return html;
    }

    /* ================================================
        Utility Functions
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
        if (run) run.style.display = v ? 'none' : '';
        if (stop) stop.style.display = v ? '' : 'none';
    }

/* ================================================
        CSS Styles
    ================================================ */
    GM_addStyle(`
        @keyframes ais-spin { to { transform: rotate(360deg); } }
        @keyframes ais-blink { 50% { opacity: 0; } }
        @keyframes ais-ti { from { opacity:0; transform:translateY(8px); } }

        /* Panel hidden state (with transition animation) */
        .ais-off {
            opacity: 0 !important;
            pointer-events: none !important;
            transform: translateY(10px) scale(.97) !important;
        }

        /* Floating Button */
        #ais-fab {
            position: fixed; right: 22px; bottom: 22px; z-index: 2147483641;
            display: flex; align-items: center; justify-content: center;
            width: 35px; height: 35px; border-radius: 50%;
            background: linear-gradient(135deg, #F8F8F8, #F8F8F8);
            border: none; cursor: pointer; color: #fff; font-size: 24px;
            box-shadow: 1 4px 18px rgba(125,125,125,.6);
            transition: transform .2s, box-shadow .2s;
            user-select: none;
        }
        #ais-fab:hover { transform: scale(1.12); box-shadow: 0 6px 24px rgba(150,150,150,.5); }
        #ais-fab:active { transform: scale(.95); }

        /* Panel general styles */
        #ais-main, #ais-settings {
            position: fixed; right: 22px; bottom: 86px; z-index: 2147483640;
            width: 420px; background: #fff; border-radius: 18px;
            box-shadow: 0 8px 40px rgba(0,0,0,.18), 0 0 0 1px rgba(0,0,0,.06);
            display: flex; flex-direction: column; overflow: hidden;
            transition: opacity .22s ease, transform .22s ease;
            font-family: system-ui, -apple-system, 'Segoe UI', sans-serif;
            font-size: 14px;
        }

        /* Panel Header */
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

        /* Meta info */
        .ais-meta {
            padding: 6px 14px; font-size: 11px; color: #9ca3af;
            background: #fafafa; border-bottom: 1px solid #f3f4f6;
            white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex-shrink: 0;
        }

        /* Main scroll area */
        .ais-body {
            flex: 1; overflow-y: auto; padding: 14px;
            min-height: 160px; max-height: 440px;
        }
        .ais-body::-webkit-scrollbar { width: 4px; }
        .ais-body::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 4px; }

        /* Placeholder text */
        .ais-ph {
            color: #9ca3af; text-align: center; padding: 32px 12px;
            line-height: 1.8; font-size: 13px;
        }

        /* Loading animation */
        .ais-loading {
            display: flex; align-items: center; justify-content: center;
            gap: 10px; color: #6366f1; padding: 32px; font-size: 13px;
        }
        .ais-spinner {
            width: 20px; height: 20px; border-radius: 50%;
            border: 2px solid #e0e7ff; border-top-color: #6366f1;
            animation: ais-spin .7s linear infinite; flex-shrink: 0;
        }

        /* Result content */
        .ais-res { line-height: 1.8; color: #1f2937; font-size: 13.5px; }
        .ais-cursor::after {
            content: '▊'; color: #6366f1;
            animation: ais-blink .8s step-end infinite;
        }

        /* Error prompt */
        .ais-err {
            background: #fef2f2; border-left: 3px solid #f87171;
            color: #dc2626; padding: 12px 14px; border-radius: 8px;
            font-size: 13px; line-height: 1.6;
        }

        /* Bottom action bar */
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

        /* ====== Settings Panel ====== */
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

        /* Preset buttons */
        .ais-presets { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
        .ais-pre {
            padding: 4px 11px; border: 1.5px solid #e0e7ff; background: #eef2ff;
            color: #4f46e5; border-radius: 20px; cursor: pointer;
            font-size: 12px; font-weight: 500; transition: all .15s;
        }
        .ais-pre:hover { background: #6366f1; color: #fff; border-color: #6366f1; }

        /* Switch */
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
       State Variables
    ================================================ */
    let panelOpen = false;
    let settingsOpen = false;
    let streaming = false;
    let fullText = '';

    /* ================================================
       Build Main Panel HTML
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
                <span class="ais-hd-title">🤖 AI Content Summary</span>
                <button class="ais-hbtn" id="ais-copy">📋 Copy</button>
                <button class="ais-hbtn" id="ais-cfg-open">⚙️ Settings</button>
                <button class="ais-hbtn" id="ais-main-close">✕</button>
            </div>
            <div class="ais-meta" id="ais-meta">${esc(document.title)}</div>
            <div class="ais-body" id="ais-body">
                <div class="ais-ph">
                    Click the "Start Summary" button below<br>AI will automatically extract and analyze current page content 📖
                </div>
            </div>
            <div class="ais-ft">
                <button class="ais-btn ais-danger" id="ais-stop" style="display:none">⏹ Stop</button>
                <button class="ais-btn ais-primary" id="ais-run">✨ Start Summary</button>
            </div>
        `;
        return panel;
    }

    /* ================================================
       Build Settings Panel HTML
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
                <span class="ais-hd-title">⚙️ API Settings</span>
                <button class="ais-hbtn" id="ais-cfg-close">✕</button>
            </div>
            <div class="ais-cfg-body">
                <div class="ais-presets">
                    ${PRESETS.map(p => `<button class="ais-pre" data-pid="${p.id}">${p.name}</button>`).join('')}
                </div>
                <div class="ais-field">
                    <label class="ais-lbl">API Address</label>
                    <input class="ais-inp" id="f-url" value="${esc(cfg.apiUrl)}" placeholder="https://api.openai.com/v1/chat/completions">
                </div>
                <div class="ais-field">
                    <label class="ais-lbl">API Key</label>
                    <input class="ais-inp" id="f-key" type="password" value="${esc(cfg.apiKey)}" placeholder="sk-...">
                </div>
                <div class="ais-field">
                    <label class="ais-lbl">Model Name</label>
                    <input class="ais-inp" id="f-model" value="${esc(cfg.model)}" placeholder="gpt-3.5-turbo">
                </div>
                <div class="ais-field">
                    <label class="ais-lbl">Max Output Tokens</label>
                    <input class="ais-inp" id="f-tokens" type="number" value="${cfg.maxTokens}" min="100" max="8000">
                </div>
                <div class="ais-field">
                    <label class="ais-lbl">Max Content Length (Truncated if exceeded)</label>
                    <input class="ais-inp" id="f-maxlen" type="number" value="${cfg.maxContentLength}" min="1000" max="50000">
                </div>
                <div class="ais-field">
                    <div class="ais-row">
                        <label class="ais-lbl" style="margin:0">Stream Output</label>
                        <button class="ais-sw ${cfg.stream ? 'on' : ''}" id="f-stream"></button>
                    </div>
                </div>
                <div class="ais-field">
                    <label class="ais-lbl">System Prompt</label>
                    <textarea class="ais-ta" id="f-sys">${esc(cfg.systemPrompt)}</textarea>
                </div>
                <div class="ais-field">
                    <label class="ais-lbl">User Prompt (Variables: {title} {content})</label>
                    <textarea class="ais-ta" id="f-prompt" style="min-height:140px">${esc(cfg.userPrompt)}</textarea>
                </div>
            </div>
            <div class="ais-ft">
                <button class="ais-btn ais-secondary" id="ais-cfg-reset">↩ Restore Defaults</button>
                <button class="ais-btn ais-primary"   id="ais-cfg-save">💾 Save Settings</button>
            </div>
        `;
        bindSettingsEvents();
    }

    /* ================================================
       Event bindings
    ================================================ */
function bindMainEvents() {
        const PEEK_VISIBLE = 24; // Width remaining visible (px)
        const fab = document.getElementById('ais-fab');
        const PEEK_RIGHT = 24; // Right side exposure (maintaining current)
        const PEEK_LEFT = 16; // Less left side exposure → hidden deeper

        let isDragging = false;
        let hasMoved = false;
        window.snapSide = 'right';
        let offset = { x: 0, y: 0 };
        let startPos = { x: 0, y: 0 };

        const DRAG_THRESHOLD = 8;

        // Mouse Down
        fab.addEventListener('mousedown', (e) => {
            isDragging = true;
            hasMoved = false;

            const rect = fab.getBoundingClientRect();
            offset.x = e.clientX - rect.left;
            offset.y = e.clientY - rect.top;

            startPos.x = e.clientX;
            startPos.y = e.clientY;

            fab.style.transition = 'none';
        });

        // Mouse Move
        document.addEventListener('mousemove', (e) => {
            if (!isDragging) return;

            const dx = e.clientX - startPos.x;
            const dy = e.clientY - startPos.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            // Just started dragging: compensate with animation (avoid teleporting)
            if (!hasMoved && distance > DRAG_THRESHOLD) {
                hasMoved = true;

                fab.style.transition = 'all 0.12s ease-out'; // Small tween animation

                const left = e.clientX - offset.x;
                const top = e.clientY - offset.y;

                fab.style.left = left + 'px';
                fab.style.top = top + 'px';

                return;
            }

            if (!hasMoved) return;

            fab.style.transition = 'none'; // Disable animation during dragging

            let left = e.clientX - offset.x;
            let top = e.clientY - offset.y;

            const padding = 10;
            left = Math.max(padding, Math.min(window.innerWidth - fab.offsetWidth - padding, left));
            top = Math.max(padding, Math.min(window.innerHeight - fab.offsetHeight - padding, top));

            fab.style.left = left + 'px';
            fab.style.top = top + 'px';
            fab.style.right = 'auto';
            fab.style.bottom = 'auto';
        });

        // Mouse Up
        document.addEventListener('mouseup', () => {
            if (!isDragging) return;

            isDragging = false;

            if (!hasMoved) return;

            // Edge snapping + elastic animation
            const rect = fab.getBoundingClientRect();
            const screenWidth = window.innerWidth;

            const middle = screenWidth / 2;
            const isLeft = rect.left < middle;

            const padding = 10;
            const targetLeft = isLeft
            ? -(fab.offsetWidth - PEEK_LEFT) + padding
            : screenWidth - PEEK_RIGHT - padding;

            // Elastic animation (Key)
            fab.style.transition = 'all 0.35s cubic-bezier(0.25, 1.4, 0.4, 1)';

            fab.style.left = targetLeft + 'px';
            fab.style.top = rect.top + 'px';

            // Save position
            const pos = {
                xRatio: rect.left / window.innerWidth,
                yRatio: rect.top / window.innerHeight
            };

            GM_setValue('fab_position', pos);
            window.snapSide = isLeft ? 'left' : 'right';
        });

        fab.addEventListener('mouseenter', () => {
            const rect = fab.getBoundingClientRect();
            const screenWidth = window.innerWidth;

            const padding = 10;
            const EXPAND_FACTOR = 1.5;
            const expandOffset = padding * EXPAND_FACTOR;

            fab.style.transition = 'all 0.25s ease-out';

            if (rect.left < screenWidth / 2) {
                fab.style.left = expandOffset + 'px';
            } else {
                fab.style.left = (screenWidth - fab.offsetWidth - expandOffset) + 'px';
            }
        });

        fab.addEventListener('mouseleave', () => {
            if (isDragging) return;

            const rect = fab.getBoundingClientRect();
            const screenWidth = window.innerWidth;

            const padding = 10;

            fab.style.transition = 'all 0.3s cubic-bezier(0.25, 1.4, 0.4, 1)';

            if (rect.left < screenWidth / 2) {
                fab.style.left = -(fab.offsetWidth - PEEK_LEFT) + padding + 'px';
            } else {
                fab.style.left = (screenWidth - PEEK_RIGHT - padding) + 'px';
            }
        });

        // Click
        fab.addEventListener('click', (e) => {
            if (hasMoved) {
                e.preventDefault();
                e.stopPropagation();
                return;
            }

            panelOpen = !panelOpen;
            toggle('ais-main', panelOpen);

            if (!panelOpen) {
                settingsOpen = false;
                toggle('ais-settings', false);
            }
        });

        // Close Main Panel
        $('ais-main-close').addEventListener('click', () => {
            panelOpen = false; toggle('ais-main', false);
            settingsOpen = false; toggle('ais-settings', false);
        });

        // Open/Close Settings
        $('ais-cfg-open').addEventListener('click', () => {
            settingsOpen = !settingsOpen;
            toggle('ais-settings', settingsOpen);
        });

        // Copy
        $('ais-copy').addEventListener('click', () => {
            if (!fullText) { showToast('No content to copy'); return; }
            navigator.clipboard.writeText(fullText)
                .then(() => showToast('✓ Copied to clipboard', '#16a34a'))
                .catch(() => showToast('Copy failed, please select manually'));
        });

        // Stop
        $('ais-stop').addEventListener('click', () => {
            abortAPI();
            streaming = false;
            setLoading(false);
            if (fullText) {
                setBody(`<div class="ais-res">${renderMd(fullText)}</div>
                    <p style="color:#9ca3af;font-size:11px;margin:8px 0 0">⚠️ Manually stopped</p>`);
            } else {
                setBody(`<div class="ais-ph">Stopped</div>`);
            }
        });

        // Start Summary
        $('ais-run').addEventListener('click', doSummary);
    }

    function bindSettingsEvents() {
        $('ais-cfg-close').addEventListener('click', () => {
            settingsOpen = false; toggle('ais-settings', false);
        });

        $('ais-cfg-save').addEventListener('click', () => {
            const savedUrl = $('f-url').value.trim();
            const savedKey = $('f-key').value.trim();

            // Find the preset corresponding to the current URL and store the Key separately
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

            settingsOpen = false;
            toggle('ais-settings', false);
            showToast('✓ Settings saved', '#16a34a');
        });

        $('ais-cfg-reset').addEventListener('click', () => {
            if (!confirm('Are you sure you want to restore all default settings?')) return;
            Cfg.reset();
            renderSettings(DEFAULTS);
            showToast('✓ Defaults restored', '#16a34a');
        });

        $('f-stream').addEventListener('click', e => e.currentTarget.classList.toggle('on'));

        document.querySelectorAll('.ais-pre').forEach(btn => {
            btn.addEventListener('click', () => {
                const p = PRESETS.find(x => x.id === btn.dataset.pid);
                if (p) {
                    $('f-url').value = p.url;
                    $('f-model').value = p.model;
                    // Read the Key saved specifically for this provider; if none, clear for user input
                    $('f-key').value = GM_getValue('apiKey_' + p.id, '');
                }
            });
        });
    }
/* ================================================
       Core: Execute Summary
    ================================================ */
    function doSummary() {
        if (streaming) return;
        streaming = true;
        fullText = '';
        $('ais-run').textContent = '✨ Start Summary';

        setLoading(true);
        setBody(`<div class="ais-loading"><div class="ais-spinner"></div> Extracting page content...</div>`);

        const content = extractContent();
        const title = document.title;

        if (!content || content.length < 50) {
            streaming = false;
            setLoading(false);
            setBody(`<div class="ais-err">❌ Page content extraction failed or content is too short. Please use on a page with article content.</div>`);
            return;
        }

        // Update meta info bar: display character count
        const metaEl = $('ais-meta');
        if (metaEl) metaEl.textContent = `📄 ${esc(document.title)}  ·  Extracted ${content.length} chars`;

        setBody(`<div class="ais-loading"><div class="ais-spinner"></div> AI is analyzing, please wait...</div>`);

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
                if (b) b.innerHTML = `<div class="ais-res">${renderMd(full || '(AI returned empty content)')}</div>`;
                $('ais-run').textContent = '🔄 Re-summarize';
            },
            onError(err) {
                streaming = false;
                setLoading(false);
                setBody(`<div class="ais-err">❌ ${esc(err)}</div>`);
            },
        });
    }

/* ================================================
       Initialization
    ================================================ */
    function init() {
        const fab = document.createElement('button');
        fab.id = 'ais-fab';
        fab.title = 'AI Content Summary';
        fab.textContent = '📍';

        const pos = GM_getValue('fab_position');

        Object.assign(fab.style, {
            position: 'fixed'
        });

        if (pos) {
            if (pos.xRatio !== undefined && pos.yRatio !== undefined) {
                fab.style.left = (pos.xRatio * window.innerWidth) + 'px';
                fab.style.top = (pos.yRatio * window.innerHeight) + 'px';
            } else {
                fab.style.left = pos.left;
                fab.style.top = pos.top;
                fab.style.right = pos.right;
                fab.style.bottom = pos.bottom;
            }
        } else {
            fab.style.right = '22px';
            fab.style.bottom = '22px';
        }

        document.body.appendChild(fab);

        window.addEventListener('resize', () => {
            const pos = GM_getValue('fab_position');
            if (!pos || pos.xRatio === undefined) return;

            fab.style.transition = 'none';

            // 👉 Restore proportional vertical position first
            const top = pos.yRatio * window.innerHeight;
            fab.style.top = top + 'px';

            const padding = 10;
            const PEEK_LEFT = 16;
            const PEEK_RIGHT = 24;

            if (pos && pos.xRatio !== undefined) {
                window.snapSide = pos.xRatio < 0.5 ? 'left' : 'right';
            }

            // 👉 Then force edge snapping using the recorded side
            if (window.snapSide === 'left') {
                fab.style.left = -(fab.offsetWidth - PEEK_LEFT) + padding + 'px';
            } else {
                fab.style.left = (window.innerWidth - PEEK_RIGHT - padding) + 'px';
            }
        });

        setTimeout(() => {
            const rect = fab.getBoundingClientRect();
            const isLeft = rect.left < window.innerWidth / 2;

            const padding = 10;
            const PEEK_LEFT = 16;
            const PEEK_RIGHT = 24;

            fab.style.transition = 'none';

            if (isLeft) {
                fab.style.left = -(fab.offsetWidth - PEEK_LEFT) + padding + 'px';
            } else {
                fab.style.left = (window.innerWidth - PEEK_RIGHT - padding) + 'px';
            }
        }, 50); // 👈 Give the browser a moment to calculate layout

        // Main Panel
        const mainPanel = createMainPanel();

        // Settings Panel (Placeholder, content filled by renderSettings)
        const settingsPanel = document.createElement('div');
        settingsPanel.id = 'ais-settings';
        settingsPanel.className = 'ais-off';

        document.body.appendChild(mainPanel);
        document.body.appendChild(settingsPanel);

        renderSettings(Cfg.get());
        bindMainEvents();
    }

/* ================================================
       Tampermonkey Menu Commands
    ================================================ */
    GM_registerMenuCommand('🤖 AI Summarize Current Page', () => {
        panelOpen = true; toggle('ais-main', true);
        doSummary();
    });
    GM_registerMenuCommand('⚙️ AI Summarizer Settings', () => {
        panelOpen = true; toggle('ais-main', true);
        settingsOpen = true; toggle('ais-settings', true);
    });

    /* ================================================
       Startup
    ================================================ */
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

})();
