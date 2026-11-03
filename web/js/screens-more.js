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
})();
