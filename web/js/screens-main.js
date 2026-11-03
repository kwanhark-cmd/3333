/* 홈, 첫 실행 마법사, 찾기, 파일 보기, 색인 상태, 문서, 읽을 수 없음 */
(function () {
  "use strict";
  const App = window.App;
  const h = App.h;

  // ================= 홈 =================
  App.route("/", async (view) => {
    App.setTitle("하드 자료 찾기 비서");
    const today = await App.api("/api/today");
    const card = h("section", { class: "today", "aria-label": "오늘 할 일" });
    if (today.type === "memory" && today.item) {
      card.append(h("img", { class: "thumb", src: App.thumb(today.item.id), alt: "오늘의 추억 사진" }));
    } else {
      card.append(App.mascot(today.type === "indexing" ? "searching" : "hello", "mascot mascot-bounce"));
    }
    const right = h("div", {}, h("div", { class: "small", text: "오늘 할 일" }), h("div", { class: "t-title", text: today.title }));
    if (today.type === "indexing") right.append(h("div", { class: "bar moving", role: "progressbar", "aria-valuenow": today.percent, "aria-label": "색인 진행률" }, h("span", { style: { width: (today.percent || 2) + "%" } })));
    const labels = { start: "시작하기", indexing: "진행 상황 보기", resume: "이어서 하기", memory: "추억 보기", search: "찾으러 가기" };
    right.append(h("div", { class: "row" }, App.link(labels[today.type] || "열기", today.action, "btn-accent"),
      today.speech ? App.speakButton(today.speech) : null));
    card.append(right);
    view.append(card);

    const q = h("input", { type: "search", placeholder: "무엇을 찾을까요? 예) 2005년 아이들 영상", "aria-label": "찾을 말" });
    const go = (text) => App.go("#/search?" + App.qs({ q: text ?? q.value }));
    q.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    view.append(h("div", { class: "searchbar" }, q, App.btn("찾기", () => go(), "btn-primary", "magnifying-glass-tilted-left"), App.micButton((t) => go(t))));

    const tiles = [
      ["#/search", "magnifying-glass-tilted-left", "찾기", "이름·내용·말로 한 번에"],
      ["#/photos", "camera", "사진·영상", "날짜별·추억·장소·상영관"],
      ["#/docs", "page-facing-up", "문서", "한글·엑셀·워드·PDF"],
      ["#/people", "family", "사람", "얼굴로 가족별 모아보기"],
      ["#/records", "notebook", "기록", "일기·일정·연락처·인맥"],
      ["#/dupes", "broom", "정리", "같은 파일 찾아 정리"],
    ];
    view.append(h("h2", { class: "sr-only", text: "메뉴" }),
      h("nav", { class: "tiles stagger", "aria-label": "메뉴" }, tiles.map(([href, ico, name, desc]) =>
        h("a", { class: "tile", href }, App.icon(ico), h("span", {}, h("span", { class: "t-name", text: name }), h("span", { class: "t-desc", text: desc }))))));
    view.append(h("div", { class: "row", style: { marginTop: "var(--gap-l)" } },
      App.link("하드 상태", "#/index", "btn-ghost", "computer-disk"), App.link("설정", "#/settings", "btn-ghost", "gear")));
  }, { title: "홈" });

  // ================= 폴더 고르기 =================
  App.pickFolder = function (title = "폴더 고르기") {
    return new Promise((resolve) => {
      let current = "";
      const list = h("div", { class: "list", style: { maxHeight: "45vh", overflow: "auto" } });
      const where = h("p", { class: "muted small" });
      const load = async (path) => {
        try {
          const r = await App.api("/api/browse?" + App.qs({ path }));
          current = r.path;
          where.textContent = r.path ? "지금 위치: " + r.path : "하드디스크를 골라 주세요";
          list.replaceChildren();
          if (r.parent !== null && r.parent !== undefined) list.append(h("button", { class: "item", type: "button", onclick: () => load(r.parent) }, App.icon("file-folder"), h("span", { class: "i-main" }, h("span", { class: "i-name", text: "⬆ 위 폴더로" }))));
          for (const d of r.dirs) {
            list.append(h("button", { class: "item", type: "button", onclick: () => load(d.path) }, App.icon(d.total ? "computer-disk" : "file-folder"),
              h("span", { class: "i-main" }, h("span", { class: "i-name", text: d.name }), d.total ? h("span", { class: "i-sub", text: `${App.size(d.used)} 사용 / 전체 ${App.size(d.total)}` }) : null)));
          }
          if (!r.dirs.length) list.append(h("p", { class: "muted", text: "안에 폴더가 없어요." }));
        } catch (e) { App.toast(e.message, "warn"); }
      };
      const body = h("div", { class: "stack" }, where, list);
      App.modal(title, body, [{ label: "취소", value: null }, { label: "이 폴더 선택", value: "ok", cls: "btn-accent", icon: "check-mark-button" }])
        .then((v) => resolve(v === "ok" && current ? current : null));
      load("");
    });
  };

  // ================= 첫 실행 마법사 =================
  App.route("/wizard", async (view, query) => {
    const step = Number(query.step || 1);
    const steps = ["글씨 크기", "하드디스크 고르기", "밤 시간 실행", "예상 시간"];
    view.append(h("p", { class: "muted", text: `${step} / ${steps.length} 단계 — ${steps[step - 1]}` }),
      h("div", { class: "bar ok", role: "progressbar", "aria-label": "마법사 단계" }, h("span", { style: { width: (step / steps.length) * 100 + "%" } })));
    const next = () => App.go("#/wizard?step=" + (step + 1));
    if (step === 1) {
      view.append(h("div", { class: "today" }, App.mascot("hello", "mascot mascot-bounce"),
        h("div", {}, h("div", { class: "t-title", text: "반가워요! 하드디스크 속 자료를 찾아 드릴게요." }), h("div", { text: "먼저 보기 편한 글씨 크기를 골라 주세요." }))));
      const sizes = [[0, "보통"], [1, "크게"], [2, "아주 크게"]];
      view.append(h("div", { class: "tiles" }, sizes.map(([v, label]) =>
        h("button", { class: "tile", type: "button", "aria-pressed": String(App.settings.font_scale === v), onclick: async () => { await App.saveSettings({ font_scale: v }); App.render(); } },
          h("span", { style: { fontSize: ["1rem", "1.3rem", "1.6rem"][v], fontWeight: 700 }, text: "가" }), h("span", {}, h("span", { class: "t-name", text: label }), h("span", { class: "t-desc", text: App.settings.font_scale === v ? "✔ 선택됨" : "누르면 바로 바뀌어요" }))))));
      view.append(h("div", { class: "row", style: { marginTop: "var(--gap-l)" } }, App.btn("다음", next, "btn-accent btn-block")));
    } else if (step === 2) {
      view.append(App.tip("wizard-drive", "사진·영상·문서가 들어 있는 하드디스크나 폴더를 골라 주세요. 여러 개를 골라도 돼요. 이 프로그램은 파일을 바꾸거나 옮기지 않고 목록만 만들어요.") || "");
      const list = h("div", { class: "list" });
      const refresh = async () => {
        const roots = await App.api("/api/roots");
        list.replaceChildren(...(roots.length ? roots.map((r) => h("div", { class: "item" }, App.icon("computer-disk"),
          h("span", { class: "i-main" }, h("span", { class: "i-name", text: r.label }), h("span", { class: "i-sub", text: r.path }),
            r.excluded.length ? h("span", { class: "i-sub", text: "제외: " + r.excluded.join(", ") }) : null),
          App.btn("제외 폴더", async () => {
            const ex = await App.pickFolder("분석에서 뺄 폴더 고르기");
            if (ex) { await App.api(`/api/roots/${r.id}`, { method: "PATCH", body: { excluded: [...r.excluded, ex] } }); refresh(); }
          }, "btn-ghost btn-small"),
          App.btn("빼기", async () => { await App.api(`/api/roots/${r.id}`, { method: "DELETE" }); refresh(); }, "btn-ghost btn-small"))) :
          [h("p", { class: "muted", text: "아직 고른 하드디스크가 없어요." })]));
        nextBtn.disabled = !roots.length;
      };
      const nextBtn = App.btn("다음", next, "btn-accent btn-block");
      view.append(h("div", { class: "row" },
        App.btn("하드디스크·폴더 추가", async () => {
          const p = await App.pickFolder();
          if (!p) return;
          try { await App.api("/api/roots", { body: { path: p } }); App.toast("추가했어요.", "ok"); refresh(); } catch (e) { App.toast(e.message, "warn"); }
        }, "btn-primary", "computer-disk"),
        App.btn("체험용 예제 폴더로 해보기", async () => {
          const r = await App.api("/api/samples", { body: {} });
          try { await App.api("/api/roots", { body: { path: r.path, label: "체험용 예제" } }); } catch (e) { /* 이미 있음 */ }
          refresh();
        }, "btn-ghost", "sparkles")), list, h("div", { style: { marginTop: "var(--gap-l)" } }, nextBtn));
      refresh();
    } else if (step === 3) {
      view.append(h("h2", { text: "밤에만 색인할까요?" }),
        h("p", { text: "하드디스크가 크면 처음 색인에 오래 걸려요. 밤에만 돌리면 낮에 컴퓨터가 느려지지 않아요." }));
      const opt = (on, title, desc) => h("button", { class: "tile", type: "button", "aria-pressed": String(!!App.settings.night_only === on),
        onclick: async () => { await App.saveSettings({ night_only: on }); next(); } },
        App.icon(on ? "light-bulb" : "sparkles"), h("span", {}, h("span", { class: "t-name", text: title }), h("span", { class: "t-desc", text: desc })));
      view.append(h("div", { class: "tiles" }, opt(false, "지금 바로 시작", "켜 두는 동안 계속 색인해요"), opt(true, "밤에만 (23시~6시)", "설정에서 시간을 바꿀 수 있어요")));
    } else {
      const sys = await App.api("/api/system");
      const e = sys.estimate;
      view.append(h("h2", { text: "예상 시간" }),
        h("div", { class: "card stack" },
          h("dl", { class: "info" },
            h("dt", { text: "내 PC" }), h("dd", { text: `CPU ${sys.spec.cpu_cores}개 · 메모리 ${sys.spec.ram_gb || "?"}GB · 그래픽카드 ${sys.spec.gpu || "없음"}` }),
            h("dt", { text: "파일 수(어림)" }), h("dd", { text: `약 ${e.files_guess.toLocaleString()}개` }),
            h("dt", { text: "목록 만들기" }), h("dd", { text: e.list }),
            h("dt", { text: "사진 정보·문서 내용" }), h("dd", { text: e.detail }),
            h("dt", { text: "얼굴 인식(켤 때)" }), h("dd", { text: e.faces })),
          e.advice.map((a) => h("p", { class: "badge st-warn", text: "⚠ " + a }))),
        h("p", { class: "muted", text: "목록이 만들어지는 대로 바로 검색할 수 있어요. 중간에 꺼져도 이어서 해요." }),
        App.btn("색인 시작하기", async () => {
          await App.saveSettings({ first_run_done: true });
          await App.api("/api/index/start", { body: {} });
          App.toast("색인을 시작했어요!", "ok");
          App.go("#/index");
        }, "btn-accent btn-block", "check-mark-button"));
    }
  }, { title: "처음 설정" });

  // ================= 찾기 =================
  App.renderFileItem = function (it) {
    if (it.kind === "image" || it.kind === "video") {
      return h("a", { class: "thumb-card", href: `#/file/${it.id}`, title: it.name },
        h("img", { src: App.thumb(it.id), alt: `${App.kindLabel(it)} ${it.name}`, loading: "lazy", onerror: (e) => { e.target.replaceWith(App.icon(App.kindIcon(it))); } }),
        it.kind === "video" ? h("span", { class: "badge st-progress", text: "▶ 영상" }) : null);
    }
    return h("a", { class: "item", href: `#/file/${it.id}` }, App.icon(App.kindIcon(it)),
      h("span", { class: "i-main" }, h("span", { class: "i-name", text: it.name }),
        h("span", { class: "i-sub", text: `${App.kindLabel(it)} · ${App.date(it.taken_at)} · ${App.size(it.size)}` }),
        h("span", { class: "i-sub", text: "📁 " + it.dir }),
        it.snippet ? h("span", { class: "snippet" }, App.highlight(it.snippet, it.highlight)) : null));
  };
  App.renderResults = function (res, container, loadMore) {
    const media = res.items.filter((i) => i.kind === "image" || i.kind === "video");
    const others = res.items.filter((i) => !(i.kind === "image" || i.kind === "video"));
    if (media.length) container.append(h("div", { class: "grid stagger" }, media.map(App.renderFileItem)));
    if (others.length) container.append(h("div", { class: "list stagger" }, others.map(App.renderFileItem)));
    if (loadMore && res.page * res.page_size < res.total) {
      const b = App.btn("더 보기", () => { b.remove(); loadMore(res.page + 1); }, "btn-ghost btn-block");
      container.append(b);
    }
  };

  App.route("/search", async (view, query) => {
    const st = { q: query.q || "", kind: query.kind || "", order: query.order || "new", year: query.year || "", size: query.size || "", mode: query.mode || "" };
    const input = h("input", { type: "search", value: st.q, placeholder: "예) 계약금 들어간 문서 찾아줘", "aria-label": "찾을 말" });
    const run = (patch = {}) => App.go("#/search?" + App.qs({ ...st, q: input.value, ...patch }));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") run(); });
    view.append(App.tip("search", "파일 이름, 문서 안의 글자, 날짜를 한 번에 찾아요. 마이크를 누르고 \"2005년 아이들 영상 찾아줘\"처럼 말해도 돼요.") || "");
    view.append(h("div", { class: "searchbar" }, input, App.btn("찾기", () => run(), "btn-primary", "magnifying-glass-tilted-left"), App.micButton((t) => { input.value = t; run({ q: t }); })));
    const chip = (key, val, label) => h("button", { class: "chip", type: "button", "aria-pressed": String(st[key] === val), onclick: () => run({ [key]: st[key] === val && val ? "" : val }) }, label);
    view.append(h("div", { class: "chips", role: "group", "aria-label": "종류" }, chip("kind", "", "전체"), chip("kind", "image", "📷 사진"), chip("kind", "video", "🎬 영상"), chip("kind", "doc", "📄 문서"), chip("kind", "audio", "🔊 소리")),
      h("div", { class: "chips", role: "group", "aria-label": "찾는 방법" }, chip("mode", "", "이름·전체"), chip("mode", "content", "문서 안의 글자")),
      h("details", {}, h("summary", { class: "btn btn-ghost btn-small", text: "더 자세한 조건" }),
        h("div", { class: "chips", role: "group", "aria-label": "정렬" }, chip("order", "new", "최신 순"), chip("order", "old", "오래된 순"), chip("order", "name", "이름 순"), chip("order", "size", "큰 파일 순")),
        h("div", { class: "chips", role: "group", "aria-label": "크기" }, chip("size", "", "크기 상관없음"), chip("size", "big", "100MB 이상"), chip("size", "small", "1MB 이하")),
        h("label", { class: "field" }, "연도", h("input", { type: "number", value: st.year, min: 1950, max: 2100, placeholder: "예) 2005", onchange: (e) => run({ year: e.target.value }) }))));
    const out = h("div", { class: "stack", "aria-live": "polite" });
    view.append(out);
    if (!st.q && !st.kind && !st.year) { out.append(App.empty("searching", "찾을 말을 입력하거나 마이크를 눌러 말해 보세요.")); return; }
    out.append(App.empty("searching", "찾는 중이에요…"));
    const params = { q: st.q, kind: st.kind, order: st.order, year: st.year, mode: st.mode,
      min_size: st.size === "big" ? 100 * 1024 * 1024 : "", max_size: st.size === "small" ? 1024 * 1024 : "" };
    const res = await App.api("/api/search?" + App.qs(params));
    out.replaceChildren();
    const head = h("div", { class: "row result-head" }, h("p", { class: "grow", text: `${res.understood} 결과` }), App.speakButton(res.speech, "결과 읽어주기"));
    out.append(head);
    if (App.settings.tts_enabled && query.voice) App.voice.speak(res.speech);
    const section = (title, icon, sec, key) => {
      if (!sec || !sec.items || !sec.items.length) return;
      const box = h("section", {}, h("h2", {}, App.icon(icon), ` ${title} (${sec.total}${sec.more_than ? "개 이상" : "개"})`));
      if (sec.notice) box.append(h("p", { class: "badge st-warn", text: "ℹ " + sec.notice }));
      out.append(box);
      App.renderResults(sec, box, async (page) => {
        const more = await App.api("/api/search?" + App.qs({ ...params, page, mode: key === "content" ? "content" : params.mode }));
        App.renderResults(more[key], box, null);
      });
    };
    section("파일", "file-folder", res.files, "files");
    section("문서 내용", "page-facing-up", res.content, "content");
    if (res.scenes) {
      const box = h("section", {}, h("h2", {}, App.icon("movie-camera"), " 장면"));
      if (res.scenes.notice) box.append(h("p", { class: "badge st-warn", text: "ℹ " + res.scenes.notice }));
      box.append(h("div", { class: "grid" }, (res.scenes.items || []).map((s) => App.renderScene(s))));
      out.append(box);
    }
    if (res.records && res.records.length) out.append(h("section", {}, h("h2", {}, App.icon("notebook"), " 기록"),
      h("div", { class: "list" }, res.records.map(App.renderRecord))));
    if (res.contacts && res.contacts.length) out.append(h("section", {}, h("h2", {}, App.icon("telephone-receiver"), " 연락처"),
      h("div", { class: "list" }, res.contacts.map((c) => h("a", { class: "item", href: `#/contact/${c.id}` }, App.icon("busts-in-silhouette"), h("span", { class: "i-main" }, h("span", { class: "i-name", text: c.name }), h("span", { class: "i-sub", text: (JSON.parse(c.phones || "[]")[0] || "") + (c.relation ? " · " + c.relation : "") })))))));
    if (!out.querySelector("section")) out.append(App.empty("warning", "찾는 자료가 없어요. 다른 말로 찾아보세요."));
    else head.prepend(App.check());
  }, { title: "찾기" });

  App.renderRecord = (r) => h("a", { class: "item", href: `#/record/${r.id}` },
    App.icon({ diary: "notebook", voice_diary: "speaking-head", event: "spiral-calendar", keep: "memo", memo: "memo" }[r.kind] || "memo"),
    h("span", { class: "i-main" }, h("span", { class: "i-name", text: r.title || "(제목 없음)" }),
      h("span", { class: "i-sub", text: `${({ diary: "일기", voice_diary: "음성 일기", event: "일정", keep: "킵 메모", memo: "메모" })[r.kind] || "기록"} · ${App.date(r.at)}` }),
      r.body ? h("span", { class: "snippet", text: r.body.slice(0, 120) }) : null));

  // ================= 파일 보기 =================
  App.route("/file/:id", async (view, id, query) => {
    const f = await App.api(`/api/files/${id}`);
    App.setTitle(f.name);
    const viewer = h("div", { class: "viewer" });
    if (!f.connected) viewer.append(h("p", { class: "badge st-danger", text: "⚠ 하드디스크가 연결되어 있지 않아 원본을 볼 수 없어요." }));
    else if (f.kind === "image") viewer.append(h("img", { src: App.raw(f.id), alt: f.name }));
    else if (f.kind === "video") {
      const v = h("video", { src: App.raw(f.id) + (query.t ? `#t=${query.t}` : ""), controls: true, preload: "metadata", poster: App.thumb(f.id) });
      viewer.append(v);
      if (query.t) v.addEventListener("loadedmetadata", () => { v.currentTime = Number(query.t); v.play().catch(() => {}); }, { once: true });
    } else if (f.kind === "audio") viewer.append(h("audio", { src: App.raw(f.id), controls: true }));
    else viewer.append(App.icon(App.kindIcon(f), "mascot"));
    view.append(viewer);
    const info = h("dl", { class: "info" },
      h("dt", { text: "종류" }), h("dd", { text: App.kindLabel(f) }),
      h("dt", { text: "날짜" }), h("dd", { text: App.date(f.taken_at) }),
      f.place ? [h("dt", { text: "장소" }), h("dd", { text: "📍 " + f.place })] : null,
      h("dt", { text: "크기" }), h("dd", { text: App.size(f.size) + (f.width ? ` · ${f.width}×${f.height}` : "") + (f.duration ? ` · ${Math.round(f.duration)}초` : "") }),
      h("dt", { text: "위치" }), h("dd", { text: f.dir }),
      f.persons && f.persons.length ? [h("dt", { text: "사람" }), h("dd", { text: f.persons.join(", ") })] : null,
      f.tags && f.tags.length ? [h("dt", { text: "장면" }), h("dd", { text: f.tags.join(", ") })] : null);
    const speech = `${App.kindLabel(f)}, ${f.name}. ${App.date(f.taken_at)}. ${f.place ? f.place + "에서. " : ""}위치는 ${f.dir.split(/[\\/]/).pop()} 폴더예요.`;
    view.append(h("div", { class: "card stack", style: { marginTop: "var(--gap)" } }, info,
      h("div", { class: "row" },
        f.can_open_folder ? App.btn("폴더 열기", async () => { try { await App.api(`/api/files/${f.id}/open-folder`, { body: {} }); } catch (e) { App.toast(e.message, "warn"); } }, "btn-primary", "file-folder") : null,
        f.connected ? h("a", { class: "btn btn-ghost", href: App.raw(f.id), target: "_blank", rel: "noopener" }, "원본 열기") : null,
        App.speakButton(speech),
        f.kind === "doc" && App.settings.ai_enabled ? App.btn("AI 요약", async () => {
          if (!(await App.confirm("AI 요약", "이 문서의 글자(앞부분 최대 1만 자)가 외부 AI 회사로 전송돼요. 계속할까요?", "보내고 요약하기"))) return;
          try { const r = await App.api(`/api/ai/summarize/${f.id}`, { body: {} }); App.modal("요약", h("p", { text: r.summary }), [{ label: "닫기", value: 1 }]); } catch (e) { App.toast(e.message, "warn"); }
        }, "btn-ghost", "robot") : null)));
    if (f.preview) view.append(h("h2", { text: "문서 내용 미리보기" }), h("div", { class: "doc-preview", text: f.preview }));

    const notes = h("div", { class: "list" }, (f.notes || []).map((n) => h("div", { class: "item" }, App.icon(n.source === "voice" ? "studio-microphone" : "memo"),
      h("span", { class: "i-main" }, h("span", { class: "i-name", text: n.text }), h("span", { class: "i-sub", text: App.date(n.created_at) })),
      App.btn("지우기", async () => { await App.api(`/api/notes/${n.id}`, { method: "DELETE" }); App.render(); }, "btn-ghost btn-small"))));
    const noteInput = h("input", { type: "text", placeholder: "떠오른 기억을 적어 주세요", "aria-label": "메모" });
    const save = async (text, voice) => { if (!text) return; await App.api(`/api/files/${f.id}/notes`, { body: { text, voice } }); App.toast("메모를 붙였어요.", "ok"); App.render(); };
    view.append(h("h2", { text: "기억 메모" }), notes, h("div", { class: "searchbar" }, noteInput, App.btn("메모 붙이기", () => save(noteInput.value, false), "btn-primary"), App.micButton((t) => save(t, true), "말로 메모")));

    view.append(h("h2", { text: "정리" }), h("div", { class: "row" }, App.btn("휴지통으로 이동", async () => {
      if (!(await App.confirmDanger("휴지통으로 이동", `'${f.name}'을(를) 컴퓨터 휴지통으로 옮겨요. 휴지통에서 언제든 되살릴 수 있어요.`, "휴지통으로 이동"))) return;
      try { const r = await App.api(`/api/files/${f.id}/trash`, { body: { confirm: true } }); App.toast(r.message, "ok", 6000); history.back(); } catch (e) { App.toast(e.message, "danger"); }
    }, "btn-danger", "wastebasket")));
  }, { title: "파일 보기" });

  // ================= 색인 상태(하드 상태) =================
  const STATUS = {
    done: ["st-ok", "✔ 완료"], listed: ["st-progress", "◔ 자세히 분석 중"], scanning: ["st-progress", "◔ 진행 중"],
    idle: ["st-warn", "! 아직 안 함"], disconnected: ["st-danger", "✖ 연결 끊김"],
  };
  App.route("/index", async (view) => {
    const box = h("div", { class: "stack" });
    view.append(App.tip("index", "색인은 하드디스크 속 파일의 목록을 만드는 일이에요. 중간에 멈춰도, 컴퓨터가 꺼져도 다음에 이어서 해요.") || "", box);
    let last = "";
    const draw = async (force) => {
      const s = await App.api("/api/index/status");
      const sig = JSON.stringify(s);
      if (sig === last && force !== true) return;
      last = sig;
      const st = s.state;
      const o = s.overview;
      const phaseLabel = { list: "파일 목록 만드는 중", detail: "사진 정보·문서 내용 읽는 중", faces: "얼굴 찾는 중", scenes: "장면 꼬리표 붙이는 중", disconnected: "연결 끊김 — 기다리는 중", done: "다 했어요", stopped: "멈춤", error: "문제가 생겨 멈춤", idle: "쉬는 중", start: "준비 중" }[st.phase] || st.message;
      box.replaceChildren(
        h("div", { class: "card stack" },
          h("div", { class: "row" }, App.mascot(s.running ? "searching" : st.phase === "done" ? "celebrate" : "hello", "mascot " + (s.running ? "mascot-bounce" : st.phase === "done" ? "celebrate" : "")),
            h("div", { class: "grow" }, h("div", { class: "t-title", text: st.paused ? "잠시 멈춤" : phaseLabel }), h("div", { class: "muted", text: st.message }),
              st.folder ? h("div", { class: "muted small", text: "지금: " + st.folder }) : null)),
          h("div", { class: "bar " + (s.running ? "moving" : st.phase === "done" ? "ok" : ""), role: "progressbar", "aria-valuenow": st.percent, "aria-label": "진행률" }, h("span", { style: { width: Math.max(2, st.percent) + "%" } })),
          h("p", { text: `${st.percent}% · 찾은 파일 ${st.files_seen.toLocaleString()}개 · 읽을 수 없음 ${st.errors}개` }),
          h("div", { class: "row" },
            s.running ? (st.paused ? App.btn("이어서 하기", async () => { await App.api("/api/index/resume", { body: {} }); draw(); }, "btn-accent")
              : App.btn("잠시 멈춤", async () => { await App.api("/api/index/pause", { body: {} }); draw(); }, "btn-warn"))
              : App.btn("색인 시작 (새 파일만 다시 분석)", async () => { try { await App.api("/api/index/start", { body: {} }); draw(); } catch (e) { App.toast(e.message, "warn"); } }, "btn-accent", "magnifying-glass-tilted-left"),
            s.running ? App.btn("멈추기", async () => { await App.api("/api/index/stop", { body: {} }); setTimeout(draw, 500); }, "btn-ghost") : null)),
        h("div", { class: "card" }, h("p", { text: `전체 ${o.total.toLocaleString()}개 — 📷 사진 ${o.images.toLocaleString()} · 🎬 영상 ${o.videos.toLocaleString()} · 📄 문서 ${o.docs.toLocaleString()} · 🔊 소리 ${o.audios.toLocaleString()} · 합계 ${App.size(o.bytes)}` })),
        h("h2", { text: "하드디스크별 상태" }),
        h("div", { class: "list" }, s.roots.map((r) => {
          const [cls, label] = STATUS[r.status] || ["", r.status];
          return h("div", { class: `card drive s-${r.status}` }, h("div", { class: "row" },
            App.icon("computer-disk"), h("div", { class: "grow" }, h("div", { class: "t-name", style: { fontWeight: 700 }, text: r.label }), h("div", { class: "muted small", text: r.path })),
            h("span", { class: "badge " + cls, text: label })),
            h("p", { class: "small", text: `파일 ${r.files_count.toLocaleString()}개 · 마지막 완료 ${r.last_scan_done ? App.date(r.last_scan_done) : "아직 없음"}` }),
            r.status === "disconnected" ? h("p", { class: "badge st-danger", text: "하드디스크를 다시 연결하면 이어서 해요." }) : null,
            h("div", { class: "row" },
              App.btn("제외 폴더 추가", async () => { const ex = await App.pickFolder("분석에서 뺄 폴더"); if (ex) { await App.api(`/api/roots/${r.id}`, { method: "PATCH", body: { excluded: [...r.excluded, ex] } }); draw(); } }, "btn-ghost btn-small"),
              App.btn("목록에서 빼기", async () => {
                if (!(await App.confirm("목록에서 빼기", "이 하드디스크의 색인만 지워요. 하드디스크 안의 파일은 그대로예요.", "빼기", "btn-danger"))) return;
                await App.api(`/api/roots/${r.id}`, { method: "DELETE" }); draw();
              }, "btn-ghost btn-small")));
        })),
        h("div", { class: "row" },
          App.btn("하드디스크·폴더 추가", async () => { const p = await App.pickFolder(); if (!p) return; try { await App.api("/api/roots", { body: { path: p } }); draw(); } catch (e) { App.toast(e.message, "warn"); } }, "btn-primary", "computer-disk"),
          App.link(`읽을 수 없음 목록 (${o.unreadable})`, "#/unreadable", "btn-ghost", "warning")));
    };
    await draw();
    const timer = setInterval(() => { if (!document.hidden && !document.querySelector(".modal-back")) draw().catch(() => {}); }, 2000);
    App.cleanup = () => clearInterval(timer);
  }, { title: "하드 상태" });

  App.route("/unreadable", async (view, query) => {
    const page = Number(query.page || 1);
    const r = await App.api("/api/unreadable?page=" + page);
    view.append(h("p", { text: `읽을 수 없는 파일·폴더 ${r.total}개. 이 파일들은 건너뛰고 나머지는 모두 색인했어요.` }));
    if (!r.total) { view.append(App.empty("celebrate", "읽을 수 없는 파일이 없어요!")); return; }
    view.append(h("div", { class: "list" }, r.items.map((u) => h("div", { class: "item" }, App.icon("warning"),
      h("span", { class: "i-main" }, h("span", { class: "i-name", text: u.path.split(/[\\/]/).pop() }), h("span", { class: "i-sub", text: "이유: " + u.reason }), h("span", { class: "i-sub", text: u.path }))))));
    if (page * 50 < r.total) view.append(App.link("다음 쪽", "#/unreadable?page=" + (page + 1), "btn-ghost"));
  }, { title: "읽을 수 없음" });

  // ================= 문서 =================
  App.route("/docs", async (view, query) => {
    const types = [["", "전체"], ["hwp,hwpx", "한글"], ["xlsx,xls,xlsm,csv", "엑셀"], ["docx,doc", "워드"], ["pdf", "PDF"], ["txt,md,rtf", "글"], ["pptx,ppt", "파워포인트"]];
    const ext = query.ext || "";
    const input = h("input", { type: "search", placeholder: "문서 안의 글자로 찾기 (예: 계약금)", "aria-label": "문서 내용 검색" });
    const go = (t) => App.go("#/search?" + App.qs({ q: t ?? input.value, mode: "content", kind: "doc" }));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    view.append(h("div", { class: "searchbar" }, input, App.btn("내용으로 찾기", () => go(), "btn-primary", "magnifying-glass-tilted-left"), App.micButton((t) => go(t))));
    view.append(h("div", { class: "chips", role: "group", "aria-label": "문서 종류" }, types.map(([v, l]) =>
      h("button", { class: "chip", type: "button", "aria-pressed": String(ext === v), onclick: () => App.go("#/docs?" + App.qs({ ext: v })) }, l))));
    const box = h("div", { class: "stack" });
    view.append(box);
    const load = async (page) => {
      const r = await App.api("/api/search?" + App.qs({ kind: "doc", ext, page, order: "new", q: "" }));
      if (page === 1 && !r.files.total) box.append(App.empty("hello", "아직 문서가 없어요. 색인이 끝나면 여기에 보여요."));
      App.renderResults(r.files, box, load);
    };
    await load(1);
  }, { title: "문서" });
})();
