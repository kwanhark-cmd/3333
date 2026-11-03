/* 설정: 글씨·색·움직임·소리, 음성, 밤 시간, 사용자, 다른 기기, AI, 구글, 백업·복원·초기화, 문제 신고 */
(function () {
  "use strict";
  const App = window.App;
  const h = App.h;

  const choice = (label, key, options) => h("div", { class: "stack", style: { gap: "var(--gap-xs)" } }, h("strong", { text: label }),
    h("div", { class: "chips", role: "group", "aria-label": label }, options.map(([v, l]) =>
      h("button", { class: "chip", type: "button", "aria-pressed": String(App.settings[key] === v), onclick: async () => { await App.saveSettings({ [key]: v }); App.render(); } }, l))));
  const toggle = (label, key, desc) => choice(label + (desc ? ` — ${desc}` : ""), key, [[true, "켜기"], [false, "끄기"]]);

  App.route("/settings", async (view) => {
    const s = App.settings;
    const sys = await App.api("/api/system").catch(() => null);
    view.append(h("section", { class: "card stack" }, h("h2", {}, App.icon("gear"), " 보기 편하게"),
      choice("글씨 크기", "font_scale", [[0, "보통"], [1, "크게"], [2, "아주 크게"]]),
      choice("화면 색", "theme", [["light", "☀ 밝게"], ["dark", "🌙 어둡게"], ["contrast", "◐ 고대비"]]),
      toggle("움직임 줄이기", "reduce_motion", "화면 움직임을 끕니다"),
      toggle("누를 때 소리", "sound"), toggle("누를 때 진동", "vibration", "휴대폰")));

    view.append(h("section", { class: "card stack" }, h("h2", {}, App.icon("speaker-high-volume"), " 음성"),
      toggle("읽어주기", "tts_enabled"),
      choice("읽는 속도", "tts_rate", [[0.8, "천천히"], [1, "보통"], [1.25, "빠르게"]]),
      h("p", { class: "muted", text: App.voice.canListen ? "✔ 이 기기에서 말로 찾기를 쓸 수 있어요." : "이 기기(브라우저)는 음성 인식을 지원하지 않아 글자 입력칸을 보여드려요." }),
      choice("음성 엔진", "voice_engine", [["builtin", "기기 내장(기본)"], ["external", "외부 서비스(준비 중)"]])));

    const nightStart = h("input", { type: "time", value: s.night_start, "aria-label": "시작 시각" });
    const nightEnd = h("input", { type: "time", value: s.night_end, "aria-label": "끝 시각" });
    const cache = h("input", { type: "number", value: s.thumb_cache_mb, min: 100, step: 100, "aria-label": "썸네일 저장 한도(MB)" });
    view.append(h("section", { class: "card stack" }, h("h2", {}, App.icon("hourglass-not-done"), " 색인"),
      toggle("밤 시간에만 색인", "night_only"),
      h("div", { class: "row" }, h("label", { class: "field" }, "시작", nightStart), h("label", { class: "field" }, "끝", nightEnd),
        App.btn("시간 저장", async () => { try { await App.saveSettings({ night_start: nightStart.value, night_end: nightEnd.value }); App.toast("저장했어요.", "ok"); } catch (e) { App.toast(e.message, "warn"); } }, "btn-primary btn-small")),
      h("div", { class: "row" }, h("label", { class: "field" }, "썸네일 저장 한도(MB)", cache),
        App.btn("한도 저장", async () => { await App.saveSettings({ thumb_cache_mb: Number(cache.value) }); App.toast("저장했어요.", "ok"); }, "btn-primary btn-small")),
      h("div", { class: "row" }, App.link("하드 상태", "#/index", "btn-ghost", "computer-disk"), App.link("처음 설정 다시 하기", "#/wizard", "btn-ghost"))));

    // 사용자
    const users = await App.api("/api/users");
    view.append(h("section", { class: "card stack" }, h("h2", {}, App.icon("busts-in-silhouette"), " 사용자(가족)"),
      h("p", { class: "muted", text: "사용자마다 하드 목록·검색 기록·설정이 따로 저장돼요." }),
      h("div", { class: "chips" }, users.map((u) => h("button", { class: "chip", type: "button", "aria-pressed": String(App.user === u.id),
        onclick: () => { App.user = u.id; localStorage.setItem("hd_user", u.id); location.hash = "#/"; location.reload(); } }, `${u.emoji} ${u.name}`))),
      App.btn("사용자 추가", async () => { const n = await App.prompt("사용자 추가", "이름"); if (n) { await App.api("/api/users", { body: { name: n } }); App.render(); } }, "btn-ghost btn-small")));

    // 다른 기기
    const lanBox = h("section", { class: "card stack" }, h("h2", {}, App.icon("link"), " 다른 기기에서 보기 (맥·안드로이드)"));
    view.append(lanBox);
    try {
      const lan = await App.api("/api/lan");
      lanBox.append(h("p", { text: "같은 와이파이의 맥·안드로이드에서 이 PC의 자료를 볼 수 있어요. 집 밖에서는 접속되지 않아요." }),
        lan.enabled ? h("div", { class: "stack" }, h("p", { class: "badge st-ok", text: "✔ 켜짐" }),
          h("p", {}, "휴대폰 인터넷 창에 이 주소를 입력하세요: ", h("strong", { text: lan.addresses.map((a) => `http://${a}:${lan.port}`).join("  또는  ") || "(주소를 찾지 못함)" })),
          h("p", {}, "연결 번호: ", h("strong", { style: { fontSize: "var(--fs-hero)", letterSpacing: "4px" }, text: lan.code }))) : h("p", { class: "badge st-warn", text: "! 꺼짐" }),
        App.btn(lan.enabled ? "끄기" : "켜기", async () => {
          const r = await App.api("/api/lan", { body: { enabled: !lan.enabled } });
          App.toast(r.enabled ? "켰어요. 프로그램을 껐다 켜면 적용돼요." : "껐어요. 프로그램을 껐다 켜면 적용돼요.", "ok", 6000);
          App.render();
        }, lan.enabled ? "btn-ghost" : "btn-primary"));
    } catch (e) { lanBox.append(h("p", { class: "muted", text: e.message })); }

    // AI
    const key = h("input", { type: "password", value: s.ai_api_key, placeholder: "API 키", "aria-label": "AI API 키", autocomplete: "off" });
    const limit = h("input", { type: "number", value: s.ai_monthly_limit_won, min: 0, step: 1000, "aria-label": "월 한도(원)" });
    view.append(h("section", { class: "card stack" }, h("h2", {}, App.icon("robot"), " AI 연결 (기본은 꺼짐)"),
      h("p", { text: "기본으로 모든 분석은 이 PC 안에서만 해요. AI 연결을 켜면 '문서 요약'을 누를 때만 그 문서의 글자(앞부분 최대 1만 자)가 AI 회사(Anthropic)로 전송돼요. 사진·영상·연락처는 보내지 않아요." }),
      h("p", { class: "muted", text: "예상 비용: 문서 1개 요약에 약 20~60원. 월 한도를 넘으면 자동으로 멈춰요." }),
      h("label", { class: "field" }, "API 키", key), h("label", { class: "field" }, "월 한도(원)", limit),
      h("div", { class: "row" }, App.btn("저장", async () => { await App.saveSettings({ ai_api_key: key.value, ai_monthly_limit_won: Number(limit.value) }); App.toast("저장했어요.", "ok"); }, "btn-primary btn-small")),
      choice("AI 사용", "ai_enabled", [[false, "끄기(PC 안에서만)"], [true, "켜기"]])));

    // 구글
    const gid = h("input", { type: "text", value: s.google_client_id, placeholder: "클라이언트 ID", "aria-label": "구글 클라이언트 ID" });
    const gsec = h("input", { type: "password", value: s.google_client_secret, placeholder: "클라이언트 보안 비밀", "aria-label": "구글 클라이언트 보안 비밀", autocomplete: "off" });
    view.append(h("section", { class: "card stack" }, h("h2", {}, App.icon("spiral-calendar"), " 구글 캘린더·주소록"),
      h("p", { text: s.google_connected ? "✔ 연결됨" : "구글 계정을 연결하면 일정·연락처를 가져와 함께 찾아요. 가져온 내용은 이 PC에만 저장돼요." }),
      h("details", {}, h("summary", { class: "btn btn-ghost btn-small", text: "연결 정보 입력(처음 한 번)" }),
        h("div", { class: "stack" }, h("label", { class: "field" }, "클라이언트 ID", gid), h("label", { class: "field" }, "클라이언트 보안 비밀", gsec),
          App.btn("저장", async () => { await App.saveSettings({ google_client_id: gid.value, google_client_secret: gsec.value }); App.toast("저장했어요.", "ok"); }, "btn-primary btn-small"))),
      h("div", { class: "row" }, App.link("기록 화면에서 연결·가져오기", "#/records/import", "btn-ghost"))));

    view.append(h("section", { class: "card stack" }, h("h2", {}, App.icon("shield"), " 아이폰 지원"),
      h("p", { class: "badge st-warn", text: "준비 중" }), h("p", { class: "muted", text: "다음 버전에서 아이폰 앱을 지원할 예정이에요. 지금은 아이폰 사파리에서 PC 주소로 접속해 볼 수 있어요." })));

    // 백업·복원·초기화
    const backups = await App.api("/api/backups");
    const sel = h("select", { "aria-label": "백업 고르기" }, backups.map((b) => h("option", { value: b.file, text: `${b.at} (${App.size(b.size)})` })));
    view.append(h("section", { class: "card stack" }, h("h2", {}, App.icon("inbox-tray"), " 백업·복원·초기화"),
      h("p", { class: "muted", text: "색인(목록)만 백업해요. 하드디스크의 파일은 언제나 그대로예요." }),
      h("div", { class: "row" }, App.btn("지금 백업", async () => { const r = await App.api("/api/backup", { body: {} }); App.toast(r.message, "ok"); App.render(); }, "btn-primary", "inbox-tray")),
      backups.length ? h("div", { class: "row" }, sel, App.btn("이 백업으로 복원", async () => {
        if (!(await App.confirm("복원", "지금 색인을 고른 백업으로 바꿔요. 지금 색인도 따로 보관해요.", "복원하기"))) return;
        const r = await App.api("/api/restore", { body: { file: sel.value } }); App.toast(r.message, "ok");
      }, "btn-ghost")) : h("p", { class: "muted", text: "아직 백업이 없어요." }),
      App.btn("색인 초기화", async () => {
        if (!(await App.confirmDanger("색인 초기화", "만들어 둔 목록을 모두 지우고 처음부터 다시 색인해야 해요. 하드디스크의 파일은 지워지지 않아요.", "초기화"))) return;
        const r = await App.api("/api/reset", { body: { confirm1: true, confirm2: "초기화" } }); App.toast(r.message, "ok", 6000);
      }, "btn-danger", "warning")));

    view.append(h("section", { class: "card stack" }, h("h2", {}, App.icon("light-bulb"), " 도움"),
      h("p", { text: "문제가 생기면 '문제 신고 파일 만들기'를 눌러 만든 파일을 보내 주세요. 파일 내용·연락처·일기는 들어가지 않아요." }),
      h("a", { class: "btn btn-ghost", href: App.url("/api/report"), download: "hdbiseo_report.zip" }, "문제 신고 파일 만들기"),
      h("p", { class: "muted small", text: `버전 ${sys ? sys.version : "?"} · PC: ${sys ? `${sys.spec.os}, CPU ${sys.spec.cpu_cores}개, 메모리 ${sys.spec.ram_gb}GB` : ""} · 영상 썸네일 도구(ffmpeg): ${sys && sys.ffmpeg ? "있음" : "없음"}` }),
      h("p", { class: "muted small" }, "3D 이모지: Microsoft Fluent Emoji(MIT) · 글꼴: Pretendard(OFL)")));
  }, { title: "설정" });
})();
