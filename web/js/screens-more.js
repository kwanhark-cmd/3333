/* 사람(얼굴), 장면, 중복 정리, 기록·인맥 지도 */
(function () {
  "use strict";
  const App = window.App;
  const h = App.h;

  // ================= 중복 정리 =================
  App.route("/dupes", async (view) => {
    view.append(App.tip("dupes", "크기가 같은 파일끼리 내용까지 비교해 똑같은 파일을 찾아요. 자동으로 지우지 않아요. 지울 파일을 직접 골라 '휴지통으로 이동'을 누르세요.") || "");
    const box = h("div", { class: "stack" });
    view.append(box);
    let timer = null;
    const draw = async () => {
      const d = await App.api("/api/duplicates");
      box.replaceChildren();
      box.append(h("div", { class: "card row" }, App.icon("broom"), h("div", { class: "grow" },
        h("div", { class: "t-title", text: d.state.running ? "비교하는 중…" : `같은 파일 묶음 ${d.total}개` }),
        h("div", { class: "muted", text: d.state.running ? `${d.state.done}/${d.state.total}` : `정리하면 약 ${App.size(d.saving_bytes)} 비울 수 있어요` })),
        App.btn(d.state.running ? "찾는 중" : "중복 찾기", async () => { await App.api("/api/duplicates/scan", { body: {} }); draw(); }, "btn-accent", "magnifying-glass-tilted-left", { disabled: d.state.running })));
      if (d.state.running) { clearTimeout(timer); timer = setTimeout(draw, 1200); return; }
      if (!d.items.length) { box.append(App.empty("celebrate", "같은 파일이 없거나 아직 찾지 않았어요.")); return; }
      for (const g of d.items) {
        box.append(h("section", { class: "card stack" }, h("h3", { text: `똑같은 파일 ${g.count}개 · 각각 ${App.size(g.size)}` }),
          h("div", { class: "list" }, g.files.map((f, idx) => h("div", { class: "item" },
            (f.kind === "image") ? h("img", { class: "ico", src: App.thumb(f.id), alt: "" }) : App.icon(App.kindIcon(f)),
            h("span", { class: "i-main" }, h("a", { class: "i-name", href: `#/file/${f.id}`, text: f.name }), h("span", { class: "i-sub", text: "📁 " + f.dir }),
              idx === 0 ? h("span", { class: "badge st-ok", text: "✔ 가장 오래된 원본(남기기 추천)" }) : null),
            App.btn("휴지통으로 이동", async () => {
              if (!(await App.confirmDanger("휴지통으로 이동", `'${f.name}'을(를) 컴퓨터 휴지통으로 옮겨요. 같은 파일이 다른 곳에 남아 있고, 휴지통에서 되살릴 수 있어요.`, "휴지통으로 이동"))) return;
              try { const r = await App.api(`/api/files/${f.id}/trash`, { body: { confirm: true } }); App.toast(r.message, "ok", 6000); draw(); } catch (e) { App.toast(e.message, "danger"); }
            }, "btn-danger btn-small", "wastebasket"))))));
      }
    };
    await draw();
    App.cleanup = () => clearTimeout(timer);
  }, { title: "중복 파일 정리" });

  // ================= 사람(얼굴) =================
  const modelOff = (st, which) => h("div", { class: "card stack" }, App.mascot("warning"),
    h("p", { class: "t-title", text: which === "faces" ? "얼굴 인식이 아직 꺼져 있어요" : "장면 인식이 아직 꺼져 있어요" }),
    h("p", { text: (which === "faces" ? st.faces_reason : st.scenes_reason) || "" }),
    h("p", { class: "muted", text: "모델 파일을 PC의 앱 폴더(models)에 넣으면 켜져요. 설치 방법은 설명서(docs/모델설치.md)에 있어요. 모든 인식은 PC 안에서만 해요." }));

  App.route("/people", async (view) => {
    const st = await App.api("/api/recognition");
    const people = await App.api("/api/persons");
    view.append(App.tip("people", "같은 사람의 얼굴을 자동으로 묶었어요. 사진을 눌러 이름을 붙이면 이름으로 찾을 수 있어요. 한 사람이 둘로 나뉘었으면 '두 사람 합치기'를 누르세요.") || "");
    if (!st.faces && !people.length) { view.append(modelOff(st, "faces")); }
    view.append(h("div", { class: "row" },
      st.faces ? App.btn("얼굴 찾기 시작/이어서", async () => { const r = await App.api("/api/recognition/start", { body: {} }); App.toast(r.message, "ok"); }, "btn-accent", "magnifying-glass-tilted-left") : null,
      App.link("가족 목소리 모음", "#/voices", "btn-ghost", "speaking-head"),
      people.length > 1 ? App.btn("두 사람 합치기", () => mergeDialog(people), "btn-primary", "link") : null));
    if (st.pending_faces && st.faces) view.append(h("p", { class: "badge st-progress", text: `◔ 아직 얼굴을 찾지 않은 사진·영상 ${st.pending_faces.toLocaleString()}개` }));
    if (!people.length) { if (st.faces) view.append(App.empty("searching", "아직 묶인 얼굴이 없어요. 얼굴 찾기를 시작해 보세요.")); return; }
    view.append(h("div", { class: "grid stagger", style: { marginTop: "var(--gap)" } }, people.map((p) => h("a", { class: "thumb-card", href: `#/person/${p.id}`, title: p.name || "이름 없는 사람" },
      h("img", { src: App.url(`/api/faces/${p.cover_face_id}/thumb`), alt: p.name || "이름 없는 사람", loading: "lazy", onerror: (e) => e.target.replaceWith(App.icon("busts-in-silhouette")) }),
      h("span", { class: "badge " + (p.name ? "st-ok" : "st-warn"), text: `${p.name || "이름 붙이기"} · ${p.n}` })))));
  }, { title: "사람" });

  async function mergeDialog(people, keepId) {
    const opts = (sel) => people.map((p) => h("option", { value: p.id, selected: p.id === sel, text: `${p.name || "이름 없는 사람 #" + p.id} (${p.n}장)` }));
    const a = h("select", { "aria-label": "남길 사람" }, opts(keepId || people[0].id));
    const b = h("select", { "aria-label": "합칠 사람" }, opts(people.find((p) => p.id !== (keepId || people[0].id)).id));
    const ok = await App.modal("두 사람 합치기", h("div", { class: "stack" }, h("p", { text: "같은 사람이 둘로 나뉘었을 때 하나로 합쳐요." }),
      h("label", { class: "field" }, "남길 사람", a), h("label", { class: "field" }, "합칠 사람(이 사람의 사진이 위 사람으로 옮겨져요)", b)),
    [{ label: "취소", value: false }, { label: "합치기", value: true, cls: "btn-accent" }]);
    if (!ok) return;
    try { const r = await App.api("/api/persons/merge", { body: { keep: Number(a.value), merge: Number(b.value) } }); App.toast(r.message, "ok"); App.render(); } catch (e) { App.toast(e.message, "warn"); }
  }

  App.route("/person/:id", async (view, id, query) => {
    const page = Number(query.page || 1);
    const d = await App.api(`/api/persons/${id}?page=${page}`);
    const name = d.person.name || "이름 없는 사람";
    App.setTitle(name);
    view.append(h("div", { class: "row" },
      App.btn(d.person.name ? "이름 바꾸기" : "이름 붙이기", async () => {
        const n = await App.prompt("이름 붙이기", "이 사람의 이름 (예: 엄마, 민수)", d.person.name);
        if (n !== null) { const r = await App.api(`/api/persons/${id}`, { body: { name: n } }); App.toast(r.message, "ok"); App.render(); }
      }, "btn-accent", "memo"),
      App.btn("다른 사람과 합치기", async () => mergeDialog(await App.api("/api/persons"), Number(id)), "btn-ghost", "link"),
      d.person.name ? App.link(`'${name}' 사진·영상 찾기`, "#/search?" + App.qs({ q: name }), "btn-primary", "magnifying-glass-tilted-left") : null,
      App.speakButton(`${name}. 사진과 영상 ${d.total}개${d.voices ? `, 목소리 ${d.voices}개` : ""}가 있어요.`)));
    view.append(h("p", { text: `사진·영상 ${d.total}개` }));
    view.append(h("div", { class: "grid stagger" }, d.items.map((it) => h("div", { class: "stack", style: { gap: "4px" } }, App.renderFileItem(it),
      App.btn("이 사람이 아니에요", async () => { await App.api(`/api/faces/${it.face_id}/reject`, { body: {} }); App.render(); }, "btn-ghost btn-small")))));
    if (page * 60 < d.total) view.append(App.link("다음 쪽", `#/person/${id}?page=${page + 1}`, "btn-ghost"));
  }, { title: "사람" });

  App.route("/voices", async (view, query) => {
    const d = await App.api("/api/voices?" + App.qs({ person_id: query.person }));
    const people = (await App.api("/api/persons")).filter((p) => p.name);
    view.append(h("p", { text: "영상과 녹음에서 사람 목소리 구간을 찾았어요. 누구 목소리인지 이름을 붙이면 이름별로 모아 볼 수 있어요." }));
    view.append(h("div", { class: "chips" }, h("a", { class: "chip", href: "#/voices", "aria-pressed": String(!query.person), style: { display: "inline-flex", alignItems: "center", textDecoration: "none" } }, `전체 (이름 없음 ${d.unnamed})`),
      d.groups.map((g) => h("a", { class: "chip", href: `#/voices?person=${g.id}`, "aria-pressed": String(String(g.id) === query.person), style: { display: "inline-flex", alignItems: "center", textDecoration: "none" } }, `🗣 ${g.name} (${g.n})`))));
    if (!d.items.length) { view.append(App.empty("hello", "아직 찾은 목소리 구간이 없어요. 색인이 끝나면 여기에 보여요.")); return; }
    const sec = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, "0")}`;
    view.append(h("div", { class: "list" }, d.items.map((v) => h("div", { class: "item" }, App.icon("speaking-head"),
      h("span", { class: "i-main" }, h("span", { class: "i-name", text: v.person || "누구 목소리일까요?" }), h("span", { class: "i-sub", text: `${v.name} · ${sec(v.t_start)}~${sec(v.t_end)} · ${App.date(v.taken_at)}` })),
      App.link("듣기", `#/file/${v.file_id}?t=${Math.floor(v.t_start)}`, "btn-primary btn-small"),
      App.btn("이름", async () => {
        const sel = h("select", { "aria-label": "사람 고르기" }, h("option", { value: "", text: "(새 이름 적기)" }), people.map((p) => h("option", { value: p.id, text: p.name })));
        const input = h("input", { type: "text", placeholder: "새 이름", "aria-label": "새 이름" });
        const ok = await App.modal("누구 목소리인가요?", h("div", { class: "stack" }, h("label", { class: "field" }, "있는 사람", sel), h("label", { class: "field" }, "또는 새 이름", input)),
          [{ label: "취소", value: false }, { label: "저장", value: true, cls: "btn-accent" }]);
        if (!ok) return;
        try { await App.api(`/api/voices/${v.id}`, { body: { person_id: sel.value ? Number(sel.value) : null, name: input.value } }); App.render(); } catch (e) { App.toast(e.message, "warn"); }
      }, "btn-ghost btn-small")))));
  }, { title: "가족 목소리 모음" });

  // ================= 장면 =================
  App.route("/scenes", async (view, query) => {
    const st = await App.api("/api/recognition");
    const input = h("input", { type: "search", value: query.q || "", placeholder: "예) 비 오는 장면, 바닷가, 생일", "aria-label": "찾을 장면" });
    const go = (t) => App.go("#/scenes?" + App.qs({ q: t ?? input.value }));
    input.addEventListener("keydown", (e) => { if (e.key === "Enter") go(); });
    view.append(h("div", { class: "searchbar" }, input, App.btn("장면 찾기", () => go(), "btn-primary", "movie-camera"), App.micButton((t) => go(t))));
    if (!st.scenes) view.append(modelOff(st, "scenes"));
    const cols = await App.api("/api/scene-collections");
    view.append(h("h2", {}, App.icon("film-frames"), " 장면 모음"), h("div", { class: "row" },
      cols.map((c) => App.link(`${c.name} (${c.n})`, `#/collection/${c.id}`, "btn-ghost btn-small")),
      App.btn("새 모음 만들기", async () => { const n = await App.prompt("새 장면 모음", "모음 이름 (예: 아이들 첫걸음)"); if (n) { await App.api("/api/scene-collections", { body: { name: n } }); App.render(); } }, "btn-ghost btn-small")));
    if (!query.q) return;
    const r = await App.api("/api/scenes?" + App.qs({ q: query.q }));
    if (r.notice) view.append(h("p", { class: "badge st-warn", text: "ℹ " + r.notice }));
    if (!r.items.length) { view.append(App.empty("warning", "그런 장면을 찾지 못했어요.")); return; }
    view.append(h("h2", { text: `찾은 장면 ${r.items.length}개` }), h("div", { class: "grid stagger" }, r.items.map((s) => h("div", { class: "stack", style: { gap: "4px" } }, App.renderScene(s),
      cols.length ? App.btn("모음에 담기", async () => {
        const sel = h("select", { "aria-label": "모음 고르기" }, cols.map((c) => h("option", { value: c.id, text: c.name })));
        if (await App.modal("모음에 담기", h("label", { class: "field" }, "어느 모음에 담을까요?", sel), [{ label: "취소", value: false }, { label: "담기", value: true, cls: "btn-accent" }])) {
          await App.api(`/api/scene-collections/${sel.value}/items`, { body: { scene_id: s.id } }); App.toast("담았어요.", "ok");
        }
      }, "btn-ghost btn-small") : null))));
  }, { title: "장면 찾기" });

  App.route("/collection/:id", async (view, id) => {
    const d = await App.api(`/api/scene-collections/${id}`);
    App.setTitle("🎞 " + d.collection.name);
    view.append(h("div", { class: "row" },
      d.items.length ? App.link("이어서 재생(상영관)", `#/theater?collection=${id}`, "btn-accent", "television") : null,
      App.btn("내보내기 폴더로 저장", async () => { const r = await App.api(`/api/scene-collections/${id}/export`, { body: {} }); App.toast(r.message, "ok", 8000); }, "btn-ghost", "inbox-tray")));
    if (!d.items.length) { view.append(App.empty("hello", "아직 담은 장면이 없어요. 장면 찾기에서 '모음에 담기'를 눌러 보세요.")); return; }
    view.append(h("div", { class: "grid stagger" }, d.items.map((s) => h("div", { class: "stack", style: { gap: "4px" } }, App.renderScene(s),
      App.btn("빼기", async () => { await App.api(`/api/scene-collections/${id}/items`, { body: { scene_id: s.id, remove: true } }); App.render(); }, "btn-ghost btn-small")))));
  }, { title: "장면 모음" });
})();
