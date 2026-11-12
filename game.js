/* ============================================================
   My Alphabet Day — game engine
   Modes: Learn, Find It, Picture Match, Letter Match, Memory
   ============================================================ */

(function () {
  "use strict";

  /* ------------------------------ storage ------------------------------ */

  const LS = {
    get(k, d) {
      try { const r = localStorage.getItem("mad:" + k); return r == null ? d : JSON.parse(r); }
      catch (e) { return d; }
    },
    set(k, v) {
      try { localStorage.setItem("mad:" + k, JSON.stringify(v)); } catch (e) {}
      scheduleSave();
    },
    del(k) { try { localStorage.removeItem("mad:" + k); } catch (e) {} },
  };

  /* ------------------------- server API (MariaDB) ------------------------- */

  const API_URL = "api.php";
  let serverMode = false;
  let activeProfile = null;
  let saveTimer = null;

  async function apiCall(action, params, method) {
    let url = API_URL + "?action=" + encodeURIComponent(action);
    const opts = { method: method || "GET" };
    if (method === "POST" && params) {
      opts.headers = { "Content-Type": "application/x-www-form-urlencoded" };
      opts.body = new URLSearchParams(params).toString();
    } else if (params) {
      url += "&" + new URLSearchParams(params).toString();
    }
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    if (ctrl) {
      opts.signal = ctrl.signal;
      setTimeout(() => ctrl.abort(), 4000);
    }
    try {
      const res = await fetch(url, opts);
      if (!res.ok) return null;
      return await res.json();
    } catch (e) {
      return null;
    }
  }

  function scheduleSave() {
    if (!serverMode || !activeProfile) return;
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(saveNow, 700);
  }

  async function saveNow() {
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    if (!serverMode || !activeProfile) return;
    await apiCall("save", {
      id: activeProfile.id,
      stickers: JSON.stringify(stickers),
      levels: JSON.stringify(levels),
      speech_on: speechOn ? 1 : 0,
    }, "POST");
  }

  let stickers = LS.get("stickers", {});
  let speechOn = LS.get("speechOn", true);
  let levels = LS.get("levels", {});

  /* ------------------------------ helpers ------------------------------ */

  const $ = (s, r) => (r || document).querySelector(s);

  function el(tag, cls, html) {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (html != null) n.innerHTML = html;
    return n;
  }

  function shuffle(a) {
    a = a.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      const t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function pick(arr, n) { return shuffle(arr).slice(0, n); }

  function byLetter(l) { return ALPHABET.find(x => x.letter === l); }

  function pickLetterAvoiding(exclude) {
    let l;
    do { l = ALPHABET[(Math.random() * ALPHABET.length) | 0].letter; }
    while (exclude && l === exclude && ALPHABET.length > 1);
    return l;
  }

  // Round tokens kill any pending timers when the screen or round changes.
  let token = 0;
  function later(fn, ms) {
    const t = token;
    setTimeout(() => { if (t === token) fn(); }, ms);
  }

  function wobble(node) {
    node.classList.remove("wobble");
    void node.offsetWidth; // restart animation
    node.classList.add("wobble");
  }

  /* ------------------------------ colors & scene ------------------------------ */

  const TINTS = [
    ["#ff6b9d", "#ffe4ee"], ["#4d96ff", "#e3efff"], ["#6bcb77", "#e3f8ea"],
    ["#ff9f43", "#fff0de"], ["#a78bfa", "#efeaff"], ["#f43f5e", "#ffe4e9"],
    ["#0ea5e9", "#e0f4ff"], ["#f59e0b", "#fff4d6"], ["#10b981", "#dcfcef"],
    ["#8b5cf6", "#ece4ff"], ["#ec4899", "#fde4f1"], ["#14b8a6", "#d9f5f1"],
  ];
  function tintFor(i) { return TINTS[i % TINTS.length]; }
  function tintStyle(i) {
    const t = tintFor(i);
    return `--accent:${t[0]};--soft:${t[1]}`;
  }

  const AVATARS = ["🐻", "🦊", "🐼", "🐸", "🐱", "🐰", "🐨", "🐵"];
  const CONFETTI_EMOJI = ["🎉", "⭐", "✨", "🍬", "🎈", "🌟"];

  // Floating sky decorations (runs once at boot)
  function initBg() {
    const bg = document.getElementById("bg");
    if (!bg) return;
    const add = (cls, html, style) => {
      const n = el("span", "deco " + cls, html);
      n.style.cssText = style;
      bg.appendChild(n);
    };
    // clouds drifting across
    for (let i = 0; i < 4; i++) {
      add("cloud", "☁️",
        `top:${4 + i * 17}%;animation-duration:${46 + i * 14}s;animation-delay:-${i * 17}s`);
    }
    // balloons swaying
    for (let i = 0; i < 3; i++) {
      add("balloon", ["🎈", "🎀", "🪁"][i],
        `left:${10 + i * 34}%;animation-duration:${3.4 + i * 0.9}s;animation-delay:-${i * 1.3}s;top:${14 + i * 24}%`);
    }
    // twinkling sparkles
    for (let i = 0; i < 6; i++) {
      add("spark", i % 2 ? "✨" : "⭐",
        `left:${6 + i * 16}%;top:${8 + ((i * 37) % 70)}%;animation-duration:${2 + (i % 3)}s;animation-delay:-${i * 0.7}s`);
    }
    // rising soap bubbles
    for (let i = 0; i < 5; i++) {
      const size = 16 + ((i * 13) % 30);
      add("bubble", "",
        `left:${8 + i * 19}%;bottom:-8%;width:${size}px;height:${size}px;` +
        `animation-duration:${11 + i * 3}s;animation-delay:-${i * 4}s`);
    }
  }

  /* ------------------------------ speech ------------------------------ */

  let voices = [];
  function refreshVoices() {
    try { voices = speechSynthesis.getVoices() || []; } catch (e) { voices = []; }
  }
  if ("speechSynthesis" in window) {
    refreshVoices();
    speechSynthesis.onvoiceschanged = refreshVoices;
  }

  let lastThrottle = 0;

  function pickVoice() {
    const en = voices.filter(v => v.lang && /^en/i.test(v.lang));
    return (
      en.find(v => /samantha|zira|aria|jenny|female|google us english/i.test(v.name || "")) ||
      en[0]
    );
  }

  function speak(text, opts) {
    opts = opts || {};
    if (!("speechSynthesis" in window) || !text) return;
    if (!speechOn && !opts.force) return;
    if (opts.throttle) {
      const now = Date.now();
      if (now - lastThrottle < 1600) return;
      lastThrottle = now;
    }
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.85;
      u.pitch = 1.1;
      const chosen = pickVoice();
      if (chosen) u.voice = chosen;
      speechSynthesis.speak(u);
    } catch (e) {}
  }

  /* ------------------------------ sounds ------------------------------ */

  let actx = null;
  function audio() {
    if (!actx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      actx = new AC();
    }
    if (actx.state === "suspended") actx.resume().catch(() => {});
    return actx;
  }

  function tone(freq, delay, dur, type, vol) {
    const c = audio();
    if (!c) return;
    try {
      const t0 = c.currentTime + (delay || 0);
      const osc = c.createOscillator();
      const g = c.createGain();
      osc.type = type || "sine";
      osc.frequency.setValueAtTime(freq, t0);
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(vol || 0.15, t0 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(c.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.06);
    } catch (e) {}
  }

  const snd = {
    correct() { [523.25, 659.25, 783.99].forEach((f, i) => tone(f, i * 0.08, 0.22, "triangle", 0.15)); },
    wrong()   { tone(340, 0, 0.14, "sine", 0.11); tone(262, 0.13, 0.18, "sine", 0.11); },
    fanfare() {
      [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => tone(f, i * 0.1, 0.3, "triangle", 0.15));
      tone(1318.5, 0.42, 0.4, "triangle", 0.13);
    },
    pop()    { tone(700, 0, 0.07, "square", 0.07); tone(1150, 0.05, 0.09, "square", 0.06); },
    flip()   { tone(520, 0, 0.06, "triangle", 0.08); },
    sticker(){ tone(880, 0, 0.08, "sine", 0.13); tone(1318.5, 0.07, 0.13, "sine", 0.11); },
  };

  // Unlock audio on the first touch anywhere.
  document.addEventListener("pointerdown", function unlock() {
    audio();
    document.removeEventListener("pointerdown", unlock);
  });

  /* ------------------------------ fx ------------------------------ */

  const fx = $("#fx");

  function confetti(count) {
    const colors = ["#ff6b9d", "#ffd93d", "#6bcb77", "#4d96ff", "#ff9f43", "#a78bfa"];
    for (let i = 0; i < (count || 22); i++) {
      const isEmoji = i % 4 === 3;
      const p = el("span", "confetti" + (isEmoji ? " emoji" : ""),
        isEmoji ? CONFETTI_EMOJI[(Math.random() * CONFETTI_EMOJI.length) | 0] : "");
      p.style.left = (5 + Math.random() * 90) + "vw";
      if (!isEmoji) {
        p.style.background = colors[(Math.random() * colors.length) | 0];
        if (Math.random() < 0.4) p.style.borderRadius = "50%";
      }
      p.style.animationDuration = (0.9 + Math.random() * 0.8) + "s";
      p.style.animationDelay = (Math.random() * 0.35) + "s";
      fx.appendChild(p);
      setTimeout(() => p.remove(), 2400);
    }
  }

  function toast(msg) {
    fx.querySelectorAll(".toast").forEach(t => t.remove());
    const t = el("div", "toast", msg);
    fx.appendChild(t);
    setTimeout(() => t.remove(), 1600);
  }

  /* ------------------------------ stickers ------------------------------ */

  function stickerCount() {
    return Object.keys(stickers).filter(k => stickers[k]).length;
  }

  function award(letter) {
    if (stickers[letter]) return false;
    stickers[letter] = true;
    LS.set("stickers", stickers);
    snd.sticker();
    const item = byLetter(letter);
    toast(`⭐ New sticker! ${item ? item.emoji : ""} ${letter}`);
    confetti(10);
    return true;
  }

  /* ------------------------------ difficulty ------------------------------ */

  const MAX_LEVEL = { find: 2, matchPic: 2, matchCase: 2, memory: 3 };
  const streaks = {};
  const misses = {};

  function levelOf(g) { const v = levels[g]; return typeof v === "number" ? v : 0; }

  function noteCorrect(g) {
    streaks[g] = (streaks[g] || 0) + 1;
    misses[g] = 0;
    if (streaks[g] >= 3 && levelOf(g) < MAX_LEVEL[g]) {
      levels[g] = levelOf(g) + 1;
      LS.set("levels", levels);
      streaks[g] = 0;
      snd.fanfare();
      toast("🌟 Level up!");
    }
  }

  function noteWrong(g) {
    streaks[g] = 0;
    misses[g] = (misses[g] || 0) + 1;
    if (misses[g] >= 3 && levelOf(g) > 0) {
      levels[g] = levelOf(g) - 1;
      LS.set("levels", levels);
      misses[g] = 0;
    }
  }

  function levelStars(g) {
    const wrap = el("div", "level-stars");
    const total = MAX_LEVEL[g] + 1;
    for (let i = 0; i < total; i++) {
      wrap.appendChild(el("span", "star" + (i <= levelOf(g) ? " on" : ""), i <= levelOf(g) ? "⭐" : "☆"));
    }
    return wrap;
  }

  /* ------------------------------ navigation ------------------------------ */

  const screenRoot = $("#screen");
  const titleEl = $("#title");
  const backBtn = $("#backBtn");

  let current = "home";

  function go(name, arg) {
    token++;
    stopBgMusic();
    try { if ("speechSynthesis" in window) speechSynthesis.cancel(); } catch (e) {}
    current = name;
    screenRoot.innerHTML = "";
    backBtn.classList.toggle("hidden", name === "home" || name === "auth" || name === "forgot" || name === "reset");
    VIEWS[name](arg);
    window.scrollTo(0, 0);
  }

  backBtn.addEventListener("click", () => {
    snd.pop();
    if (current === "poemReader") go("poems");
    else if (current === "auth") go(serverMode ? "home" : "home");
    else go("home");
  });

  /* ------------------------------ views ------------------------------ */

  const VIEWS = {};

  /* -------- home -------- */

  VIEWS.home = function () {
    titleEl.textContent = "🌈 My Alphabet Day";

    // --- hero: sun mascot + greeting + sticker progress ---
    const count = stickerCount();
    const pct = Math.round((count / 26) * 100);
    const hero = el("div", "hero", `
      <svg class="mascot-svg" viewBox="0 0 130 130" role="img" aria-label="Smiling sun">
        <defs>
          <linearGradient id="sunGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#ffe066"/>
            <stop offset="1" stop-color="#ff9f43"/>
          </linearGradient>
        </defs>
        <g stroke="#ffd93d" stroke-width="7" stroke-linecap="round">
          <line x1="65" y1="4"  x2="65" y2="18"/>
          <line x1="65" y1="112" x2="65" y2="126"/>
          <line x1="4"  y1="65" x2="18" y2="65"/>
          <line x1="112" y1="65" x2="126" y2="65"/>
          <line x1="22" y1="22" x2="32" y2="32"/>
          <line x1="98" y1="98" x2="108" y2="108"/>
          <line x1="108" y1="22" x2="98" y2="32"/>
          <line x1="32" y1="98" x2="22" y2="108"/>
        </g>
        <circle cx="65" cy="65" r="46" fill="url(#sunGrad)" stroke="#fff" stroke-width="6"/>
        <circle cx="50" cy="58" r="6.5" fill="#3b3b5c"/>
        <circle cx="80" cy="58" r="6.5" fill="#3b3b5c"/>
        <circle cx="37" cy="71" r="7" fill="#ff6b9d" opacity="0.55"/>
        <circle cx="93" cy="71" r="7" fill="#ff6b9d" opacity="0.55"/>
        <path d="M49 78 Q65 93 81 78" stroke="#3b3b5c" stroke-width="5.5" fill="none" stroke-linecap="round"/>
      </svg>
      <div class="hero-text">
        <div class="hero-title">Let's learn the alphabet!</div>
        <div class="hero-sub">${activeProfile
          ? "Hi " + escapeHtml(activeProfile.name) + "! Pick a game below 👇"
          : "Pick a game below 👇"}</div>
      </div>`);

    const progress = el("div", "mini-progress", `
      <div class="mini-bar"><div class="mini-fill" style="width:${pct}%"></div></div>
      <span class="mini-label">⭐ ${count}/26</span>`);

    const grid = el("div", "mode-grid");

    const modes = [
      { id: "learn",     emoji: "📖", label: "Learn Letters" },
      { id: "find",      emoji: "🔊", label: "Find It" },
      { id: "matchPic",  emoji: "🍎", label: "Picture Match" },
      { id: "matchCase", emoji: "🔤", label: "Letter Match" },
      { id: "memory",    emoji: "🃏", label: "Memory Fun" },
      { id: "fruits",     emoji: "🍎", label: "Fruits" },
      { id: "vegetables", emoji: "🥕", label: "Vegetables" },
      { id: "colors",     emoji: "🎨", label: "Colors" },
      { id: "coloring",  emoji: "🎨", label: "Coloring Fun" },
      { id: "stickers",  emoji: "⭐", label: "Sticker Book", badge: count + " / 26" },
      { id: "poems",     emoji: "📝", label: "Poems" },
    ];

    modes.forEach(m => {
      const b = el(
        "button",
        "mode-btn",
        `<span class="m-emoji">${m.emoji}</span><span>${m.label}</span>` +
        (m.badge ? `<span class="badge">⭐ ${m.badge}</span>` : "")
      );
      b.addEventListener("click", () => { snd.pop(); go(m.id); });
      grid.appendChild(b);
    });

    const tip = el("div", "parent-tip", "Grown-up tip: press and hold ⚙️ for settings");
    screenRoot.append(hero, progress, grid, tip);
  };

  /* -------- profile picker (server mode) -------- */

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, c =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }

  VIEWS.auth = function (mode) {
    mode = mode || "login";
    titleEl.textContent = mode === "login" ? "🔑 Login" : "📝 Sign Up";

    const wrap = el("div", "auth-wrap");

    if (mode === "login") {
      const box = el("div", "auth-box", `
        <h2>Welcome back! 👋</h2>
        <input class="auth-input" type="email" id="authEmail" placeholder="Email" autocomplete="email">
        <input class="auth-input" type="password" id="authPass" placeholder="Password" autocomplete="current-password">
        <label class="auth-remember"><input type="checkbox" id="authRemember"> Remember me</label>
        <button class="p-btn auth-submit" id="authLoginBtn">🔑 Login</button>
        <p class="auth-switch"><a href="#" id="forgotPassLink">Forgot password?</a> · <a href="#" id="switchToSignup">Sign up</a></p>
        <button class="p-btn plain auth-guest" id="authGuestBtn">👤 Continue as Guest</button>
      `);
      wrap.appendChild(box);

      screenRoot.appendChild(wrap);

      const emailInput = box.querySelector("#authEmail");
      const passInput = box.querySelector("#authPass");

      box.querySelector("#authLoginBtn").addEventListener("click", async () => {
        const email = emailInput.value.trim();
        const password = passInput.value;
        if (!email || !password) {
          toast("⚠️ Enter email and password");
          snd.wrong();
          return;
        }
        const data = await apiCall("login", { email, password }, "POST");
        if (!data || !data.ok) {
          toast("❌ " + (data && data.error === "invalid_credentials" ? "Wrong email or password" : "Login failed"));
          snd.wrong();
          return;
        }
        await loadProfileById(data.id, data.name, data.avatar);
      });

      box.querySelector("#switchToSignup").addEventListener("click", (e) => {
        e.preventDefault();
        snd.pop();
        go("auth", "signup");
      });

      const forgotLink = box.querySelector("#forgotPassLink");
      if (forgotLink) {
        forgotLink.addEventListener("click", (e) => {
          e.preventDefault();
          snd.pop();
          go("forgot");
        });
      }

      box.querySelector("#authGuestBtn").addEventListener("click", () => {
        snd.pop();
        activeProfile = null;
        stickers = LS.get("stickers", {});
        levels = LS.get("levels", {});
        go("home");
      });

      setTimeout(() => emailInput.focus(), 120);
    } else {
      let chosen = AVATARS[0];
      const box = el("div", "auth-box", `
        <h2>Create Account ✨</h2>
        <input class="auth-input" type="text" id="signupName" placeholder="Your name" maxlength="50" autocomplete="name">
        <input class="auth-input" type="email" id="signupEmail" placeholder="Email" autocomplete="email">
        <input class="auth-input" type="password" id="signupPass" placeholder="Password (min 4 chars)" autocomplete="new-password">
        <div class="avatar-picker" id="signupAvatarPicker"></div>
        <button class="p-btn auth-submit" id="signupBtn">✨ Create Account</button>
        <p class="auth-switch">Already have account? <a href="#" id="switchToLogin">Login here</a></p>
      `);
      wrap.appendChild(box);
      screenRoot.appendChild(wrap);

      const nameInput = box.querySelector("#signupName");
      const emailInput = box.querySelector("#signupEmail");
      const passInput = box.querySelector("#signupPass");
      const picker = box.querySelector("#signupAvatarPicker");

      AVATARS.forEach((a, i) => {
        const b = el("button", "avatar-opt" + (i === 0 ? " sel" : ""), a);
        b.addEventListener("click", () => {
          picker.querySelectorAll(".avatar-opt").forEach(x => x.classList.remove("sel"));
          b.classList.add("sel");
          chosen = a;
          snd.pop();
        });
        picker.appendChild(b);
      });

      box.querySelector("#signupBtn").addEventListener("click", async () => {
        const name = nameInput.value.trim();
        const email = emailInput.value.trim();
        const password = passInput.value;
        if (!name) { toast("⚠️ Enter your name"); snd.wrong(); nameInput.focus(); return; }
        if (!email) { toast("⚠️ Enter your email"); snd.wrong(); emailInput.focus(); return; }
        if (password.length < 4) { toast("⚠️ Password must be 4+ chars"); snd.wrong(); passInput.focus(); return; }

        const data = await apiCall("register", { name, email, password, avatar: chosen }, "POST");
        if (!data || !data.ok) {
          const err = data && data.error;
          const msg = err === "email_taken" ? "Email already registered" :
                      err === "bad_email" ? "Invalid email" :
                      err === "bad_password" ? "Password too short" : "Signup failed";
          toast("❌ " + msg);
          snd.wrong();
          return;
        }
        snd.fanfare();
        confetti(20);
        toast(`🎉 Welcome, ${name}!`);
        await loadProfileById(data.id, data.name, data.avatar);
      });

      box.querySelector("#switchToLogin").addEventListener("click", (e) => {
        e.preventDefault();
        snd.pop();
        go("auth", "login");
      });

      setTimeout(() => nameInput.focus(), 120);
    }

    speak(mode === "login" ? "Login to play!" : "Create your account!");
  };

  async function loadProfileById(id, name, avatar) {
    const t = token;
    const data = await apiCall("load", { id });
    if (t !== token) return;
    if (!data || !data.ok) { toast("⚠️ Could not load profile"); return; }

    activeProfile = { id: data.profile.id, name: data.profile.name, avatar: data.profile.avatar };
    stickers = data.profile.stickers || {};
    levels = data.profile.levels || {};
    speechOn = data.profile.speech_on !== false;
    LS.set("authProfile", activeProfile.id);
    updateParentUI();
    updateSidebarUI();

    snd.correct();
    speak(`Hi ${data.profile.name}! Let's play!`);
    go("home");
  }

  /* -------- forgot password -------- */

  VIEWS.forgot = function () {
    titleEl.textContent = "🔑 Forgot Password";

    const wrap = el("div", "auth-wrap");
    const box = el("div", "auth-box", `
      <h2>Reset your password</h2>
      <p style="text-align:center;font-size:14px;opacity:0.8;margin:0 0 8px">Enter your registered email to get a reset token.</p>
      <input class="auth-input" type="email" id="forgotEmail" placeholder="Email" autocomplete="email">
      <button class="p-btn auth-submit" id="forgotBtn">📧 Get Reset Token</button>
      <div id="forgotResult" class="forgot-result hidden"></div>
      <p class="auth-switch"><a href="#" id="backToLogin">Back to login</a></p>
    `);
    wrap.appendChild(box);
    screenRoot.appendChild(wrap);

    box.querySelector("#forgotBtn").addEventListener("click", async () => {
      const email = box.querySelector("#forgotEmail").value.trim();
      if (!email) { toast("⚠️ Enter your email"); snd.wrong(); return; }
      const data = await apiCall("forgot_password", { email }, "POST");
      const result = box.querySelector("#forgotResult");
      if (!data || !data.ok) {
        toast("❌ " + (data && data.error === "email_not_found" ? "Email not found" : "Failed"));
        snd.wrong();
        return;
      }
      result.classList.remove("hidden");
      result.innerHTML = `<p style="font-size:13px;word-break:break-all;margin:0">Token: <b>${data.token}</b></p><p style="font-size:12px;opacity:0.7;margin:4px 0 0">Expires: ${data.expires}</p><button class="p-btn" id="goResetBtn" style="margin-top:10px;width:100%">Reset Password →</button>`;
      snd.correct();
      toast("✅ Reset token generated");
      result.querySelector("#goResetBtn").addEventListener("click", () => {
        snd.pop();
        go("reset", data.token);
      });
    });

    box.querySelector("#backToLogin").addEventListener("click", (e) => {
      e.preventDefault();
      snd.pop();
      go("auth", "login");
    });

    setTimeout(() => box.querySelector("#forgotEmail").focus(), 120);
  };

  /* -------- reset password -------- */

  VIEWS.reset = function (token) {
    titleEl.textContent = "🔒 Reset Password";

    const wrap = el("div", "auth-wrap");
    const box = el("div", "auth-box", `
      <h2>Set new password</h2>
      <input class="auth-input" type="password" id="resetToken" placeholder="Reset token" value="${token || ''}" autocomplete="off">
      <input class="auth-input" type="password" id="resetPass" placeholder="New password (min 8 chars)" autocomplete="new-password">
      <input class="auth-input" type="password" id="resetPass2" placeholder="Confirm password" autocomplete="new-password">
      <button class="p-btn auth-submit" id="resetBtn2">🔒 Reset Password</button>
      <p class="auth-switch"><a href="#" id="backToLogin2">Back to login</a></p>
    `);
    wrap.appendChild(box);
    screenRoot.appendChild(wrap);

    box.querySelector("#resetBtn2").addEventListener("click", async () => {
      const tok = box.querySelector("#resetToken").value.trim();
      const pass = box.querySelector("#resetPass").value;
      const pass2 = box.querySelector("#resetPass2").value;
      if (!tok) { toast("⚠️ Enter reset token"); snd.wrong(); return; }
      if (pass.length < 8) { toast("⚠️ Password must be 8+ chars"); snd.wrong(); return; }
      if (pass !== pass2) { toast("⚠️ Passwords don't match"); snd.wrong(); return; }
      const data = await apiCall("reset_password", { token: tok, password: pass }, "POST");
      if (!data || !data.ok) {
        const err = data && data.error;
        const msg = err === "invalid_token" ? "Invalid token" :
                    err === "token_expired" ? "Token expired" :
                    err === "bad_password" ? "Password too short" : "Reset failed";
        toast("❌ " + msg);
        snd.wrong();
        return;
      }
      snd.correct();
      toast("✅ Password reset! Please login.");
      go("auth", "login");
    });

    box.querySelector("#backToLogin2").addEventListener("click", (e) => {
      e.preventDefault();
      snd.pop();
      go("auth", "login");
    });

    setTimeout(() => box.querySelector("#resetPass").focus(), 120);
  };

  /* -------- profile view/edit -------- */

  VIEWS.profile = function () {
    if (!activeProfile) { go("auth", "login"); return; }
    titleEl.textContent = "👤 My Profile";

    const wrap = el("div", "profile-view");
    const data = activeProfile;
    const joinedDate = new Date().toLocaleDateString();

    const card = el("div", "profile-card-view", `
      <div class="pv-avatar">${data.avatar}</div>
      <div class="pv-name">${escapeHtml(data.name)}</div>
      <div class="pv-email">${escapeHtml(data.email || '')}</div>
      <div class="pv-joined">Joined: ${joinedDate}</div>
    `);
    wrap.appendChild(card);

    const editBox = el("div", "auth-box", `
      <h2>Edit Profile</h2>
      <input class="auth-input" type="text" id="editName" placeholder="Display name" value="${escapeHtml(data.name)}">
      <div class="avatar-picker" id="editAvatarPicker"></div>
      <input class="auth-input" type="password" id="editPass" placeholder="New password (leave blank to keep)">
      <button class="p-btn auth-submit" id="editSaveBtn">💾 Save Changes</button>
    `);
    wrap.appendChild(editBox);

    let chosen = data.avatar;
    const picker = editBox.querySelector("#editAvatarPicker");
    AVATARS.forEach((a, i) => {
      const b = el("button", "avatar-opt" + (a === chosen ? " sel" : ""), a);
      b.addEventListener("click", () => {
        picker.querySelectorAll(".avatar-opt").forEach(x => x.classList.remove("sel"));
        b.classList.add("sel");
        chosen = a;
        snd.pop();
      });
      picker.appendChild(b);
    });

    editBox.querySelector("#editSaveBtn").addEventListener("click", async () => {
      const name = editBox.querySelector("#editName").value.trim();
      const password = editBox.querySelector("#editPass").value;
      if (!name) { toast("⚠️ Name required"); snd.wrong(); return; }
      const params = { id: activeProfile.id, name, avatar: chosen };
      if (password && password.length >= 8) params.password = password;
      const res = await apiCall("update_profile", params, "POST");
      if (!res || !res.ok) { toast("❌ Update failed"); snd.wrong(); return; }
      activeProfile.name = name;
      activeProfile.avatar = chosen;
      LS.set("authProfile", activeProfile.id);
      updateSidebarUI();
      snd.correct();
      toast("✅ Profile updated!");
    });

    screenRoot.appendChild(wrap);
    speak("Here is your profile. You can edit your name, avatar, or password.");
  };

  /* -------- learn -------- */

  VIEWS.learn = function () {
    titleEl.textContent = "📖 Learn the Letters";

    const grid = el("div", "grid learn-grid");
    ALPHABET.forEach((item, i) => {
      const card = el("button", "card learn-card",
        `<span class="emoji-bubble">${item.emoji}</span><span class="letter">${item.letter}</span>`);
      card.setAttribute("style", tintStyle(i));
      card.style.animationDelay = (i * 0.03) + "s";
      card.addEventListener("click", () => openLearn(item, i));
      grid.appendChild(card);
    });
    screenRoot.appendChild(grid);
  };

  function openLearn(item, tintIndex) {
    snd.pop();
    const t = tintFor(tintIndex == null ? 0 : tintIndex);

    const overlay = el("div", "overlay");
    const box = el("div", "popup", `
      <button class="close-btn" aria-label="Close">✖</button>
      <div class="learn-emoji">${item.emoji}</div>
      <div class="learn-letter">${item.letter}</div>
      <div class="learn-word">${item.word}</div>
      <div class="hint">🔊 Tap to hear it again</div>`);
    box.setAttribute("style", `--accent:${t[0]};--soft:${t[1]}`);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    const say = () => speak(`${PHONICS[item.letter] || item.letter}. ${item.letter} is for ${item.word}.`);

    box.addEventListener("click", e => {
      if (!e.target.closest(".close-btn")) say();
    });
    $(".close-btn", box).addEventListener("click", e => {
      e.stopPropagation();
      overlay.remove();
    });
    overlay.addEventListener("click", e => {
      if (e.target === overlay) overlay.remove();
    });

    award(item.letter);
    say();
  }

  /* -------- find it -------- */

  VIEWS.find = function () {
    titleEl.textContent = "🔊 Find It";
    let lastLetter = null;

    function round() {
      token++;
      const n = [3, 4, 5][Math.min(levelOf("find"), 2)];
      const target = byLetter(pickLetterAvoiding(lastLetter));
      lastLetter = target.letter;

      const others = pick(ALPHABET.filter(x => x.letter !== target.letter), n - 1);
      const choices = shuffle([target].concat(others));

      screenRoot.innerHTML = "";
      const wrap = el("div", "find-wrap");

      const promptText = `Can you find the ${target.word.toLowerCase()}? ${PHONICS[target.letter] || target.letter} for ${target.word}.`;
      const sayPrompt = () => speak(promptText);

      const ask = el("div", "ask-row");
      const avatar = el("div", "ask-avatar", AVATARS[(Math.random() * AVATARS.length) | 0]);
      const bubble = el("div", "speech-bubble");
      const repeat = el("button", "repeat-btn", "🔊");
      repeat.setAttribute("aria-label", "Hear the question again");
      repeat.addEventListener("click", () => { snd.pop(); sayPrompt(); });
      bubble.append(el("span", "prompt-text", promptText), repeat);
      ask.append(avatar, bubble);

      const grid = el("div", "choice-grid");
      let done = false;

      choices.forEach((item, idx) => {
        const card = el("button", "card",
          `<span class="emoji-bubble">${item.emoji}</span><span class="word">${item.word}</span>`);
        card.setAttribute("style", tintStyle(idx + target.letter.charCodeAt(0)));
        card.addEventListener("click", () => {
          if (done) return;
          if (item.letter === target.letter) {
            done = true;
            card.classList.add("right");
            snd.correct();
            confetti(16);
            noteCorrect("find");
            award(target.letter);
            speak(`Yes! ${item.word}!`);
            later(round, 1500);
          } else {
            wobble(card);
            snd.wrong();
            noteWrong("find");
            speak("Try again!", { throttle: true });
          }
        });
        grid.appendChild(card);
      });

      wrap.append(ask, levelStars("find"), grid);
      screenRoot.appendChild(wrap);
      sayPrompt();
    }

    round();
  };

  /* -------- matching (picture & letter-case) -------- */

  function startMatch(mode) {
    const isPic = mode === "matchPic";
    titleEl.textContent = isPic ? "🍎 Picture Match" : "🔤 Letter Match";
    const inst = isPic
      ? "Match each letter to its picture!"
      : "Match the big letter to the small letter!";

    function round() {
      token++;
      const n = [3, 4, 5][Math.min(levelOf(mode), 2)];
      const letters = pick(ALPHABET, n);

      const rights = shuffle(letters.map(l => ({
        letter: l.letter,
        face: isPic ? l.emoji : l.letter.toLowerCase(),
        word: l.word,
        isEmoji: isPic,
      })));

      screenRoot.innerHTML = "";
      const wrap = el("div", "match-wrap");

      const head = el("div", "match-head");
      const instBtn = el("button", "repeat-btn small", "🔊");
      instBtn.setAttribute("aria-label", "Hear the instructions again");
      instBtn.addEventListener("click", () => { snd.pop(); speak(inst); });
      head.append(instBtn, levelStars(mode));

      const board = el("div", "match-board");
      const leftCol = el("div", "match-col");
      const rightCol = el("div", "match-col");
      const leftWrap = el("div", "match-col-wrap");
      const rightWrap = el("div", "match-col-wrap");
      leftWrap.append(el("div", "col-chip", "🔤"), leftCol);
      rightWrap.append(el("div", "col-chip", isPic ? "🖼️" : "abc"), rightCol);

      let selected = null;
      let matchedCount = 0;
      let done = false;

      letters.forEach(l => {
        const card = el("button", "card left-card", `<span>${l.letter}</span>`);
        card.dataset.pair = l.letter;
        card.addEventListener("click", () => {
          if (done || card.classList.contains("matched")) return;
          if (selected === card) {
            card.classList.remove("selected");
            selected = null;
            return;
          }
          if (selected) selected.classList.remove("selected");
          selected = card;
          card.classList.add("selected");
          snd.pop();
          speak(`${PHONICS[l.letter] || l.letter}. ${l.letter}`);
        });
        leftCol.appendChild(card);
      });

      rights.forEach(r => {
        const inner = r.isEmoji
          ? `<span class="pair-emoji">${r.face}</span>`
          : `<span class="lower">${r.face}</span>`;
        const card = el("button", "card right-card", inner);
        card.dataset.pair = r.letter;

        card.addEventListener("click", () => {
          if (done || card.classList.contains("matched")) return;

          if (!selected) {
            wobble(card);
            snd.wrong();
            speak("Tap a letter first!", { throttle: true });
            return;
          }

          if (selected.dataset.pair === card.dataset.pair) {
            const left = selected;
            selected = null;
            left.classList.remove("selected");
            left.classList.add("matched");
            card.classList.add("matched");
            matchedCount++;

            snd.correct();
            confetti(8);
            noteCorrect(mode);
            award(r.letter);
            speak(isPic ? r.word : `${PHONICS[r.letter] || r.letter}. ${r.letter}`);

            if (matchedCount === n) {
              done = true;
              later(() => { snd.fanfare(); confetti(30); speak("Well done!"); }, 350);
              later(round, 1900);
            }
          } else {
            const left = selected;
            selected = null;
            left.classList.remove("selected");
            wobble(left);
            wobble(card);
            snd.wrong();
            noteWrong(mode);
            speak("Try again!", { throttle: true });
          }
        });

        rightCol.appendChild(card);
      });

      board.append(leftWrap, rightWrap);
      wrap.append(head, board);
      screenRoot.appendChild(wrap);
      speak(inst);
    }

    round();
  }

  VIEWS.matchPic = function () { startMatch("matchPic"); };
  VIEWS.matchCase = function () { startMatch("matchCase"); };

  /* -------- memory -------- */

  VIEWS.memory = function () {
    titleEl.textContent = "🃏 Memory Fun";

    const configs = [
      { pairs: 4, type: "emoji" },
      { pairs: 6, type: "emoji" },
      { pairs: 4, type: "lp" },   // letter <-> picture pairs
      { pairs: 6, type: "lp" },
    ];

    function round() {
      token++;
      const cfg = configs[Math.min(levelOf("memory"), configs.length - 1)];
      const letters = pick(ALPHABET, cfg.pairs);

      let cards = [];
      letters.forEach(l => {
        if (cfg.type === "emoji") {
          cards.push({ match: l.letter, face: l.emoji, letter: l.letter });
          cards.push({ match: l.letter, face: l.emoji, letter: l.letter });
        } else {
          cards.push({ match: l.letter, face: l.letter, letter: l.letter });
          cards.push({ match: l.letter, face: l.emoji, letter: l.letter });
        }
      });
      cards = shuffle(cards);

      screenRoot.innerHTML = "";
      const wrap = el("div", "mem-wrap");
      wrap.appendChild(levelStars("memory"));

      const grid = el("div", "memory-grid");

      let flipped = [];
      let lock = false;
      let found = 0;
      let done = false;

      cards.forEach((data, i) => {
        const btn = el("button", "mem-card", `
          <span class="mem-inner">
            <span class="mem-face mem-back">⭐</span>
            <span class="mem-face mem-front">${data.face}</span>
          </span>`);
        btn.style.setProperty("--rot", (((i * 37) % 7) - 3) + "deg");

        btn.addEventListener("click", () => {
          if (done || lock) return;
          if (btn.classList.contains("flipped") || btn.classList.contains("done")) return;

          btn.classList.add("flipped");
          snd.flip();
          flipped.push({ btn, data });

          if (flipped.length === 2) {
            lock = true;
            const a = flipped[0];
            const b = flipped[1];

            if (a.data.match === b.data.match) {
              later(() => {
                a.btn.classList.add("done");
                b.btn.classList.add("done");
                snd.correct();
                award(a.data.letter);
                found++;
                flipped = [];
                lock = false;
                if (found === cfg.pairs) {
                  done = true;
                  snd.fanfare();
                  confetti(30);
                  speak("Well done! You found them all!");
                  later(round, 2300);
                }
              }, 420);
            } else {
              later(() => {
                a.btn.classList.remove("flipped");
                b.btn.classList.remove("flipped");
                snd.wrong();
                flipped = [];
                lock = false;
              }, 950);
            }
          }
        });

        grid.appendChild(btn);
      });

      wrap.appendChild(grid);
      screenRoot.appendChild(wrap);
      speak(cfg.type === "emoji"
        ? "Find the matching pairs!"
        : "Find the letter and its picture!");
    }

    round();
  };

  /* -------- fruits -------- */

  VIEWS.fruits = function () {
    titleEl.textContent = "🍎 Fruits";

    const wrap = el("div", "fv-wrap");
    const grid = el("div", "fv-grid");

    FRUITS.forEach((item, i) => {
      const card = el("button", "fv-card", `
        <span class="fv-emoji">${item.emoji}</span>
        <span class="fv-name">${item.name}</span>
      `);
      card.style.animationDelay = (i * 0.04) + "s";
      card.addEventListener("click", () => {
        snd.pop();
        speak(item.name);
        toast(`${item.emoji} ${item.name}`);
        confetti(5);
      });
      grid.appendChild(card);
    });

    wrap.appendChild(grid);
    screenRoot.appendChild(wrap);
    speak("Tap a fruit to hear its name!");
  };

  /* -------- vegetables -------- */

  VIEWS.vegetables = function () {
    titleEl.textContent = "🥕 Vegetables";

    const wrap = el("div", "fv-wrap");
    const grid = el("div", "fv-grid");

    VEGETABLES.forEach((item, i) => {
      const card = el("button", "fv-card", `
        <span class="fv-emoji">${item.emoji}</span>
        <span class="fv-name">${item.name}</span>
      `);
      card.style.animationDelay = (i * 0.04) + "s";
      card.addEventListener("click", () => {
        snd.pop();
        speak(item.name);
        toast(`${item.emoji} ${item.name}`);
        confetti(5);
      });
      grid.appendChild(card);
    });

    wrap.appendChild(grid);
    screenRoot.appendChild(wrap);
    speak("Tap a vegetable to hear its name!");
  };

  /* -------- colors -------- */

  VIEWS.colors = function () {
    titleEl.textContent = "🎨 Colors";

    const COLORS = [
      { name: "Red",    hex: "#ff3b30", emoji: "🔴" },
      { name: "Orange", hex: "#ff9500", emoji: "🟠" },
      { name: "Yellow", hex: "#ffcc00", emoji: "🟡" },
      { name: "Green",  hex: "#34c759", emoji: "🟢" },
      { name: "Blue",   hex: "#007aff", emoji: "🔵" },
      { name: "Purple", hex: "#af52de", emoji: "🟣" },
      { name: "Pink",   hex: "#ff2d55", emoji: "🩷" },
      { name: "Brown",  hex: "#8b5a2b", emoji: "🟤" },
      { name: "Black",  hex: "#000000", emoji: "⚫" },
      { name: "White",  hex: "#ffffff", emoji: "⚪" },
    ];

    const wrap = el("div", "colors-wrap");
    const grid = el("div", "colors-grid");

    COLORS.forEach((c, i) => {
      const card = el("button", "color-card", `
        <span class="color-swatch-big" style="background:${c.hex}"></span>
        <span class="color-name">${c.name}</span>
        <span class="color-emoji">${c.emoji}</span>
      `);
      card.style.animationDelay = (i * 0.05) + "s";
      card.addEventListener("click", () => {
        snd.pop();
        speak(c.name);
        toast(`${c.emoji} ${c.name}`);
        confetti(8);
      });
      grid.appendChild(card);
    });

    wrap.appendChild(grid);
    screenRoot.appendChild(wrap);
    speak("Tap a color to hear its name!");
  };

  /* -------- coloring -------- */

  VIEWS.coloring = function () {
    titleEl.textContent = "🎨 Coloring Fun";

    const colors = ["#ff3b30", "#ff9500", "#ffcc00", "#34c759", "#007aff", "#af52de", "#ff2d55", "#8b5a2b", "#000000", "#ffffff"];
    let selectedColor = colors[0];
    let items = pick(FRUITS_VEGGIES, 6);

    const wrap = el("div", "coloring-wrap");

    const palette = el("div", "color-palette");
    colors.forEach((c, i) => {
      const swatch = el("button", "color-swatch" + (i === 0 ? " sel" : ""), "");
      swatch.style.background = c;
      swatch.addEventListener("click", () => {
        palette.querySelectorAll(".color-swatch").forEach(s => s.classList.remove("sel"));
        swatch.classList.add("sel");
        selectedColor = c;
        snd.pop();
      });
      palette.appendChild(swatch);
    });
    wrap.appendChild(palette);

    const grid = el("div", "coloring-grid");
    items.forEach((item, idx) => {
      const card = el("div", "coloring-card", `
        <div class="coloring-emoji" data-idx="${idx}">${item.emoji}</div>
        <div class="coloring-name">${item.name}</div>
      `);
      const emojiEl = card.querySelector(".coloring-emoji");
      emojiEl.addEventListener("click", () => {
        emojiEl.style.filter = `drop-shadow(0 0 0 ${selectedColor}) hue-rotate(0deg)`;
        emojiEl.style.background = selectedColor;
        emojiEl.style.borderRadius = "50%";
        emojiEl.style.padding = "8px";
        snd.pop();
        toast(`🎨 ${item.name} colored!`);
      });
      grid.appendChild(card);
    });
    wrap.appendChild(grid);

    const hint = el("div", "coloring-hint", "👆 Pick a color, then tap a fruit or vegetable to color it!");
    wrap.appendChild(hint);

    screenRoot.appendChild(wrap);
    speak("Pick a color and tap to color the fruits and vegetables!");
  };

  /* -------- sticker book -------- */

  VIEWS.stickers = function () {
    titleEl.textContent = "⭐ Sticker Book";

    const wrap = el("div", "sticker-wrap");
    const count = stickerCount();
    wrap.appendChild(el("div", "progress-wrap", `
      <div class="progress-label">⭐ ${count} of 26 stickers</div>
      <div class="progress-bar"><div class="progress-fill" style="width:${Math.round((count / 26) * 100)}%"></div></div>`));

    const grid = el("div", "sticker-grid");
    ALPHABET.forEach((item, i) => {
      const got = !!stickers[item.letter];
      const cell = el("button", "sticker" + (got ? "" : " locked"),
        `<span class="s-emoji">${item.emoji}</span><span class="s-letter">${item.letter}</span>`);
      cell.setAttribute("style", tintStyle(i));

      if (got) {
        cell.addEventListener("click", () => {
          snd.pop();
          speak(`${PHONICS[item.letter] || item.letter}. ${item.letter} is for ${item.word}!`);
        });
      } else {
        cell.addEventListener("click", () => {
          wobble(cell);
          speak("Play a game to earn me!", { throttle: true });
        });
      }
      grid.appendChild(cell);
    });

    wrap.appendChild(grid);
    screenRoot.appendChild(wrap);
  };

  /* -------- poems -------- */

  VIEWS.poems = function () {
    titleEl.textContent = "📝 Poems";

    const wrap = el("div", "poem-list");
    POEMS.forEach((p, i) => {
      const card = el("button", "poem-card", `
        <span class="poem-emoji">${p.emoji}</span>
        <span class="poem-texts">
          <span class="poem-title">${p.title}</span>
          <span class="poem-meta">${p.lines.length} lines · tap to listen</span>
        </span>`);
      card.setAttribute("style", tintStyle(i) + `;animation-delay:${(i * 0.04).toFixed(2)}s`);
      card.addEventListener("click", () => { snd.pop(); go("poemReader", p.id); });
      wrap.appendChild(card);
    });

    screenRoot.appendChild(wrap);
  };

  let audioCtx = null;
  let bgMusicGain = null;
  let bgMusicNodes = [];

  function getAudioCtx() {
    if (!audioCtx) {
      try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {}
    }
    return audioCtx;
  }

  function playBgMusic(duration) {
    const ctx = getAudioCtx();
    if (!ctx) return;
    stopBgMusic();
    // Simple gentle melody (C major pentatonic)
    const notes = [261.63, 293.66, 329.63, 392.00, 440.00, 392.00, 329.63, 293.66];
    const noteLen = 0.4;
    const totalNotes = Math.ceil(duration / noteLen) + 4;
    bgMusicGain = ctx.createGain();
    bgMusicGain.gain.value = 0.08;
    bgMusicGain.connect(ctx.destination);

    for (let i = 0; i < totalNotes; i++) {
      const osc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = notes[i % notes.length];
      noteGain.gain.value = 0;
      noteGain.gain.setValueAtTime(0, ctx.currentTime + i * noteLen);
      noteGain.gain.linearRampToValueAtTime(0.15, ctx.currentTime + i * noteLen + 0.05);
      noteGain.gain.linearRampToValueAtTime(0, ctx.currentTime + i * noteLen + noteLen - 0.05);
      osc.connect(noteGain);
      noteGain.connect(bgMusicGain);
      osc.start(ctx.currentTime + i * noteLen);
      osc.stop(ctx.currentTime + i * noteLen + noteLen);
      bgMusicNodes.push(osc);
    }
  }

  function stopBgMusic() {
    bgMusicNodes.forEach(n => { try { n.stop(); } catch (e) {} });
    bgMusicNodes = [];
    if (bgMusicGain) { try { bgMusicGain.disconnect(); } catch (e) {} bgMusicGain = null; }
  }

  function pickVoice() {
    const en = voices.filter(v => v.lang && /^en/i.test(v.lang));
    // Prefer natural/neural voices
    const preferred = en.find(v => /natural|neural|premium|enhanced|google|microsoft/i.test(v.name || ""));
    if (preferred) return preferred;
    const female = en.find(v => /samantha|zira|aria|jenny|female|susan/i.test(v.name || ""));
    if (female) return female;
    return en[0] || null;
  }

  function readFullPoem(poem) {
    readToken++;
    const rt = readToken;
    if ("speechSynthesis" in window) { try { speechSynthesis.cancel(); } catch (e) {} }
    document.querySelectorAll(".poem-line.active").forEach(n => n.classList.remove("active"));
    if (!speechOn || !("speechSynthesis" in window)) return;
    try {
      // Read line by line with expression and pauses for a natural poem feel
      const lines = poem.lines;
      let i = 0;
      const speakLine = () => {
        if (rt !== readToken || current !== "poemReader") { stopBgMusic(); return; }
        if (i >= lines.length) {
          stopBgMusic();
          toast("🎉 The end!");
          return;
        }
        // Highlight current line
        const nodes = document.querySelectorAll(".poem-line");
        nodes.forEach(n => n.classList.remove("active"));
        if (nodes[i]) nodes[i].classList.add("active");

        // Add dramatic pause for line endings
        const line = lines[i];
        const u = new SpeechSynthesisUtterance(line);
        u.rate = 0.75;  // slower for expressive reading
        u.pitch = 1.08;
        u.volume = 1.0;
        const chosen = pickVoice();
        if (chosen) u.voice = chosen;

        // Add pause after line (longer for end of stanza)
        const isLastLine = (i === lines.length - 1);
        const pauseMs = isLastLine ? 800 : 400;

        u.onend = () => {
          if (rt !== readToken) return;
          setTimeout(() => {
            i++;
            speakLine();
          }, pauseMs);
        };
        u.onerror = () => {
          if (rt !== readToken) return;
          setTimeout(() => {
            i++;
            speakLine();
          }, pauseMs);
        };

        // Estimate duration for bg music
        if (i === 0) {
          const estDuration = lines.reduce((sum, l) => sum + l.length * 80, 0) / 0.75;
          playBgMusic(estDuration / 1000);
        }

        speechSynthesis.speak(u);
      };
      speakLine();
      toast("🎵 Reading poem with expression...");
    } catch (e) { stopBgMusic(); }
  }

  // Karaoke-style reading: highlight each line while it is spoken.
  // Auto-reads the whole poem line by line; tapping a line jumps to it.
  let readToken = 0;

  function readPoem(lines, from) {
    stopBgMusic();
    readToken++;
    const rt = readToken;
    if ("speechSynthesis" in window) { try { speechSynthesis.cancel(); } catch (e) {} }
    document.querySelectorAll(".poem-line.active").forEach(n => n.classList.remove("active"));
    if (!speechOn || !("speechSynthesis" in window) || !lines || !lines.length) return;

    let i = Math.max(0, Math.min(from || 0, lines.length - 1));

    const step = () => {
      if (rt !== readToken || current !== "poemReader") return;
      const nodes = document.querySelectorAll(".poem-line");
      nodes.forEach(n => n.classList.remove("active"));
      if (nodes[i]) nodes[i].classList.add("active");
      try {
        const u = new SpeechSynthesisUtterance(lines[i]);
        u.rate = 0.8;
        u.pitch = 1.08;
        const chosen = pickVoice();
        if (chosen) u.voice = chosen;
        let advanced = false;
        const advance = () => {
          if (advanced) return;
          advanced = true;
          if (rt !== readToken) return;
          // Small pause between lines for rhythm
          setTimeout(() => {
            if (rt !== readToken || current !== "poemReader") return;
            i++;
            if (i < lines.length) step();
            else toast("🎉 The end!");
          }, 250);
        };
        u.onend = advance;
        u.onerror = advance;
        const estMs = Math.max(1800, lines[i].length * 75);
        setTimeout(() => { if (!advanced && rt === readToken) advance(); }, estMs);
        speechSynthesis.speak(u);
      } catch (e) {
        setTimeout(() => {
          if (rt !== readToken) return;
          i++;
          if (i < lines.length) step();
          else toast("🎉 The end!");
        }, 2000);
      }
    };
    step();
  }

  VIEWS.poemReader = function (id) {
    const poem = POEMS.find(p => p.id === id) || POEMS[0];
    titleEl.textContent = poem.title;

    const wrap = el("div", "poem-reader");

    const head = el("div", "reader-head");
    const playLine = el("button", "repeat-btn", "🔊");
    playLine.setAttribute("aria-label", "Read line by line");
    playLine.addEventListener("click", () => { snd.pop(); readPoem(poem.lines, 0); });
    const playAll = el("button", "repeat-btn", "🎵");
    playAll.setAttribute("aria-label", "Read the whole poem at once");
    playAll.style.marginLeft = "8px";
    playAll.addEventListener("click", () => {
      snd.pop();
      readFullPoem(poem);
    });
    head.append(playLine, playAll, el("div", "reader-title", `${poem.emoji} ${poem.title}`));

    const linesBox = el("div", "poem-lines");
    poem.lines.forEach((line, idx) => {
      const ln = el("div", "poem-line", line);
      ln.addEventListener("click", () => readPoem(poem.lines, idx));
      linesBox.appendChild(ln);
    });

    const hint = el("div", "reader-hint", speechOn
      ? "🎵 Auto-reading with expression… tap 🔊 for line-by-line"
      : "Speech is off — hold ⚙️ for 3 seconds to turn it on");

    wrap.append(head, linesBox, hint);
    screenRoot.appendChild(wrap);
    // Auto-read the full poem on open
    if (speechOn) readFullPoem(poem);
  };

  /* ------------------------------ parent gate ------------------------------ */

  const parentBtn = $("#parentBtn");
  const parentModal = $("#parentModal");
  const speechToggle = $("#speechToggle");
  const resetBtn = $("#resetBtn");
  const closeParent = $("#closeParent");
  const switchBtn = $("#switchBtn");

  let holdTimer = null;

  function updateParentUI() {
    speechToggle.textContent = speechOn ? "🔊 Speech: On" : "🔇 Speech: Off";
    switchBtn.classList.toggle("hidden", !serverMode || !activeProfile);
    if (typeof updateSidebarUI === "function") updateSidebarUI();
  }

  switchBtn.addEventListener("click", async () => {
    closeParentModal();
    await saveNow();
    go("auth", "login");
  });

  function openParent() {
    updateParentUI();
    parentModal.classList.remove("hidden");
    snd.pop();
  }

  function closeParentModal() {
    parentModal.classList.add("hidden");
  }

  parentBtn.addEventListener("pointerdown", () => {
    parentBtn.classList.add("holding");
    holdTimer = setTimeout(() => {
      holdTimer = null;
      parentBtn.classList.remove("holding");
      openParent();
    }, 3000);
  });

  ["pointerup", "pointerleave", "pointercancel"].forEach(ev => {
    parentBtn.addEventListener(ev, () => {
      parentBtn.classList.remove("holding");
      if (holdTimer) { clearTimeout(holdTimer); holdTimer = null; }
    });
  });

  speechToggle.addEventListener("click", () => {
    speechOn = !speechOn;
    LS.set("speechOn", speechOn);
    updateParentUI();
    if (speechOn) speak("Hello!");
    else try { speechSynthesis.cancel(); } catch (e) {}
  });

  resetBtn.addEventListener("click", () => {
    if (confirm("Reset all stickers and difficulty levels? This cannot be undone.")) {
      LS.del("stickers");
      LS.del("levels");
      stickers = {};
      levels = {};
      Object.keys(streaks).forEach(k => delete streaks[k]);
      Object.keys(misses).forEach(k => delete misses[k]);
      scheduleSave(); // push the cleared state to the database too
      closeParentModal();
      toast("🧹 Progress reset");
      go("home");
    }
  });

  closeParent.addEventListener("click", closeParentModal);

  /* ------------------------------ sidebar ------------------------------ */

  const menuBtn = $("#menuBtn");
  const sidebar = $("#sidebar");
  const sidebarOverlay = $("#sidebarOverlay");
  const sidebarClose = $("#sidebarClose");
  const sidebarAvatar = $("#sidebarAvatar");
  const sidebarName = $("#sidebarName");
  const sidebarStatus = $("#sidebarStatus");
  const sidebarLogin = $("#sidebarLogin");
  const sidebarLogout = $("#sidebarLogout");
  const sidebarSpeech = $("#sidebarSpeech");
  const sidebarReset = $("#sidebarReset");

  function openSidebar() {
    updateSidebarUI();
    sidebar.classList.remove("hidden");
    sidebarOverlay.classList.remove("hidden");
    snd.pop();
  }
  function closeSidebar() {
    sidebar.classList.add("hidden");
    sidebarOverlay.classList.add("hidden");
  }

  function updateSidebarUI() {
    if (activeProfile) {
      sidebarAvatar.textContent = activeProfile.avatar;
      sidebarName.textContent = activeProfile.name;
      sidebarStatus.textContent = serverMode ? "Logged in" : "Guest mode";
      sidebarLogin.classList.add("hidden");
      sidebarLogout.classList.remove("hidden");
    } else {
      sidebarAvatar.textContent = "👤";
      sidebarName.textContent = "Guest";
      sidebarStatus.textContent = serverMode ? "Not logged in" : "Offline mode";
      sidebarLogin.classList.remove("hidden");
      sidebarLogout.classList.add("hidden");
    }
    sidebarSpeech.textContent = speechOn ? "🔊 Speech: On" : "🔇 Speech: Off";
  }

  menuBtn.addEventListener("click", openSidebar);
  sidebarClose.addEventListener("click", closeSidebar);
  sidebarOverlay.addEventListener("click", closeSidebar);

  sidebarLogin.addEventListener("click", () => {
    closeSidebar();
    if (serverMode) {
      saveNow();
      go("auth", "login");
    } else {
      toast("👤 Guest mode — no login available offline");
    }
  });

  sidebarLogout.addEventListener("click", async () => {
    closeSidebar();
    await saveNow();
    activeProfile = null;
    LS.del("authProfile");
    stickers = LS.get("stickers", {});
    levels = LS.get("levels", {});
    speechOn = LS.get("speechOn", true);
    updateParentUI();
    updateSidebarUI();
    toast("🚪 Logged out");
    go(serverMode ? "auth" : "home");
  });

  sidebarSpeech.addEventListener("click", () => {
    speechOn = !speechOn;
    LS.set("speechOn", speechOn);
    updateParentUI();
    updateSidebarUI();
    sidebarSpeech.textContent = speechOn ? "🔊 Speech: On" : "🔇 Speech: Off";
  });

  sidebarReset.addEventListener("click", () => {
    if (confirm("Reset all stickers and difficulty levels? This cannot be undone.")) {
      LS.del("stickers");
      LS.del("levels");
      stickers = {};
      levels = {};
      Object.keys(streaks).forEach(k => delete streaks[k]);
      Object.keys(misses).forEach(k => delete misses[k]);
      scheduleSave();
      closeSidebar();
      toast("🧹 Progress reset");
      go("home");
    }
  });

  // sidebar nav links
  document.querySelectorAll(".sidebar-link").forEach(btn => {
    btn.addEventListener("click", () => {
      const view = btn.getAttribute("data-go");
      closeSidebar();
      if (view === "stickers") go("stickers");
      else if (view === "poems") go("poems");
      else if (view === "coloring") go("coloring");
      else if (view === "profile") go("profile");
      else if (view === "fruits") go("fruits");
      else if (view === "vegetables") go("vegetables");
      else if (view === "colors") go("colors");
      else go("home");
    });
  });
  parentModal.addEventListener("click", e => {
    if (e.target === parentModal) closeParentModal();
  });

  document.addEventListener("keydown", e => {
    if (e.key !== "Escape") return;
    if (!parentModal.classList.contains("hidden")) { closeParentModal(); return; }
    const overlay = document.querySelector(".overlay");
    if (overlay) overlay.remove();
  });

  /* ------------------------------ start ------------------------------ */

  async function boot() {
    initBg();
    const ping = await apiCall("ping");
    serverMode = !!(ping && ping.ok);
    if (serverMode) {
      // Check if user was previously logged in
      const savedId = LS.get("authProfile", null);
      if (savedId) {
        const data = await apiCall("load", { id: savedId });
        if (data && data.ok) {
          activeProfile = { id: data.profile.id, name: data.profile.name, avatar: data.profile.avatar };
          stickers = data.profile.stickers || {};
          levels = data.profile.levels || {};
          speechOn = data.profile.speech_on !== false;
          updateParentUI();
          updateSidebarUI();
          go("home");
          return;
        }
      }
      go("auth", "login");
    } else {
      go("home");
    }
  }

  // flush pending progress right before the page is hidden or closed
  window.addEventListener("pagehide", () => { saveNow(); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") saveNow();
  });

  boot();
})();
