/*
  AdorWorks public-site AI chat widget. Self-contained vanilla JS (the
  marketing site has no bundler — see js/main.js's own house style) —
  injects its own styles and markup rather than needing a second <link>
  tag added to every page alongside this <script>.

  Talks to backend/api's /api/public/chat and /api/public/chat/escalate
  (routes/publicChat.js) — the API base URL comes from
  window.ADORWORKS_API_URL (js/api-config.js), the same injection
  pattern js/supabase-config.js already uses for Supabase's URL/key.

  Conversation history lives only in memory for this page view — not
  persisted, not sent anywhere but this one request each time. No
  account, no cookie, nothing to opt out of.
*/
(function () {
  "use strict";

  var API_BASE = (window.ADORWORKS_API_URL || "").replace(/\/$/, "");
  if (!API_BASE) return; // not configured — widget simply doesn't render, no broken UI

  var messages = []; // [{role: "user"|"assistant", content}]
  var escalating = false;
  var sending = false;

  var style = document.createElement("style");
  style.textContent =
    ".aw-chat-bubble{position:fixed;bottom:20px;inset-inline-end:20px;z-index:1000;width:56px;height:56px;border-radius:50%;" +
    "background:var(--color-accent,#00A88F);color:var(--color-accent-ink,#182230);border:none;cursor:pointer;" +
    "box-shadow:0 4px 16px rgba(0,0,0,.2);display:flex;align-items:center;justify-content:center;font-size:24px}" +
    ".aw-chat-panel{position:fixed;bottom:88px;inset-inline-end:20px;z-index:1000;width:min(360px,calc(100vw - 32px));" +
    "max-height:min(520px,calc(100vh - 140px));display:flex;flex-direction:column;background:#fff;border-radius:14px;" +
    "box-shadow:0 8px 32px rgba(0,0,0,.25);overflow:hidden;font-family:inherit}" +
    ".aw-chat-panel[hidden]{display:none}" +
    ".aw-chat-head{background:var(--color-primary,#182230);color:#fff;padding:14px 16px;display:flex;align-items:center;justify-content:space-between}" +
    ".aw-chat-head h2{margin:0;font-size:15px;font-weight:700}" +
    ".aw-chat-close{background:none;border:none;color:#fff;font-size:18px;cursor:pointer;line-height:1;padding:4px}" +
    ".aw-chat-body{flex:1;overflow-y:auto;padding:12px 14px;display:flex;flex-direction:column;gap:8px;background:var(--color-surface-alt,#F4F7FB)}" +
    ".aw-chat-msg{max-width:85%;padding:8px 12px;border-radius:12px;font-size:13.5px;line-height:1.45;white-space:pre-wrap}" +
    ".aw-chat-msg.user{align-self:flex-end;background:var(--color-accent,#00A88F);color:var(--color-accent-ink,#182230)}" +
    ".aw-chat-msg.assistant{align-self:flex-start;background:#fff;color:var(--color-ink,#182230);border:1px solid var(--color-border,#E2E7F0)}" +
    ".aw-chat-msg.system{align-self:center;color:var(--color-muted,#596274);font-size:12px;text-align:center}" +
    ".aw-chat-foot{border-top:1px solid var(--color-border,#E2E7F0);padding:10px;display:flex;gap:6px;background:#fff}" +
    ".aw-chat-foot input[type=text]{flex:1;border:1px solid var(--color-border,#E2E7F0);border-radius:8px;padding:8px 10px;font-size:13.5px;font-family:inherit}" +
    ".aw-chat-foot button{border:none;border-radius:8px;background:var(--color-accent,#00A88F);color:var(--color-accent-ink,#182230);" +
    "padding:8px 14px;font-weight:700;font-size:13.5px;cursor:pointer}" +
    ".aw-chat-human{border:none;background:none;color:var(--color-accent-text,#00786A);font-size:12px;text-decoration:underline;" +
    "cursor:pointer;padding:6px 14px;align-self:center}" +
    ".aw-chat-escalate{padding:12px 14px;display:flex;flex-direction:column;gap:8px;background:#fff;border-top:1px solid var(--color-border,#E2E7F0)}" +
    ".aw-chat-escalate input,.aw-chat-escalate textarea{border:1px solid var(--color-border,#E2E7F0);border-radius:8px;padding:8px 10px;" +
    "font-size:13.5px;font-family:inherit;width:100%;box-sizing:border-box}" +
    ".aw-chat-escalate textarea{resize:vertical;min-height:60px}" +
    /* Below 960px the homepage (and others) show a fixed mobile-contact-bar
       (css/styles.css) along the bottom edge — without this, the chat
       bubble sits on top of it at a higher z-index, covering its
       "Post a project" button. Same breakpoint and the same 60px clearance
       css/styles.css's own .install-banner already uses for the same bar. */
    "@media (max-width:959px){" +
    ".aw-chat-bubble{bottom:calc(60px + env(safe-area-inset-bottom,0px))}" +
    ".aw-chat-panel{bottom:calc(128px + env(safe-area-inset-bottom,0px))}" +
    "}";
  document.head.appendChild(style);

  var bubble = document.createElement("button");
  bubble.type = "button";
  bubble.className = "aw-chat-bubble";
  bubble.setAttribute("aria-label", "Open chat with AdorWorks");
  bubble.innerHTML = "\u{1F4AC}";

  var panel = document.createElement("div");
  panel.className = "aw-chat-panel";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "AdorWorks chat");
  panel.innerHTML =
    '<div class="aw-chat-head"><h2>Ask AdorWorks</h2><button type="button" class="aw-chat-close" aria-label="Close chat">✕</button></div>' +
    '<div class="aw-chat-body" aria-live="polite"></div>' +
    '<button type="button" class="aw-chat-human">Talk to a human instead</button>' +
    '<form class="aw-chat-foot"><input type="text" placeholder="Ask a question…" aria-label="Your message" maxlength="2000">' +
    '<button type="submit">Send</button></form>' +
    '<form class="aw-chat-escalate" hidden>' +
    '<input type="text" placeholder="Your name" aria-label="Your name" required>' +
    '<input type="email" placeholder="Your email" aria-label="Your email" required>' +
    '<textarea placeholder="What do you need help with?" aria-label="Your message" required></textarea>' +
    '<button type="submit">Send to AdorWorks staff</button></form>';

  document.body.appendChild(bubble);
  document.body.appendChild(panel);

  var body = panel.querySelector(".aw-chat-body");
  var chatForm = panel.querySelector(".aw-chat-foot");
  var chatInput = chatForm.querySelector("input");
  var humanButton = panel.querySelector(".aw-chat-human");
  var escalateForm = panel.querySelector(".aw-chat-escalate");

  function addBubble(role, text) {
    var el = document.createElement("div");
    el.className = "aw-chat-msg " + role;
    el.textContent = text;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
    return el;
  }

  addBubble("system", "Hi! Ask me anything about how AdorWorks works — verification, fees, payments, disputes.");

  bubble.addEventListener("click", function () {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) chatInput.focus();
  });
  panel.querySelector(".aw-chat-close").addEventListener("click", function () {
    panel.hidden = true;
  });

  chatForm.addEventListener("submit", function (e) {
    e.preventDefault();
    if (sending) return;
    var text = chatInput.value.trim();
    if (!text) return;
    chatInput.value = "";
    messages.push({ role: "user", content: text });
    addBubble("user", text);
    sending = true;
    var thinking = addBubble("system", "Thinking…");

    fetch(API_BASE + "/api/public/chat", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ messages: messages }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        thinking.remove();
        if (!result.ok) {
          addBubble("system", result.data.error || "Something went wrong — please try again or talk to a human.");
          return;
        }
        var reply = result.data.reply || "Sorry, I didn't catch that — could you try again?";
        messages.push({ role: "assistant", content: reply });
        addBubble("assistant", reply);
      })
      .catch(function () {
        thinking.remove();
        addBubble("system", "Couldn't reach AdorWorks right now — please try again shortly, or talk to a human.");
      })
      .finally(function () {
        sending = false;
      });
  });

  humanButton.addEventListener("click", function () {
    escalating = !escalating;
    escalateForm.hidden = !escalating;
    chatForm.hidden = escalating;
    humanButton.textContent = escalating ? "Back to chat" : "Talk to a human instead";
  });

  escalateForm.addEventListener("submit", function (e) {
    e.preventDefault();
    var inputs = escalateForm.querySelectorAll("input, textarea");
    var name = inputs[0].value.trim();
    var email = inputs[1].value.trim();
    var message = inputs[2].value.trim();
    if (!name || !email || !message) return;

    var submitBtn = escalateForm.querySelector("button");
    submitBtn.disabled = true;
    submitBtn.textContent = "Sending…";

    fetch(API_BASE + "/api/public/chat/escalate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: name, email: email, message: message, transcript: messages }),
    })
      .then(function (res) {
        return res.json().then(function (data) {
          return { ok: res.ok, data: data };
        });
      })
      .then(function (result) {
        if (result.ok) {
          escalateForm.hidden = true;
          chatForm.hidden = false;
          escalating = false;
          humanButton.textContent = "Talk to a human instead";
          addBubble("system", "Thanks, " + name + " — AdorWorks will get back to you at " + email + " soon.");
        } else {
          addBubble("system", result.data.error || "Couldn't send that — please try again.");
        }
      })
      .catch(function () {
        addBubble("system", "Couldn't send that — please try again.");
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = "Send to AdorWorks staff";
      });
  });
})();
