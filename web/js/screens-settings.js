/* 설정: 글씨·색·움직임·소리, 음성, 밤 시간, 사용자, 다른 기기, AI, 구글, 백업·복원·초기화, 문제 신고 */
(function () {
  "use strict";
  const App = window.App;
  const h = App.h;

  const choice = (label, key, options) => h("div", { class: "stack", style: { gap: "var(--gap-xs)" } }, h("strong", { text: label }),
    h("div", { class: "chips", role: "group", "aria-label": label }, options.map(([v, l]) =>
      h("button", { class: "chip", type: "button", "aria-pressed": String(App.settings[key] === v), onclick: async () => { await App.saveSettings({ [key]: v }); App.render(); } }, l))));
  const toggle = (label, key, desc) => choice(label + (desc ? ` — ${desc}` : ""), key, [[true, "켜기"], [false, "끄기"]]);

  /** 업데이트 확인 카드(설정 맨 위) */
  App.updateCard = function (sys) {
    const out = h("div", { class: "stack" });
    const plat = /Android/i.test(navigator.userAgent) ? "android" : /Mac/i.test(navigator.platform) ? "mac" : "windows";
    const card = h("section", { class: "card stack", id: "update-card" }, h("h2", {}, App.icon("sparkles"), " 업데이트"),
      h("p", { text: `지금 버전 ${App.version}${sys && sys.version !== App.version ? ` (PC 엔진 ${sys.version})` : ""}. 새 버전을 설치해도 색인·설정·얼굴 이름·메모는 그대로예요.` }),
      h("div", { class: "row" }, App.btn("업데이트 확인", async (e) => {
        e.target.disabled = true;
        try {
          const r = await App.api("/api/update/check");
          out.replaceChildren();
          if (!r.newer) { out.append(h("p", { class: "badge st-ok", text: `✔ 최신 버전이에요 (${r.current})` })); return; }
          out.append(h("p", { class: "badge st-warn", text: `새 버전 ${r.latest}이(가) 나왔어요!` }), h("div", { class: "doc-preview", text: r.notes || "" }));
          if (r.engine_busy) out.append(h("p", { class: "badge st-progress", text: "◔ 지금 분석(색인) 중이에요. 분석이 끝난 뒤 설치해 주세요." }));
          if (r.can_auto_install) {
            out.append(App.btn("지금 설치(자동 백업 후)", async (ev) => {
              if (!(await App.confirm("새 버전 설치", "설정·인물 정보를 자동으로 백업한 뒤 설치해요. 설치하는 동안 잠시 프로그램이 꺼졌다 켜져요. 색인은 그대로예요.", "설치하기"))) return;
              ev.target.disabled = true;
              try { const x = await App.api("/api/update/install", { body: {} }); App.toast(x.message, "ok", 15000); } catch (err) { App.toast(err.message, "warn", 8000); ev.target.disabled = false; }
            }, "btn-accent", "inbox-tray", { disabled: r.engine_busy }));
          } else if (r.assets[plat]) {
            out.append(h("a", { class: "btn btn-accent", href: r.assets[plat].url, target: "_blank", rel: "noopener" }, App.icon("inbox-tray"),
              { android: "안드로이드 앱 내려받기(설치 화면이 열려요)", mac: "맥 앱 내려받기(새 앱으로 바꾸기)", windows: "윈도우 설치 파일 내려받기" }[plat]));
          }
          if (r.page) out.append(h("a", { href: r.page, target: "_blank", rel: "noopener", text: "바뀐 점 자세히 보기" }));
        } catch (err) { out.replaceChildren(App.errorBox(err)); }
        finally { e.target.disabled = false; }
      }, "btn-primary", "magnifying-glass-tilted-left")), out);
    return card;
  };

  App.route("/settings", async (view) => {
    const s = App.settings;
    const sys = await App.api("/api/system").catch(() => null);
    view.append(h("div", { class: "row" }, App.statusChips(), App.reportLink()), App.updateCard(sys));
    if (sys && sys.data) {
      view.append(h("section", { class: "card stack" }, h("h2", {}, App.icon("computer-disk"), " 자료 위치(색인·설정)"),
        h("p", { text: "며칠 걸려 만든 색인이 여기 있어요. 프로그램을 새로 설치·업데이트해도 이 폴더는 그대로예요." }),
        h("p", {}, h("strong", { text: sys.data.home })),
        h("div", { class: "row" }, App.btn("다른 위치로 옮기기", async () => {
          const p = await App.pickFolder("자료를 옮길 폴더 고르기");
          if (!p) return;
          if (!(await App.confirm("자료 옮기기", `'${p}' 폴더로 색인·설정을 복사한 뒤 그곳을 써요. 원래 위치의 자료는 지우지 않고 남겨 둬요.`, "옮기기"))) return;
          try { const r = await App.api("/api/data-location", { body: { path: p } }); App.toast(r.message, "ok", 8000); App.render(); } catch (e) { App.toast(e.message, "warn", 8000); }
        }, "btn-ghost", "file-folder"))));
    }
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

    // 앱 꾸미기
    const nameIn = h("input", { type: "text", value: App.appName(), maxlength: 24, "aria-label": "표시 이름" });
    const icons = [["mascot", "비서"], ["camera", "카메라"], ["house", "집"], ["computer-disk", "디스크"], ["sparkles", "반짝"], ["family", "가족"], ["notebook", "공책"]];
    view.append(h("section", { class: "card stack", id: "brand-card" }, h("h2", {}, App.icon("sparkles"), " 앱 꾸미기"),
      h("div", { class: "row" }, h("label", { class: "field" }, "표시 이름(홈·창 제목·알림)", nameIn),
        App.btn("이름 저장", async () => { await App.saveSettings({ app_name: nameIn.value }); App.toast(`이름을 '${App.appName()}'(으)로 바꿨어요.`, "ok"); App.setTitle("설정"); }, "btn-primary btn-small")),
      h("strong", { text: "아이콘" }),
      h("div", { class: "chips", role: "group", "aria-label": "아이콘 고르기" }, icons.map(([v, l]) =>
        h("button", { class: "chip iconchip", type: "button", "aria-pressed": String(s.app_icon === v), onclick: async () => { await App.saveSettings({ app_icon: v }); App.render(); } },
          h("img", { src: v === "mascot" ? "assets/mascot/hello.svg" : `assets/emoji/${v}.webp`, alt: "", width: 32, height: 32 }), l)),
        s.app_icon === "custom" ? h("span", { class: "chip iconchip", "aria-pressed": "true" }, h("img", { src: App.url(`/api/branding/icon.png?user=${App.user}&v=${Date.now()}`), alt: "", width: 32, height: 32 }), "내 사진") : null),
      h("div", { class: "row" }, App.fileButton("내 사진으로 아이콘", "image/*", async (file) => {
        const r = await App.upload("/api/branding/icon", { file }); App.toast(r.message, "ok");
        App.applySettings(await App.api("/api/settings")); App.render();
      }, "btn-ghost", "camera"),
        h("a", { class: "btn btn-ghost", href: App.url(`/api/branding/icon.ico?user=${App.user}`), download: "하드비서.ico" }, App.icon("inbox-tray"), "바로가기용 아이콘(.ico) 받기")),
      h("details", {}, h("summary", { class: "btn btn-ghost btn-small", text: "바탕화면·맥 아이콘 바꾸는 방법(그림)" }),
        h("img", { src: "assets/guide/shortcut-icon.svg", alt: "윈도우: 아이콘 오른쪽 클릭 → 속성 → 아이콘 변경 → 받은 .ico 고르기. 맥: 정보 가져오기 창의 아이콘 위에 끌어다 놓기", style: { width: "100%", maxWidth: "720px" } })),
      choice("색 테마", "palette", [["blue", "🔵 파랑"], ["green", "🟢 초록"], ["purple", "🟣 보라"], ["orange", "🟠 주황"], ["pink", "🩷 분홍"]])));

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
      h("div", { class: "row" }, h("a", { class: "btn btn-ghost", href: App.url("/api/report"), download: "hdbiseo_report.zip" }, "문제 신고 파일 만들기"),
        App.btn("프로그램 끄기", async () => {
          if (!(await App.confirm("프로그램 끄기", "PC의 분석 엔진을 꺼요. 색인 중이면 멈추고, 다음에 켜면 이어서 해요.", "끄기", "btn-danger"))) return;
          try { const r = await App.api("/api/shutdown", { body: {} }); App.toast(r.message, "ok", 8000); } catch (e) { App.toast(e.message, "warn"); }
        }, "btn-ghost")),
      h("p", { class: "muted small", text: `버전 ${sys ? sys.version : "?"} · PC: ${sys ? `${sys.spec.os}, CPU ${sys.spec.cpu_cores}개, 메모리 ${sys.spec.ram_gb}GB` : ""} · 영상 썸네일 도구(ffmpeg): ${sys && sys.ffmpeg ? "있음" : "없음"}` }),
      h("p", { class: "muted small" }, "3D 이모지: Microsoft Fluent Emoji(MIT) · 글꼴: Pretendard(OFL)")));
  }, { title: "설정" });
})();
