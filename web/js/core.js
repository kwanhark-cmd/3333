/* 화면 공통: API 연결, 화면 이동, 알림, 확인 창, 설정 적용, 오류 처리 */
(function () {
  "use strict";
  const App = (window.App = {});
  App.routes = [];
  App.settings = {};
  App.user = localStorage.getItem("hd_user") || "default";
  App.base = localStorage.getItem("hd_base") || ""; // 데스크톱·휴대폰 포장 앱에서 PC 주소

  // ---- DOM 만들기(사용자 글자는 항상 글자로만 넣어 안전) ----
  App.h = function (tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v === null || v === undefined || v === false) continue;
      if (k === "class") el.className = v;
      else if (k === "text") el.textContent = v;
      else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    for (const kid of kids.flat()) {
      if (kid === null || kid === undefined || kid === false) continue;
      el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return el;
  };
  const h = App.h;
  App.icon = (name, cls = "ico") => h("img", { class: cls, src: `assets/emoji/${name}.webp`, alt: "", width: 72, height: 72, loading: "lazy" });
  App.mascot = (mood = "hello", cls = "mascot") => h("img", { class: cls, src: `assets/mascot/${mood}.svg`, alt: "비서", width: 120, height: 120 });
  App.btn = (label, onclick, cls = "btn-primary", icon = null, extra = {}) =>
    h("button", { class: `btn ${cls}`, type: "button", onclick, ...extra }, icon ? App.icon(icon) : null, label);
  App.link = (label, href, cls = "btn-primary", icon = null) => h("a", { class: `btn ${cls}`, href }, icon ? App.icon(icon) : null, label);

  // ---- 서버 연결 ----
  App.url = (path) => App.base + path;
  App.api = async function (path, opts = {}) {
    const init = { method: opts.method || "GET", headers: { "x-hd-user": App.user }, credentials: "include" };
    const tok = localStorage.getItem("hd_token");
    if (tok) init.headers["x-hd-token"] = tok;
    if (opts.body !== undefined) {
      init.method = opts.method || "POST";
      init.headers["content-type"] = "application/json";
      init.body = JSON.stringify(opts.body);
    }
    let res;
    try {
      res = await fetch(App.url(path), init);
    } catch (e) {
      App.showOffline();
      throw new Error("PC 엔진에 연결할 수 없어요.");
    }
    let data = null;
    const ct = res.headers.get("content-type") || "";
    if (ct.includes("json")) data = await res.json();
    if (res.status === 401 && data && data.need_pair) { App.showPair(); throw new Error(data.error); }
    if (!res.ok) throw new Error((data && data.error) || "요청을 처리하지 못했어요.");
    return data;
  };
  App.qs = (obj) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries(obj)) if (v !== undefined && v !== null && v !== "") p.set(k, v);
    return p.toString();
  };
  App.thumb = (id, t) => App.url(`/api/files/${id}/thumb` + (t ? `?t=${t}` : ""));
  App.raw = (id) => App.url(`/api/files/${id}/raw`);

  // ---- 화면 이동 ----
  App.route = (pattern, render, opts = {}) => App.routes.push({ pattern, render, ...opts });
  App.go = (hash) => { location.hash = hash; };
  App.parseHash = () => {
    const raw = location.hash.replace(/^#/, "") || "/";
    const [path, q] = raw.split("?");
    return { path, query: Object.fromEntries(new URLSearchParams(q || "")) };
  };
  App.render = async function () {
    const { path, query } = App.parseHash();
    const view = document.getElementById("view");
    for (const r of App.routes) {
      const m = path.match(new RegExp("^" + r.pattern.replace(/:(\w+)/g, "([^/]+)") + "$"));
      if (!m) continue;
      if (App.cleanup) { try { App.cleanup(); } catch (e) { /* 무시 */ } App.cleanup = null; }
      view.replaceChildren();
      view.classList.remove("view-enter");
      void view.offsetWidth;
      view.classList.add("view-enter");
      App.setTitle(r.title || "하드 자료 찾기 비서");
      document.getElementById("nav-back").hidden = path === "/";
      document.getElementById("nav-home").hidden = path === "/";
      try {
        await r.render(view, ...m.slice(1).map(decodeURIComponent), query);
      } catch (e) {
        view.append(App.empty("warning", e.message || "화면을 여는 중 문제가 생겼어요.", App.btn("다시 해보기", App.render, "btn-primary")));
      }
      view.focus({ preventScroll: true });
      window.scrollTo(0, 0);
      return;
    }
    App.go("#/");
  };
  App.setTitle = (t) => { document.getElementById("page-title").textContent = t; document.title = t + " · 하드 비서"; };

  // ---- 알림·확인 창 ----
  App.toast = function (msg, type = "", ms = 3500) {
    const icon = { ok: "check-mark-button", danger: "cross-mark", warn: "warning" }[type] || "light-bulb";
    const t = h("div", { class: `toast t-${type}` }, App.icon(icon), h("div", { class: "grow" }, msg));
    document.getElementById("toasts").append(t);
    setTimeout(() => t.remove(), ms);
  };
  App.modal = function (title, content, actions) {
    return new Promise((resolve) => {
      const root = document.getElementById("modal-root");
      const close = (v) => { back.remove(); document.removeEventListener("keydown", onKey); resolve(v); };
      const onKey = (e) => { if (e.key === "Escape") close(null); };
      const box = h("div", { class: "modal", role: "dialog", "aria-modal": "true", "aria-label": title },
        h("h2", { text: title }), content,
        h("div", { class: "actions" }, actions.map((a) => App.btn(a.label, () => close(a.value), a.cls || "btn-ghost", a.icon || null))));
      const back = h("div", { class: "modal-back", onclick: (e) => { if (e.target === back) close(null); } }, box);
      root.append(back);
      document.addEventListener("keydown", onKey);
      const first = box.querySelector("input, textarea") || box.querySelector(".actions .btn");
      if (first) first.focus();
    });
  };
  App.confirm = async (title, text, okLabel = "확인", okCls = "btn-accent", icon = null) =>
    (await App.modal(title, h("p", { text }), [
      { label: "취소", value: false, cls: "btn-ghost" },
      { label: okLabel, value: true, cls: okCls, icon },
    ])) === true;
  /** 위험한 동작은 2단계 확인 */
  App.confirmDanger = async (title, text, okLabel) => {
    if (!(await App.confirm(title, text, "계속", "btn-danger", "warning"))) return false;
    return App.confirm("정말 할까요?", "한 번 더 확인할게요. " + okLabel + "을(를) 누르면 바로 실행돼요.", okLabel, "btn-danger", "warning");
  };
  App.prompt = async (title, label, value = "", type = "text") => {
    const input = h("input", { type, value, "aria-label": label, style: { width: "100%" } });
    const r = await App.modal(title, h("label", { class: "field" }, label, input), [
      { label: "취소", value: false }, { label: "확인", value: true, cls: "btn-primary" }]);
    return r ? input.value : null;
  };
  App.empty = (mood, text, ...extra) =>
    h("div", { class: "empty" }, App.mascot(mood, "mascot-bounce"), h("p", { class: "t-title", text }), ...extra);
  App.check = () => {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("viewBox", "0 0 52 52"); svg.setAttribute("class", "check-anim"); svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = '<circle cx="26" cy="26" r="24" fill="var(--c-ok)"/><path d="M14 27 l8 8 l16 -18" fill="none" stroke="var(--c-on-ok)" stroke-width="5" stroke-linecap="round"/>';
    return svg;
  };

  // ---- 말풍선 안내(한 번만) ----
  App.tip = function (key, text) {
    const seen = App.settings.tips_seen || [];
    if (seen.includes(key)) return null;
    const box = h("div", { class: "tip", role: "note" }, App.mascot("hello"), h("div", { class: "grow" }, text),
      App.btn("알겠어요", async () => {
        box.remove();
        App.settings.tips_seen = [...seen, key];
        try { await App.api("/api/settings", { body: { tips_seen: App.settings.tips_seen } }); } catch (e) { /* 무시 */ }
      }, "btn-ghost btn-small"));
    return box;
  };

  // ---- 설정 적용 ----
  App.applySettings = function (s) {
    App.settings = s;
    const root = document.documentElement;
    root.dataset.font = String(s.font_scale ?? 1);
    root.dataset.theme = s.theme || "light";
    root.dataset.motion = s.reduce_motion ? "reduce" : "full";
    try { localStorage.setItem("hd_look", JSON.stringify({ f: s.font_scale, t: s.theme, m: s.reduce_motion })); } catch (e) { /* 무시 */ }
  };
  App.saveSettings = async function (patch) {
    const s = await App.api("/api/settings", { body: patch });
    App.applySettings(s);
    return s;
  };

  // ---- 눌림 피드백(진동·소리) ----
  let audio = null;
  document.addEventListener("pointerdown", (e) => {
    if (!e.target.closest(".btn, .tile, .chip")) return;
    if (App.settings.vibration && navigator.vibrate) navigator.vibrate(12);
    if (App.settings.sound) {
      try {
        audio = audio || new (window.AudioContext || window.webkitAudioContext)();
        const o = audio.createOscillator(), g = audio.createGain();
        o.frequency.value = 660; g.gain.value = 0.04;
        o.connect(g); g.connect(audio.destination); o.start(); o.stop(audio.currentTime + 0.04);
      } catch (err) { /* 소리 장치 없음 */ }
    }
  });

  // ---- 쉬운 표시 ----
  App.size = (b) => {
    if (b === null || b === undefined) return "";
    const u = ["바이트", "KB", "MB", "GB", "TB"]; let i = 0; let n = b;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + " " + u[i];
  };
  App.date = (iso) => {
    if (!iso) return "날짜 모름";
    const [d, t] = iso.split("T");
    const [y, m, dd] = d.split("-");
    return `${y}년 ${+m}월 ${+dd}일` + (t ? ` ${t.slice(0, 5)}` : "");
  };
  App.kindIcon = (it) => ({ image: "camera", video: "film-frames", audio: "speaker-high-volume" }[it.kind] ||
    ({ hwp: "memo", hwpx: "memo", xls: "card-index-dividers", xlsx: "card-index-dividers", csv: "card-index-dividers", pdf: "open-book" }[it.ext] || "page-facing-up"));
  App.kindLabel = (it) => ({ image: "사진", video: "영상", audio: "소리", other: "기타" }[it.kind] ||
    ({ hwp: "한글", hwpx: "한글", doc: "워드", docx: "워드", xls: "엑셀", xlsx: "엑셀", xlsm: "엑셀", ppt: "파워포인트", pptx: "파워포인트", pdf: "PDF" }[it.ext] || "문서"));
  App.highlight = (text, words) => {
    const frag = document.createDocumentFragment();
    if (!words || !words.length) { frag.append(text); return frag; }
    const re = new RegExp("(" + words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")", "g");
    for (const part of text.split(re)) frag.append(words.includes(part) ? h("mark", { text: part }) : part);
    return frag;
  };

  // ---- 연결 안 됨·연결 번호 ----
  App.showOffline = function () {
    if (document.querySelector(".offline")) return;
    const box = h("div", { class: "offline", role: "alertdialog", "aria-label": "PC 연결 안내" },
      h("div", { class: "card stack" }, App.mascot("warning", "mascot-bounce"),
        h("h2", { text: "PC 엔진을 찾을 수 없어요" }),
        h("ol", {}, h("li", { text: "PC가 켜져 있는지 확인해 주세요." }),
          h("li", { text: "PC에서 '하드 자료 찾기 비서' 프로그램이 실행 중인지 확인해 주세요." }),
          h("li", { text: "휴대폰·맥이 PC와 같은 와이파이에 연결되어 있는지 확인해 주세요." }),
          h("li", { text: "PC 설정에서 '다른 기기에서 보기'가 켜져 있는지 확인해 주세요." })),
        App.base ? h("p", { class: "muted", text: "찾는 주소: " + App.base }) : null,
        App.btn("다시 찾기", async () => {
          try { await fetch(App.url("/api/health")); box.remove(); App.render(); } catch (e) { App.toast("아직 연결되지 않았어요.", "warn"); }
        }, "btn-accent btn-block", "magnifying-glass-tilted-left"),
        App.btn("같은 와이파이에서 자동으로 찾기", async (e) => {
          e.target.disabled = true; e.target.textContent = "찾는 중… (최대 20초)";
          const found = await App.scanLan();
          if (found) { App.base = found; localStorage.setItem("hd_base", found); location.reload(); }
          else { App.toast("찾지 못했어요. PC 주소를 직접 입력해 주세요.", "warn"); e.target.disabled = false; e.target.textContent = "같은 와이파이에서 자동으로 찾기"; }
        }, "btn-primary btn-block", "link"),
        App.btn("PC 주소 직접 입력", async () => {
          const v = await App.prompt("PC 주소", "PC 화면 설정에 보이는 주소 (예: 192.168.0.10:47810)", App.base.replace(/^https?:\/\//, ""));
          if (v) { App.base = "http://" + v.replace(/^https?:\/\//, "").replace(/\/$/, ""); localStorage.setItem("hd_base", App.base); location.reload(); }
        }, "btn-ghost btn-block")));
    document.body.append(box);
  };
  /** 흔한 공유기 주소 범위에서 엔진(포트 47810)을 찾는다(휴대폰·맥 포장 앱용) */
  App.scanLan = async function () {
    const nets = ["192.168.0", "192.168.1", "192.168.219", "172.30.1", "10.0.0", "192.168.35", "192.168.10"];
    const probe = (ip) => new Promise((resolve) => {
      const ctl = new AbortController();
      const t = setTimeout(() => { ctl.abort(); resolve(null); }, 900);
      fetch(`http://${ip}:47810/api/health`, { signal: ctl.signal }).then((r) => r.json()).then((j) => { clearTimeout(t); resolve(j && j.ok ? `http://${ip}:47810` : null); }).catch(() => { clearTimeout(t); resolve(null); });
    });
    for (const net of nets) {
      for (let start = 1; start < 255; start += 64) {
        const ips = []; for (let i = start; i < Math.min(start + 64, 255); i++) ips.push(`${net}.${i}`);
        const hit = (await Promise.all(ips.map(probe))).find(Boolean);
        if (hit) return hit;
      }
    }
    return null;
  };

  App.showPair = async function () {
    if (document.querySelector(".modal-back")) return;
    const code = await App.prompt("연결 번호 입력", "PC 화면 설정 > 다른 기기에서 보기 에 나온 6자리 번호", "", "number");
    if (!code) return;
    try {
      const r = await App.api("/api/pair", { body: { code } });
      localStorage.setItem("hd_token", r.token);
      App.toast("연결되었어요!", "ok");
      App.render();
    } catch (e) { App.toast(e.message, "danger"); }
  };

  // ---- 전역 오류 처리 ----
  const report = (msg) => { try { fetch(App.url("/api/client-error"), { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: String(msg).slice(0, 300) }) }); } catch (e) { /* 무시 */ } };
  window.addEventListener("error", (e) => { report(e.message); App.toast("잠깐 문제가 생겼어요. 다시 해 보세요.", "warn"); });
  window.addEventListener("unhandledrejection", (e) => { report(e.reason && e.reason.message); App.toast((e.reason && e.reason.message) || "잠깐 문제가 생겼어요.", "warn"); });

  App.boot = async function () {
    try { const look = JSON.parse(localStorage.getItem("hd_look") || "null"); if (look) App.applySettings({ font_scale: look.f, theme: look.t, reduce_motion: look.m }); } catch (e) { /* 무시 */ }
    document.getElementById("nav-back").addEventListener("click", () => (history.length > 1 ? history.back() : App.go("#/")));
    window.addEventListener("hashchange", App.render);
    // 휴대폰·맥 포장 앱에서는 PC 주소를 먼저 알아야 한다
    App.isShell = !!window.Capacitor || location.protocol === "file:";
    if (App.isShell && !App.base) { App.showOffline(); return; }
    try {
      App.applySettings(await App.api("/api/settings"));
    } catch (e) { if (App.isShell) App.showOffline(); return; }
    if (!App.settings.first_run_done && !location.hash.startsWith("#/wizard")) {
      const roots = await App.api("/api/roots");
      if (!roots.length) { App.go("#/wizard"); return; }
    }
    App.render();
  };
})();
