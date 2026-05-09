// ==UserScript==
// @name         AI summary
// @namespace    http://tampermonkey.net/
// @version      2.6.2
// @description  One-click capture of webpage content, intelligent summary via AI API; supports follow-up questions and multi-round chats; supports OpenAI/Anthropic/Gemini/DeepSeek and other compatible interfaces
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

!(function () {
  "use strict";
  const e = {
      apiUrl: "https://openrouter.ai/api/v1/chat/completions",
      apiKey: "",
      model: "google/gemini-3.1-pro-preview",
      maxTokens: 2048,
      temperature: 0.7,
      stream: !0,
      maxContentLength: 16e3,
      systemPrompt:
        "You are a professional web content analysis assistant, skilled at extracting and summarizing the core content of articles, providing concise and clear answers.",
      userPrompt:
        "Please provide a summary and analysis of the following webpage content:\n\nTitle: {title}\n\nContent:\n{content}\n\nPlease respond in the following format:\n📌 **Theme**: One sentence summarizing the article theme\n\n🔑 **Key Points**:\n- Point one\n- Point two\n- Point three\n\n💡 **Summary**: Brief conclusion",
    },
    t = [
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
    ],
    n = () => window.innerWidth - document.documentElement.clientWidth,
    i = 10,
    s = () =>
      Object.fromEntries(Object.keys(e).map((t) => [t, GM_getValue(t, e[t])])),
    a = (e) => Object.entries(e).forEach(([e, t]) => GM_setValue(e, t)),
    o = () => Object.entries(e).forEach(([e, t]) => GM_setValue(e, t));
  function r(e) {
    return e
      .replace(/[ \t]{2,}/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  }
  function l(e) {
    return e.includes("anthropic.com")
      ? "anthropic"
      : e.includes("generativelanguage.googleapis")
        ? "gemini"
        : "openai";
  }
  function c(e, t) {
    if (!t.startsWith("data:")) return null;
    const n = t.slice(5).trim();
    if (!n) return null;
    try {
      if ("anthropic" === e) {
        const e = JSON.parse(n);
        return "message_stop" === e.type
          ? "[DONE]"
          : "content_block_delta" === e.type && "text_delta" === e.delta?.type
            ? e.delta.text
            : null;
      }
      if ("gemini" === e) {
        const e = JSON.parse(n),
          t = Array.isArray(e) ? e[0] : e,
          i = t?.candidates?.[0]?.content?.parts?.[0]?.text || null;
        return i;
      }
      if ("[DONE]" === n) return "[DONE]";
      const t = JSON.parse(n).choices?.[0]?.delta?.content || null;
      return t;
    } catch (e) {
      return null;
    }
  }
  function d(e) {
    return String(e || "")
      .replace(/\r\n/g, "\n")
      .replace(/\r/g, "\n");
  }
  function p(e, t = !1) {
    const n = d(e).split(/\n\n+/);
    return t
      ? { events: n.filter(Boolean), rest: "" }
      : { events: n.slice(0, -1).filter(Boolean), rest: n[n.length - 1] || "" };
  }
  function u(e, t, n, i) {
    for (const s of d(t).split("\n")) {
      const t = c(e, s.trim());
      if ("[DONE]" === t) return (i?.(), !0);
      t && n(t);
    }
    return !1;
  }
  function f(e, t) {
    let n = "";
    const { events: i } = p(t, !0);
    for (const t of i)
      u(e, t, (e) => {
        n += e;
      });
    return n;
  }
  function m(e, t) {
    if (t.includes("data:")) {
      const n = f(e, t);
      if (n) return n;
    }
    try {
      const n = JSON.parse(t);
      if ("anthropic" === e) return n.content?.[0]?.text || "";
      if ("gemini" === e) {
        const e = Array.isArray(n) ? n[0] : n;
        return e?.candidates?.[0]?.content?.parts?.[0]?.text || "";
      }
      return n.choices?.[0]?.message?.content || "";
    } catch {
      return "";
    }
  }
  let g = null;
  function x(e, { onChunk: t, onDone: n, onError: i }) {
    const a = s();
    if (!a.apiKey && !a.apiUrl.includes("{key}"))
      return void i("API Key not set, please click ⚙️ to configure");
    const o = l(a.apiUrl),
      r = (function (e, t) {
        const n = l(e.apiUrl);
        if ("anthropic" === n)
          return {
            url: e.apiUrl,
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
              "Cache-Control": "no-cache",
              "x-api-key": e.apiKey,
              "anthropic-version": "2023-06-01",
            },
            body: JSON.stringify({
              model: e.model,
              max_tokens: +e.maxTokens,
              system: e.systemPrompt,
              messages: t,
              stream: e.stream,
            }),
          };
        if ("gemini" === n) {
          let n = e.apiUrl
            .replace("{model}", e.model)
            .replace("{key}", e.apiKey);
          e.stream &&
            (n =
              n.replace("generateContent", "streamGenerateContent") +
              "&alt=sse");
          const i = t.map((e) => ({
            role: "assistant" === e.role ? "model" : "user",
            parts: [{ text: e.content }],
          }));
          return {
            url: n,
            headers: {
              "Content-Type": "application/json",
              Accept: "text/event-stream",
              "Cache-Control": "no-cache",
            },
            body: JSON.stringify({
              contents: i,
              systemInstruction: { parts: [{ text: e.systemPrompt }] },
              generationConfig: {
                maxOutputTokens: +e.maxTokens,
                temperature: +e.temperature,
              },
            }),
          };
        }
        const i = {
          model: e.model,
          messages: [{ role: "system", content: e.systemPrompt }, ...t],
          max_tokens: +e.maxTokens,
          temperature: +e.temperature,
          stream: e.stream,
        };
        return {
          url: e.apiUrl,
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream",
            "Cache-Control": "no-cache",
            Authorization: `Bearer ${e.apiKey}`,
          },
          body: JSON.stringify(i),
        };
      })(a, e);
    let c = "",
      d = "",
      x = "",
      b = !1;
    const h = (e) => {
      b || ((b = !0), n(e));
    };
    g = GM_xmlhttpRequest({
      method: "POST",
      url: r.url,
      headers: r.headers,
      data: r.body,
      timeout: 9e4,
      onprogress: a.stream
        ? (e) => {
            const n = (function (e) {
              return (
                e?.responseText ??
                e?.target?.responseText ??
                e?.currentTarget?.responseText ??
                ""
              );
            })(e);
            if (!n || n.length < c.length) return;
            const i = n.slice(c.length);
            if (((c = n), !i)) return;
            d += i;
            const { events: s, rest: a } = p(d);
            d = a;
            for (const e of s) {
              if (
                u(
                  o,
                  e,
                  (e) => {
                    ((x += e), t(x));
                  },
                  () => h(x),
                )
              )
                return;
            }
          }
        : null,
      onload(e) {
        if (e.status < 200 || e.status >= 300) {
          let t = `HTTP ${e.status}`;
          try {
            t = JSON.parse(e.responseText).error?.message || t;
          } catch {}
          return i(t);
        }
        if (!a.stream) return ((x = m(o, e.responseText)), t(x), void h(x));
        setTimeout(() => {
          if (d) {
            const { events: e } = p(d, !0);
            d = "";
            for (const n of e) {
              if (
                u(
                  o,
                  n,
                  (e) => {
                    ((x += e), t(x));
                  },
                  () => h(x),
                )
              )
                return;
            }
          }
          if (!x) {
            const n = e.responseText || c || d;
            if (n.includes("data:")) {
              const e = f(o, n);
              x = e || m(o, n);
            } else x = m(o, n);
            x && t(x);
          }
          h(x);
        }, 0);
      },
      onerror: () =>
        i("Network error, please check API address and network connection"),
      ontimeout: () =>
        i("Request timeout (90s), please check network or API service status"),
    });
  }
  function b() {
    ((y("ais-run").style.display = "none"),
      (y("ais-chat-wrap").style.display = "flex"),
      y("ais-chat-input").focus());
  }
  function h(e) {
    const t = ((n = e),
    n.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")).split(
      "\n",
    );
    var n;
    let i = "",
      s = !1;
    for (const e of t) {
      let t = e
        .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
        .replace(/\*(.+?)\*/g, "<em>$1</em>")
        .replace(
          /`(.+?)`/g,
          '<code style="background:#f1f5f9;padding:1px 5px;border-radius:4px;font-size:12px">$1</code>',
        );
      /^#{1,3} /.test(e)
        ? (s && ((i += "</ul>"), (s = !1)),
          (i += `<h3 style="margin:10px 0 4px;font-size:14px;font-weight:700">${t.replace(/^#+\s*/, "")}</h3>`))
        : /^[-*•] /.test(e)
          ? (s ||
              ((i += '<ul style="padding-left:20px;margin:6px 0">'), (s = !0)),
            (i += `<li style="margin:3px 0">${t.replace(/^[-*•]\s*/, "")}</li>`))
          : (s && ((i += "</ul>"), (s = !1)),
            e.trim()
              ? (i += `<p style="margin:5px 0">${t}</p>`)
              : (i += "<br>"));
    }
    return (s && (i += "</ul>"), i);
  }
  const y = (e) => document.getElementById(e),
    v = (e) =>
      String(e || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;"),
    w = (e, t) => y(e)?.classList.toggle("ais-off", !t),
    k = (e) => {
      const t = y("ais-body");
      t && (t.innerHTML = e);
    };
  function C(e, t = "#111827") {
    const n = document.createElement("div");
    ((n.style.cssText = `\n            position:fixed;right:22px;bottom:86px;z-index:2147483645;\n            background:${t};color:#fff;padding:9px 16px;\n            border-radius:10px;font-size:13px;\n            box-shadow:0 4px 16px rgba(0,0,0,.25);\n            font-family:system-ui,-apple-system,sans-serif;\n            animation:ais-ti .25s ease;pointer-events:none;\n        `),
      (n.textContent = e),
      document.body.appendChild(n),
      setTimeout(() => {
        ((n.style.cssText += ";opacity:0;transition:opacity .3s"),
          setTimeout(() => n.remove(), 400));
      }, 2200));
  }
  function L(e) {
    const t = y("ais-run"),
      n = y("ais-stop"),
      i = y("ais-chat-wrap");
    (n && (n.style.display = e ? "" : "none"),
      e && (t && (t.style.display = "none"), i && (i.style.display = "none")));
  }
  GM_addStyle(
    "@keyframes ais-spin{to{transform:rotate(360deg);}}@keyframes ais-blink{50%{opacity:0;}}@keyframes ais-ti{from{opacity:0;transform:translateY(8px);}}@keyframes ais-fab-click{0%{transform:scale(.88);}100%{transform:scale(1);}}.ais-off{opacity:0 !important;pointer-events:none !important;transform:translateY(16px) scale(.96) !important;filter:blur(0.4px) !important;}#ais-fab-wrap{position:fixed;inset:0;z-index:2147483641;pointer-events:none;overflow:hidden;}#ais-fab{position:absolute;right:22px;bottom:22px;pointer-events:auto;display:flex;align-items:center;justify-content:center;width:35px;height:35px;border-radius:50%;background:linear-gradient(135deg,#F8F8F8,#F8F8F8);border:none;cursor:pointer;color:#fff;font-size:24px;box-shadow:1px 4px 18px rgba(125,125,125,.6);transition:transform .26s cubic-bezier(0.22,1,0.36,1),box-shadow .26s ease,left .26s ease,top .26s ease;will-change:transform,left,top;user-select:none;}#ais-fab:hover{transform:scale(1.08);box-shadow:0 8px 28px rgba(130,130,130,.35);}#ais-fab.ais-fab-pressing{transform:scale(.88) !important;transition:transform .12s ease-out !important;}#ais-fab.ais-fab-clicking{animation:ais-fab-click 0.24s ease-out forwards;}#ais-main,#ais-settings{position:fixed;right:22px;bottom:86px;z-index:2147483640;width:420px;background:#fff;border-radius:18px;box-shadow:0 8px 40px rgba(0,0,0,.18),0 0 0 1px rgba(0,0,0,.06);display:flex;flex-direction:column;overflow:hidden;transition:opacity .32s cubic-bezier(.21,.61,.35,1),transform .32s cubic-bezier(.21,.61,.35,1),box-shadow .24s ease;transform-origin:top right;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;font-size:14px;}.ais-hd{display:flex;align-items:center;gap:6px;padding:12px 14px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;flex-shrink:0;cursor:move;user-select:none;}.ais-hd-title{flex:1;font-size:14px;font-weight:600;}.ais-hbtn{background:rgba(255,255,255,.22);border:none;color:#fff;border-radius:7px;padding:4px 9px;cursor:pointer;font-size:12px;white-space:nowrap;transition:background .15s,transform .1s;}.ais-hbtn:hover{background:rgba(255,255,255,.38);}.ais-hbtn:active{transform:scale(.88);}.ais-meta{padding:6px 14px;font-size:11px;color:#9ca3af;background:#fafafa;border-bottom:1px solid #f3f4f6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex-shrink:0;}.ais-body{flex:1;overflow-y:auto;padding:14px;min-height:160px;max-height:440px;scroll-behavior:smooth;}.ais-body::-webkit-scrollbar{width:4px;}.ais-body::-webkit-scrollbar-thumb{background:#e0e0e0;border-radius:4px;}.ais-ph{color:#9ca3af;text-align:center;padding:32px 12px;line-height:1.8;font-size:13px;}.ais-loading{display:flex;align-items:center;justify-content:center;gap:10px;color:#6366f1;padding:32px;font-size:13px;}.ais-spinner{width:20px;height:20px;border-radius:50%;border:2px solid #e0e7ff;border-top-color:#6366f1;animation:ais-spin .7s linear infinite;flex-shrink:0;}.ais-res{line-height:1.8;color:#1f2937;font-size:13.5px;word-break:break-word;overflow-wrap:break-word;max-width:100%;}.ais-cursor::after{content:'▊';color:#6366f1;animation:ais-blink .8s step-end infinite;}.ais-err{background:#fef2f2;border-left:3px solid #f87171;color:#dc2626;padding:12px 14px;border-radius:8px;font-size:13px;line-height:1.6;}.ais-ft{display:flex;gap:8px;padding:10px 12px;border-top:1px solid #f3f4f6;flex-shrink:0;}.ais-btn{flex:1;padding:8px;border:none;border-radius:9px;font-size:13px;font-weight:500;cursor:pointer;transition:all .15s;}.ais-primary{background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;box-shadow:0 2px 8px rgba(99,102,241,.3);}.ais-primary:hover{opacity:.88;transform:translateY(-1px);}.ais-primary:active{transform:scale(.93) !important;opacity:1;}.ais-secondary{background:#f3f4f6;color:#374151;}.ais-secondary:hover{background:#e5e7eb;}.ais-secondary:active{transform:scale(.93);}.ais-danger{background:#fee2e2;color:#dc2626;}.ais-danger:hover{background:#fecaca;}.ais-danger:active{transform:scale(.93);}.ais-chat-wrap{display:flex;flex:1;gap:8px;align-items:center;}.ais-chat-input{flex:1;padding:7px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;color:#111;outline:none;background:#fafafa;transition:border-color .15s;}.ais-chat-input:focus{border-color:#6366f1;background:#fff;}.ais-btn-square{width:30px;height:30px;flex:none;padding:0;display:flex;align-items:center;justify-content:center;flex-shrink:0;border-radius:8px;font-size:14px;}.ais-user-msg{background:#f3f4f6;padding:10px 12px;border-radius:8px;margin:16px 0 8px;font-size:13px;color:#374151;word-break:break-word;border-left:3px solid #9ca3af;}#ais-settings{max-height:580px;}.ais-cfg-body{padding:14px 16px;overflow-y:auto;flex:1;}.ais-cfg-body::-webkit-scrollbar{width:4px;}.ais-cfg-body::-webkit-scrollbar-thumb{background:#e0e0e0;border-radius:4px;}.ais-field{margin-bottom:11px;}.ais-lbl{display:block;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px;}.ais-inp,.ais-ta{width:100%;padding:8px 10px;border:1.5px solid #e5e7eb;border-radius:8px;font-size:13px;color:#111;background:#fafafa;outline:none;transition:border-color .15s;box-sizing:border-box;}.ais-inp:focus,.ais-ta:focus{border-color:#6366f1;background:#fff;}.ais-ta{resize:vertical;min-height:75px;}.ais-presets{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:12px;}.ais-pre{padding:4px 11px;border:1.5px solid #e0e7ff;background:#eef2ff;color:#4f46e5;border-radius:20px;cursor:pointer;font-size:12px;font-weight:500;transition:all .15s;}.ais-pre:hover{background:#6366f1;color:#fff;border-color:#6366f1;}.ais-pre:active{transform:scale(.91);}.ais-row{display:flex;align-items:center;justify-content:space-between;}.ais-sw{position:relative;width:40px;height:22px;background:#d1d5db;border-radius:11px;border:none;cursor:pointer;transition:background .2s;flex-shrink:0;}.ais-sw.on{background:#6366f1;}.ais-sw::after{content:'';position:absolute;width:18px;height:18px;background:#fff;border-radius:50%;top:2px;left:2px;box-shadow:0 1px 3px rgba(0,0,0,.25);transition:left .2s;}.ais-sw.on::after{left:20px;}",
  );
  let T = !1,
    E = !1,
    S = !1,
    M = "",
    z = [],
    A = null;
  function P(n) {
    ((y("ais-settings").innerHTML =
      `\n            <div class="ais-hd" style="cursor:default;">\n                <span class="ais-hd-title">⚙️ API Settings</span>\n                <button class="ais-hbtn" id="ais-cfg-close">✕</button>\n            </div>\n            <div class="ais-cfg-body">\n                <div class="ais-presets">\n                    ${t.map((e) => `<button class="ais-pre" data-pid="${e.id}">${e.name}</button>`).join("")}\n                </div>\n                <div class="ais-field">\n                    <label class="ais-lbl">API Address</label>\n                    <input class="ais-inp" id="f-url" value="${v(n.apiUrl)}" placeholder="https://api.openai.com/v1/chat/completions">\n                </div>\n                <div class="ais-field">\n                    <label class="ais-lbl">API Key</label>\n                    <input class="ais-inp" id="f-key" type="password" value="${v(n.apiKey)}" placeholder="sk-...">\n                </div>\n                <div class="ais-field">\n                    <label class="ais-lbl">Model Name</label>\n                    <input class="ais-inp" id="f-model" value="${v(n.model)}" placeholder="gpt-3.5-turbo">\n                </div>\n                <div class="ais-field">\n                    <label class="ais-lbl">Max Output Tokens</label>\n                    <input class="ais-inp" id="f-tokens" type="number" value="${n.maxTokens}" min="100" max="8000">\n                </div>\n                <div class="ais-field">\n                    <label class="ais-lbl">Max Content Length (Truncated if exceeded)</label>\n                    <input class="ais-inp" id="f-maxlen" type="number" value="${n.maxContentLength}" min="1000" max="50000">\n                </div>\n                <div class="ais-field">\n                    <div class="ais-row"><label class="ais-lbl" style="margin:0">Stream Output</label><button class="ais-sw ${n.stream ? "on" : ""}" id="f-stream"></button></div>\n                </div>\n                <div class="ais-field"><label class="ais-lbl">System Prompt</label><textarea class="ais-ta" id="f-sys">${v(n.systemPrompt)}</textarea></div>\n                <div class="ais-field"><label class="ais-lbl">User Prompt (Variables: {title} {content})</label><textarea class="ais-ta" id="f-prompt" style="min-height:140px">${v(n.userPrompt)}</textarea></div>\n            </div>\n            <div class="ais-ft">\n                <button class="ais-btn ais-secondary" id="ais-cfg-reset">↩ Restore Defaults</button>\n                <button class="ais-btn ais-primary" id="ais-cfg-save">💾 Save Settings</button>\n            </div>\n        `),
      y("ais-cfg-close").addEventListener("click", () => {
        ((E = !1), w("ais-settings", !1));
      }),
      y("ais-cfg-save").addEventListener("click", () => {
        const e = y("f-url").value.trim(),
          n = y("f-key").value.trim(),
          i = t.find((t) => e === t.url);
        (i && n && GM_setValue("apiKey_" + i.id, n),
          a({
            apiUrl: e,
            apiKey: n,
            model: y("f-model").value.trim(),
            maxTokens: +y("f-tokens").value || 2e3,
            maxContentLength: +y("f-maxlen").value || 8e3,
            stream: y("f-stream").classList.contains("on"),
            systemPrompt: y("f-sys").value,
            userPrompt: y("f-prompt").value,
          }),
          (E = !1),
          w("ais-settings", !1),
          C("✓ Settings saved", "#16a34a"));
      }),
      y("ais-cfg-reset").addEventListener("click", () => {
        confirm("Are you sure you want to restore all default settings?") &&
          (o(), P(e), C("✓ Defaults restored", "#16a34a"));
      }),
      y("f-stream").addEventListener("click", (e) =>
        e.currentTarget.classList.toggle("on"),
      ),
      document.querySelectorAll(".ais-pre").forEach((e) => {
        e.addEventListener("click", () => {
          const n = t.find((t) => t.id === e.dataset.pid);
          n &&
            ((y("f-url").value = n.url),
            (y("f-model").value = n.model),
            (y("f-key").value = GM_getValue("apiKey_" + n.id, "")));
        });
      }));
  }
  function H(e) {
    const t = y(e),
      n = t.querySelector(".ais-hd");
    let i = !1,
      s = !1,
      a = { x: 0, y: 0 },
      o = { x: 0, y: 0 };
    (n.addEventListener("mousedown", (e) => {
      if ("button" === e.target.tagName.toLowerCase()) return;
      ((i = !0), (s = !1));
      const n = t.getBoundingClientRect();
      ((a.x = e.clientX),
        (a.y = e.clientY),
        (o.x = e.clientX - n.left),
        (o.y = e.clientY - n.top),
        (t.style.left = n.left + "px"),
        (t.style.top = n.top + "px"),
        (t.style.right = "auto"),
        (t.style.bottom = "auto"),
        (t.style.transition = "none"));
    }),
      document.addEventListener("mousemove", (e) => {
        if (!i) return;
        const n = e.clientX - a.x,
          r = e.clientY - a.y;
        if (!s && Math.sqrt(n * n + r * r) < 8) return;
        s || (s = !0);
        let l = e.clientX - o.x,
          c = e.clientY - o.y;
        ((l = Math.max(0, Math.min(window.innerWidth - t.offsetWidth, l))),
          (c = Math.max(0, Math.min(window.innerHeight - t.offsetHeight, c))),
          (t.style.left = l + "px"),
          (t.style.top = c + "px"));
      }),
      document.addEventListener("mouseup", () => {
        i &&
          ((i = !1),
          s &&
            ((s = !1),
            (t.style.transition = "opacity .22s ease, transform .22s ease")));
      }));
  }
  function W() {
    const e = y("ais-fab"),
      t = y("ais-main"),
      n = e.getBoundingClientRect(),
      s = n.left < window.innerWidth / 2;
    ((t.style.right = "auto"), (t.style.bottom = "auto"));
    let a = s ? n.right + 15 : n.left - 420 - 15;
    ((a = Math.max(i, Math.min(window.innerWidth - 420 - i, a))),
      (t.style.left = a + "px"));
    const o = t.offsetHeight || 420;
    let r = Math.max(i, Math.min(window.innerHeight - o - i, n.top));
    t.style.top = r + "px";
  }
  function $() {
    const e = y("ais-fab");
    let t = !1,
      s = !1;
    window.snapSide = "right";
    let a = { x: 0, y: 0 },
      o = { x: 0, y: 0 };
    (e.addEventListener("mousedown", (n) => {
      ((t = !0), (s = !1));
      const i = e.getBoundingClientRect();
      ((a.x = n.clientX - i.left),
        (a.y = n.clientY - i.top),
        (o.x = n.clientX),
        (o.y = n.clientY),
        (e.style.transition = "none"));
    }),
      document.addEventListener("mousemove", (n) => {
        if (!t) return;
        const i = n.clientX - o.x,
          r = n.clientY - o.y;
        if (!s && Math.sqrt(i * i + r * r) > 8)
          return (
            (s = !0),
            (e.style.transition = "all 0.12s ease-out"),
            (e.style.left = n.clientX - a.x + "px"),
            void (e.style.top = n.clientY - a.y + "px")
          );
        if (!s) return;
        e.style.transition = "none";
        let l = Math.max(
            10,
            Math.min(window.innerWidth - e.offsetWidth - 10, n.clientX - a.x),
          ),
          c = Math.max(
            10,
            Math.min(window.innerHeight - e.offsetHeight - 10, n.clientY - a.y),
          );
        ((e.style.left = l + "px"),
          (e.style.top = c + "px"),
          (e.style.right = "auto"),
          (e.style.bottom = "auto"));
      }),
      document.addEventListener("mouseup", () => {
        if (!t) return;
        if (((t = !1), !s)) return;
        const a = e.getBoundingClientRect(),
          o = a.left < window.innerWidth / 2;
        ((e.style.transition = "all 0.35s cubic-bezier(0.25, 1.4, 0.4, 1)"),
          (e.style.left =
            (o ? -(e.offsetWidth - 8) + i : window.innerWidth - 12 - i - n()) +
            "px"),
          (e.style.top = a.top + "px"),
          GM_setValue("fab_position", {
            xRatio: a.left / window.innerWidth,
            yRatio: a.top / window.innerHeight,
          }),
          (window.snapSide = o ? "left" : "right"));
      }));
    e.offsetWidth;
    let r = !1,
      l = null,
      c = null;
    (e.addEventListener("mousedown", () => {
      e.classList.add("ais-fab-pressing");
    }),
      document.addEventListener(
        "mouseup",
        () => {
          e.classList.remove("ais-fab-pressing");
        },
        { capture: !0 },
      ),
      e.addEventListener("mouseenter", () => {
        (c && (clearTimeout(c), (c = null)), l && clearTimeout(l), (r = !0));
        const t = e.getBoundingClientRect();
        ((e.style.transition = "all 0.25s ease-out"),
          t.left < window.innerWidth / 2
            ? (e.style.left = "15px")
            : (e.style.left = window.innerWidth - e.offsetWidth - 15 + "px"),
          (l = setTimeout(() => {
            r = !1;
          }, 350)));
      }),
      e.addEventListener("mouseleave", (s) => {
        t ||
          r ||
          (c = setTimeout(() => {
            c = null;
            const t = e.getBoundingClientRect();
            ((e.style.transition = "all 0.3s cubic-bezier(0.25, 1.4, 0.4, 1)"),
              t.left < window.innerWidth / 2
                ? (e.style.left = -(e.offsetWidth - 8) + i + "px")
                : (e.style.left = window.innerWidth - 12 - i - n() + "px"));
          }, 120));
      }),
      e.addEventListener("click", (t) => {
        if (s) return (t.preventDefault(), void t.stopPropagation());
        (e.classList.remove("ais-fab-clicking"),
          e.offsetWidth,
          e.classList.add("ais-fab-clicking"),
          e.addEventListener(
            "animationend",
            () => e.classList.remove("ais-fab-clicking"),
            { once: !0 },
          ),
          (T = !T),
          T && W(),
          w("ais-main", T),
          T || ((E = !1), w("ais-settings", !1)));
      }),
      y("ais-main-close").addEventListener("click", () => {
        ((T = !1), w("ais-main", !1), (E = !1), w("ais-settings", !1));
      }),
      y("ais-cfg-open").addEventListener("click", () => {
        if (((E = !E), E)) {
          const e = y("ais-main").getBoundingClientRect(),
            t = y("ais-settings");
          ((t.style.right = "auto"), (t.style.bottom = "auto"));
          let n = e.left,
            i = e.top;
          ((t.style.visibility = "hidden"), t.classList.remove("ais-off"));
          const s = t.getBoundingClientRect(),
            a = s.width,
            o = s.height;
          (n + a > window.innerWidth && (n = window.innerWidth - a - 10),
            i + o > window.innerHeight && (i = window.innerHeight - o - 20),
            (n = Math.max(10, n)),
            (i = Math.max(10, i)),
            (t.style.left = n + "px"),
            (t.style.top = i + "px"),
            (t.style.visibility = ""));
        }
        w("ais-settings", E);
      }),
      y("ais-copy").addEventListener("click", () => {
        M
          ? navigator.clipboard
              .writeText(M)
              .then(() => C("✓ Copied to clipboard", "#16a34a"))
              .catch(() => C("Copy failed, please select manually"))
          : C("No content to copy");
      }),
      y("ais-stop").addEventListener("click", () => {
        (g && (g.abort(), (g = null)),
          (S = !1),
          L(!1),
          A &&
            ((A.innerHTML = h(M || "Manually stopped")),
            A.classList.remove("ais-cursor"),
            A.removeAttribute("id")),
          z.length > 0
            ? (M && z.push({ role: "assistant", content: M }),
              (y("ais-run").style.display = "none"),
              (y("ais-chat-wrap").style.display = "flex"))
            : ((y("ais-run").style.display = ""),
              (y("ais-run").textContent = "🔄 Re-summarize")));
      }),
      y("ais-run").addEventListener("click", O),
      y("ais-re-run").addEventListener("click", O),
      y("ais-chat-send").addEventListener("click", R),
      y("ais-chat-input").addEventListener("keydown", (e) => {
        "Enter" === e.key && (e.preventDefault(), R());
      }));
  }
  function O() {
    if (S) return;
    ((S = !0),
      (M = ""),
      (z = []),
      (y("ais-run").style.display = ""),
      (y("ais-run").textContent = "✨ Start Summary"),
      (y("ais-chat-wrap").style.display = "none"),
      L(!0),
      k(
        '<div class="ais-loading"><div class="ais-spinner"></div> Extracting page content...</div>',
      ));
    const e = (function () {
        const e = [
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
          ],
          t = [
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
          const n = document.documentElement.cloneNode(!0);
          e.forEach((e) => {
            try {
              n.querySelectorAll(e).forEach((e) => e.remove());
            } catch {}
          });
          for (const e of t) {
            const t = n.querySelector(e);
            if (t) {
              const e = (t.innerText || t.textContent || "").trim();
              if (e.length > 300) return r(e);
            }
          }
          const i = n.querySelector("body");
          return r(
            i?.innerText || i?.textContent || document.body.textContent || "",
          );
        } catch {
          return r(document.body.textContent || "");
        }
      })(),
      t = document.title,
      n = s();
    if (!e || e.length < 50)
      return (
        (S = !1),
        L(!1),
        k(
          '<div class="ais-err">❌ Page content extraction failed or content is too short.</div>',
        ),
        void (y("ais-run").style.display = "")
      );
    const i = y("ais-meta");
    i && (i.textContent = `📄 ${v(t)}  ·  Extracted ${e.length} chars`);
    const a = n.userPrompt
      .replace("{title}", t)
      .replace("{content}", String(e).slice(0, n.maxContentLength));
    (z.push({ role: "user", content: a }),
      k(
        '<div id="ais-current-res" class="ais-res ais-cursor"><div class="ais-loading" style="padding:10px 0;"><div class="ais-spinner"></div> AI is analyzing...</div></div>',
      ),
      (A = y("ais-current-res")),
      x(z, {
        onChunk(e) {
          if (((M = e), A)) {
            A.innerHTML = h(e);
            const t = y("ais-body");
            t && (t.scrollTop = t.scrollHeight);
          }
        },
        onDone(e) {
          ((S = !1),
            L(!1),
            (M = e),
            A &&
              ((A.innerHTML = h(e || "(AI returned empty content)")),
              A.classList.remove("ais-cursor"),
              A.removeAttribute("id")),
            z.push({ role: "assistant", content: e }),
            b(),
            W());
        },
        onError(e) {
          ((S = !1),
            L(!1),
            k(`<div class="ais-err">❌ ${v(e)}</div>`),
            (y("ais-run").style.display = ""),
            (y("ais-run").textContent = "🔄 Re-summarize"));
        },
      }));
  }
  function R() {
    if (S) return;
    const e = y("ais-chat-input"),
      t = e.value.trim();
    if (!t) return;
    ((e.value = ""), (S = !0), (M = ""), L(!0));
    const n = y("ais-body");
    (n.insertAdjacentHTML(
      "beforeend",
      `<div class="ais-user-msg">👤 ${v(t)}</div><div id="ais-current-res" class="ais-res ais-cursor">Thinking...</div>`,
    ),
      (A = y("ais-current-res")),
      (n.scrollTop = n.scrollHeight),
      z.push({ role: "user", content: t }),
      x(z, {
        onChunk(e) {
          ((M = e),
            A && ((A.innerHTML = h(e)), n && (n.scrollTop = n.scrollHeight)));
        },
        onDone(e) {
          ((S = !1),
            L(!1),
            (M = e),
            A &&
              ((A.innerHTML = h(e || "(AI returned empty content)")),
              A.classList.remove("ais-cursor"),
              A.removeAttribute("id"),
              n && (n.scrollTop = n.scrollHeight)),
            z.push({ role: "assistant", content: e }),
            b());
        },
        onError(i) {
          ((S = !1),
            L(!1),
            A &&
              ((A.outerHTML = `<div class="ais-err" style="margin-top:10px;">❌ ${v(i)}</div>`),
              n && (n.scrollTop = n.scrollHeight)),
            z.pop(),
            (e.value = t),
            b());
        },
      }));
  }
  function _() {
    const e = document.createElement("div");
    e.id = "ais-fab-wrap";
    const t = document.createElement("button");
    ((t.id = "ais-fab"),
      (t.title = "AI Content Summary"),
      (t.textContent = "📍"));
    const a = GM_getValue("fab_position");
    (Object.assign(t.style, { position: "absolute" }),
      a
        ? void 0 !== a.xRatio && void 0 !== a.yRatio
          ? ((t.style.left = a.xRatio * window.innerWidth + "px"),
            (t.style.top = a.yRatio * window.innerHeight + "px"))
          : ((t.style.left = a.left),
            (t.style.top = a.top),
            (t.style.right = a.right),
            (t.style.bottom = a.bottom))
        : ((t.style.right = "22px"), (t.style.bottom = "22px")),
      e.appendChild(t),
      document.body.appendChild(e));
    const o = () => {
      "left" === window.snapSide
        ? (t.style.left = -(t.offsetWidth - 8) + i + "px")
        : (t.style.left = window.innerWidth - 12 - i - n() + "px");
    };
    (window.addEventListener("resize", () => {
      const e = GM_getValue("fab_position");
      e &&
        void 0 !== e.xRatio &&
        ((t.style.transition = "none"),
        (t.style.top = e.yRatio * window.innerHeight + "px"),
        (window.snapSide = e.xRatio < 0.5 ? "left" : "right"),
        o());
    }),
      setTimeout(() => {
        const e = t.getBoundingClientRect();
        ((t.style.transition = "none"),
          (window.snapSide = e.left < window.innerWidth / 2 ? "left" : "right"),
          o());
      }, 50));
    const r = (function () {
        const e = document.createElement("div");
        return (
          (e.id = "ais-main"),
          (e.className = "ais-off"),
          (e.innerHTML = `\n            <div class="ais-hd">\n                <span class="ais-hd-title">🤖 AI Content Summary & Chat</span>\n                <button class="ais-hbtn" id="ais-copy">📋 Copy</button>\n                <button class="ais-hbtn" id="ais-cfg-open">⚙️ Settings</button>\n                <button class="ais-hbtn" id="ais-main-close">✕</button>\n            </div>\n            <div class="ais-meta" id="ais-meta">${v(document.title)}</div>\n            <div class="ais-body" id="ais-body">\n                <div class="ais-ph">Click the "Start Summary" button below<br>AI will automatically extract and analyze current page content 📖</div>\n            </div>\n            <div class="ais-ft" id="ais-ft-actions">\n                <button class="ais-btn ais-danger" id="ais-stop" style="display:none">⏹ Stop</button>\n                <button class="ais-btn ais-primary" id="ais-run">✨ Start Summary</button>\n                <div class="ais-chat-wrap" id="ais-chat-wrap" style="display:none;">\n                    <button class="ais-btn ais-secondary ais-btn-square" id="ais-re-run" title="Re-summarize">🔄</button>\n                    <input type="text" class="ais-chat-input" id="ais-chat-input" placeholder="Enter follow-up question, press Enter to send...">\n                    <button class="ais-btn ais-primary ais-btn-square" id="ais-chat-send" title="Send">⬆️</button>\n                </div>\n            </div>\n        `),
          e
        );
      })(),
      l = document.createElement("div");
    ((l.id = "ais-settings"),
      (l.className = "ais-off"),
      document.body.appendChild(r),
      document.body.appendChild(l),
      P(s()),
      $(),
      H("ais-main"),
      H("ais-settings"));
  }
  (GM_registerMenuCommand("🤖 AI Summarize Current Page", () => {
    ((T = !0), W(), w("ais-main", !0), O());
  }),
    GM_registerMenuCommand("⚙️ AI Summarizer Settings", () => {
      ((T = !0), W(), w("ais-main", !0), (E = !0));
      const e = y("ais-main").getBoundingClientRect(),
        t = y("ais-settings");
      ((t.style.right = "auto"),
        (t.style.bottom = "auto"),
        (t.style.left = e.left + "px"),
        (t.style.top = e.top + "px"),
        w("ais-settings", !0));
    }),
    "loading" === document.readyState
      ? document.addEventListener("DOMContentLoaded", _)
      : _());
})();
