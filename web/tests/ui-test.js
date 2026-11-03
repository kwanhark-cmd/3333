/* 보기 화면 자동 테스트(Playwright).
 * 실행: node web/tests/ui-test.js   (엔진을 임시 폴더로 직접 띄움)
 * 1) 흐름: 폴더 선택 → 색인 → 이름 검색 → 내용 검색 → 음성 검색 → 날짜별 보기 → 중복 찾기(휴지통 확인 창까지)
 * 2) 디자인: 360×640·가장 큰 글씨·어두운·고대비 모드에서 잘림·겹침 없음, 글자 대비(WCAG AA), 움직임 줄이기
 */
const { chromium } = require("playwright");
const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");
const assert = require("assert");

const ROOT = path.resolve(__dirname, "../..");
const PORT = 47000 + Math.floor(Math.random() * 900);
const BASE = `http://127.0.0.1:${PORT}/`;
const HOME = fs.mkdtempSync(path.join(os.tmpdir(), "hdui-"));
const PY = process.env.PYTHON || (process.platform === "win32" ? "python" : "python3");
const results = [];
let failed = 0;

async function step(name, fn) {
  const t0 = Date.now();
  try { await fn(); results.push(`✔ ${name} (${Date.now() - t0}ms)`); }
  catch (e) { failed++; results.push(`✖ ${name}: ${e.message}`); }
}

async function api(p, body) {
  const r = await fetch(BASE + p.replace(/^\//, ""), body ? { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) } : {});
  return r.json();
}

async function waitServer() {
  for (let i = 0; i < 100; i++) {
    try { const r = await fetch(BASE + "api/health"); if (r.ok) return; } catch (e) { /* 기다림 */ }
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error("엔진이 시작되지 않음");
}

// ---- 디자인 검사 도우미(브라우저 안에서 실행) ----
const layoutCheck = () => {
  const problems = [];
  const vw = document.documentElement.clientWidth;
  if (document.documentElement.scrollWidth > vw + 1) problems.push(`가로 넘침 ${document.documentElement.scrollWidth}>${vw}`);
  const els = document.querySelectorAll("button, a.btn, a.tile, .tile, .chip, h1, h2, .t-name, .t-desc, .i-name, .badge, label, p, input, select");
  for (const el of els) {
    const st = getComputedStyle(el);
    if (st.display === "none" || st.visibility === "hidden" || el.closest("[hidden], .sr-only, details:not([open]) > :not(summary)")) continue;
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) continue;
    if (r.right > vw + 1 || r.left < -1) problems.push(`화면 밖: ${el.tagName}.${el.className} "${(el.textContent || "").trim().slice(0, 20)}"`);
    if (el.scrollWidth > el.clientWidth + 2 && st.overflowX !== "auto" && el.tagName !== "INPUT") problems.push(`글자 잘림: ${el.tagName}.${el.className} "${(el.textContent || "").trim().slice(0, 20)}"`);
    if (el.matches("button, a.btn, .chip") && r.height < 47.5) problems.push(`터치 영역 작음(${Math.round(r.height)}px): "${el.textContent.trim().slice(0, 15)}"`);
    if (el.matches(".btn:not(.btn-small):not(.navbtn)") && r.height < 55.5) problems.push(`버튼 높이 56px 미만(${Math.round(r.height)}px): "${el.textContent.trim().slice(0, 15)}"`);
  }
  // 타일끼리 겹침
  const tiles = [...document.querySelectorAll(".tile")].map((t) => t.getBoundingClientRect());
  for (let i = 0; i < tiles.length; i++) for (let j = i + 1; j < tiles.length; j++) {
    const a = tiles[i], b = tiles[j];
    if (a.left < b.right - 1 && b.left < a.right - 1 && a.top < b.bottom - 1 && b.top < a.bottom - 1) problems.push(`타일 겹침 ${i},${j}`);
  }
  return problems;
};

const contrastCheck = () => {
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const bgOf = (el) => { for (let e = el; e; e = e.parentElement) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c.a > 0.5 && getComputedStyle(e).backgroundImage === "none") return c; } return parse(getComputedStyle(document.body).backgroundColor); };
  const bad = [];
  const seen = new Set();
  for (const el of document.querySelectorAll("body *")) {
    if (!el.childNodes.length || ![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) continue;
    const st = getComputedStyle(el);
    if (st.visibility === "hidden" || st.display === "none" || el.closest(".viewer, .theater, .sr-only, [hidden]")) continue;
    const r = el.getBoundingClientRect(); if (!r.width) continue;
    if (parseFloat(st.opacity) < 1 || el.closest("button:disabled")) continue;
    const fg = parse(st.color), bg = bgOf(el);
    if (!fg || !bg) continue;
    const L1 = lum(fg), L2 = lum(bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    if (ratio < 4.5) { const k = el.className + st.color + ratio.toFixed(1); if (!seen.has(k)) { seen.add(k); bad.push(`${ratio.toFixed(2)}:1 "${el.textContent.trim().slice(0, 15)}" (${el.tagName}.${el.className})`); } }
  }
  return bad;
};

(async () => {
  const env = { ...process.env, HDBISEO_HOME: HOME, HDBISEO_PORT: String(PORT), PYTHONIOENCODING: "utf-8", HDBISEO_FAKE_MODELS: "1" };
  const server = spawn(PY, ["-m", "hdbiseo", "--no-browser"], { cwd: path.join(ROOT, "engine"), env, stdio: "inherit" });
  let browser;
  try {
    await waitServer();
    browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 1200, height: 900 } });
    // 마이크 흉내: 음성 인식이 "2005년 아이들 영상 찾아줘"를 들은 것처럼
    await ctx.addInitScript(() => {
      class FakeSR { start() { setTimeout(() => this.onresult && this.onresult({ results: [[{ transcript: window.__say || "2005년 아이들 영상 찾아줘" }]] }), 50); } }
      window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
    });
    const page = await ctx.newPage();
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));

    await step("첫 실행 마법사가 열린다", async () => {
      await page.goto(BASE);
      await page.waitForSelector("text=반가워요");
    });
    await step("글씨 크기 선택", async () => {
      await page.click("button.tile:has-text('아주 크게')");
      await page.waitForFunction(() => document.documentElement.dataset.font === "2");
      await page.click("button.tile:has-text('보통')");
      await page.click("text=다음");
    });
    await step("폴더 선택(폴더 고르기 창) → 체험용 예제 추가", async () => {
      await page.click("text=하드디스크·폴더 추가");
      await page.waitForSelector(".modal >> text=이 폴더 선택");
      await page.click(".modal >> text=취소");
      await page.click("text=체험용 예제 폴더로 해보기");
      await page.waitForSelector(".item >> text=체험용 예제");
      await page.click("text=다음");
    });
    await step("밤 시간 선택 → 예상 시간 → 색인 시작", async () => {
      await page.click("button.tile:has-text('지금 바로 시작')");
      await page.waitForSelector("text=예상 시간");
      await page.click("text=색인 시작하기");
      await page.waitForSelector("text=하드디스크별 상태");
    });
    await step("색인 완료", async () => {
      for (let i = 0; i < 120; i++) { const s = await api("/api/index/status"); if (!s.running && s.state.phase === "done") return; await new Promise((r) => setTimeout(r, 500)); }
      throw new Error("색인이 끝나지 않음");
    });
    await step("이름 검색", async () => {
      await page.goto(BASE + "#/");
      await page.fill("input[type=search]", "계약서");
      await page.press("input[type=search]", "Enter");
      await page.waitForSelector(".i-name:has-text('계약서_2023.hwpx')");
    });
    await step("치는 대로 바로 찾기(엔터 없이)", async () => {
      await page.goto(BASE + "#/search");
      await page.type("input[type=search]", "회의록", { delay: 30 });
      await page.waitForSelector(".i-name:has-text('회의록.docx')");
    });
    await step("말로 '지워줘'라고 해도 지우지 않고 버튼 안내", async () => {
      await page.goto(BASE + "#/search?q=" + encodeURIComponent("계약서 지워줘"));
      await page.waitForSelector("text=지우기는 말로 할 수 없어요");
    });
    await step("내용 검색(문장 미리보기 강조)", async () => {
      await page.goto(BASE + "#/search?q=" + encodeURIComponent("계약금 들어간 문서 찾아줘"));
      await page.waitForSelector("mark:has-text('계약금')");
      const n = await page.locator(".snippet").count();
      assert(n >= 4, "미리보기 " + n);
    });
    await step("음성 검색(마이크)", async () => {
      await page.goto(BASE + "#/");
      await page.click("button.mic");
      await page.waitForSelector("img[alt*='2005_가족여행.mp4']");
      assert((await page.inputValue("input[type=search]")).includes("2005년"));
    });
    await step("날짜별 보기(연→월→사진)", async () => {
      await page.goto(BASE + "#/photos");
      await page.click("a.tile:has-text('2005년')");
      await page.click("a.tile:has-text('8월')");
      await page.waitForSelector(".thumb-card img");
    });
    await step("추억(N년 전 오늘)·장소·상영관", async () => {
      await page.goto(BASE + "#/memories");
      await page.waitForSelector("h2:has-text('3년 전 오늘')");
      await page.goto(BASE + "#/places");
      await page.waitForSelector("text=속초");
      await page.goto(BASE + "#/theater?year=2005");
      await page.waitForSelector(".theater img, .theater video");
      await page.keyboard.press("Escape");
    });
    await step("음성 메모 붙이기", async () => {
      const r = await api("/api/search?q=" + encodeURIComponent("생일잔치"));
      await page.evaluate(() => { window.__say = "삼촌이 케이크를 사 왔다"; });
      await page.goto(BASE + `#/file/${r.files.items[0].id}`);
      await page.click("button.mic:has-text('말로 메모')");
      await page.waitForSelector(".i-name:has-text('삼촌이 케이크를')");
    });
    await step("중복 찾기 → 휴지통 확인 창(2단계) → 취소 시 파일 그대로", async () => {
      await page.goto(BASE + "#/dupes");
      await page.click("button:has-text('중복 찾기')");
      await page.waitForSelector("h3:has-text('똑같은 파일 2개')", { timeout: 20000 });
      const target = path.join(HOME, "체험용_예제폴더", "사진", "추억", "바닷가_아이들(복사본).jpg");
      assert(fs.existsSync(target));
      await page.locator("button:has-text('휴지통으로 이동')").last().click();
      await page.waitForSelector(".modal h2:has-text('휴지통으로 이동')");
      await page.click(".modal >> text=계속");
      await page.waitForSelector(".modal h2:has-text('정말 할까요?')");
      await page.click(".modal >> text=취소");
      assert(fs.existsSync(target), "취소했는데 파일이 사라짐");
    });
    await step("사람: 얼굴 묶음 → 이름 붙이기 → 이름으로 찾기", async () => {
      await page.goto(BASE + "#/people");
      await page.waitForSelector(".thumb-card img");
      await page.locator(".thumb-card").first().click();
      await page.click("button:has-text('이름 붙이기')");
      await page.fill(".modal input", "민수");
      await page.click(".modal >> text=확인");
      await page.waitForSelector("#page-title:has-text('민수')");
      const r = await api("/api/search?q=" + encodeURIComponent("민수 사진"));
      assert(r.files.total >= 1, "이름으로 찾기 실패");
    });
    await step("사람: 두 사람 합치기", async () => {
      const before = (await api("/api/persons")).length;
      await page.goto(BASE + "#/people");
      await page.click("button:has-text('두 사람 합치기')");
      await page.click(".modal .actions button:has-text('합치기')");
      await page.waitForSelector(".toast:has-text('합쳤어요')");
      assert.strictEqual((await api("/api/persons")).length, before - 1);
    });
    await step("장면: '바닷가 장면' 찾기 → 모음에 담기", async () => {
      await api("/api/scene-collections", { name: "여름 바다" });
      await page.goto(BASE + "#/scenes?q=" + encodeURIComponent("바닷가"));
      await page.waitForSelector(".thumb-card img[alt^='장면']");
      await page.locator("button:has-text('모음에 담기')").first().click();
      await page.click(".modal .actions button:has-text('담기')");
      await page.waitForSelector(".toast:has-text('담았어요')");
    });
    await step("가족 목소리 모음: 구간 보이기", async () => {
      await page.goto(BASE + "#/voices");
      await page.waitForSelector("text=누구 목소리일까요?");
    });
    await step("기록: 연락처·일정·킵 파일 가져오기, 워드 일기장", async () => {
      const d = path.join(HOME, "체험용_예제폴더", "내기록");
      await page.goto(BASE + "#/records/import");
      for (const [label, file] of [["연락처 파일(.vcf)", "연락처.vcf"], ["일정 파일(.ics)", "구글캘린더.ics"], ["구글 킵(테이크아웃)", "takeout-keep.zip"]]) {
        // 한글 경로 파일은 Playwright가 조용히 무시하므로 내용으로 넘김
        await page.setInputFiles(`input[aria-label='${label}']`, { name: file, mimeType: "application/octet-stream", buffer: fs.readFileSync(path.join(d, file)) });
        await page.locator("section", { has: page.locator(`input[aria-label='${label}']`) }).locator("button:has-text('가져오기')").click();
        await page.waitForSelector(".toast:has-text('가져왔어요')");
        await page.evaluate(() => document.querySelectorAll(".toast").forEach((t) => t.remove()));
      }
      const r = await fetch(BASE + "api/import/diary-folder", { method: "POST", body: new URLSearchParams({ path: path.join(HOME, "체험용_예제폴더", "일기장") }) }).then((x) => x.json());
      assert.strictEqual(r.added, 1, JSON.stringify(r));
    });
    await step("기록: 말로 일기 쓰기 → 저장 → 읽어주기 버튼", async () => {
      await page.evaluate(() => { window.__say = "오늘은 이영희와 공원에 갔다"; });
      await page.goto(BASE + "#/diary/new");
      await page.click("button.mic");
      await page.waitForFunction(() => document.querySelector("textarea").value.includes("공원"));
      await page.click("button:has-text('일기 저장')");
      await page.waitForSelector(".doc-preview:has-text('공원')");
      await page.waitForSelector("button:has-text('일기 읽어주기')");
    });
    await step("기록: 이름 연결 '맞아요' 확인", async () => {
      await page.waitForSelector(".item:has-text('이영희') >> text=? 확인 필요");
      await page.click(".item:has-text('이영희') >> button:has-text('맞아요')");
      await page.waitForSelector(".item:has-text('이영희') >> text=✔ 확인됨");
    });
    await step("인맥 지도: 그림과 연결 목록, 확인·수정", async () => {
      await page.goto(BASE + "#/network");
      await page.waitForSelector("svg.netmap text:has-text('신제품')");
      const before = await page.locator(".item:has-text('확인 필요')").count();
      await page.locator(".item:has-text('확인 필요') >> button:has-text('맞아요')").first().click();
      await page.waitForFunction((n) => document.querySelectorAll(".item .badge.st-warn").length === n - 1, before);
    });
    await step("통합 검색: 파일·기록·연락처 한 번에", async () => {
      await page.goto(BASE + "#/search?q=" + encodeURIComponent("김철수"));
      await page.waitForSelector("h2:has-text('기록')");
      await page.waitForSelector("h2:has-text('연락처')");
      await page.waitForSelector("h2:has-text('문서 내용')");
    });
    await step("음성 인식이 없는 기기: 마이크 대신 글자 입력칸", async () => {
      const p2 = await browser.newPage();
      await p2.addInitScript(() => { delete window.SpeechRecognition; delete window.webkitSpeechRecognition; });
      await p2.goto(BASE + "#/search");
      await p2.waitForSelector("input[type=search]");
      assert.strictEqual(await p2.locator("button.mic").count(), 0);
      await p2.close();
    });

    // ---- 디자인 검사 ----
    const routes = ["#/", "#/search?q=" + encodeURIComponent("계약금 들어간 문서"), "#/photos", "#/photos?year=2005", "#/index", "#/settings", "#/dupes", "#/docs", "#/wizard?step=4", "#/unreadable", "#/memories", "#/places", "#/people", "#/scenes?q=" + encodeURIComponent("바닷가"), "#/voices", "#/records", "#/contacts", "#/network", "#/records/import", "#/diary/new", "#/record/1", "#/contact/1"];
    const extra = (process.env.UI_EXTRA_ROUTES || "").split(",").filter(Boolean);
    const allRoutes = [...routes, ...extra];
    const looks = [
      { name: "가장 큰 글씨·가장 작은 화면(360×640)", vp: { width: 360, height: 640 }, s: { font_scale: 2, theme: "light" } },
      { name: "어두운 모드(360×640, 큰 글씨)", vp: { width: 360, height: 640 }, s: { font_scale: 1, theme: "dark" } },
      { name: "고대비 모드(360×640, 가장 큰 글씨)", vp: { width: 360, height: 640 }, s: { font_scale: 2, theme: "contrast" } },
      { name: "넓은 화면 밝은 모드", vp: { width: 1280, height: 800 }, s: { font_scale: 0, theme: "light" } },
    ];
    await api("/api/settings", { tips_seen: [] });
    for (const look of looks) {
      await step(`디자인: ${look.name} — 잘림·겹침·대비`, async () => {
        await api("/api/settings", { ...look.s, reduce_motion: true });
        const p = await browser.newPage({ viewport: look.vp });
        const problems = [];
        for (const r of allRoutes) {
          await p.goto(BASE + r);
          await p.waitForTimeout(700);
          for (const x of await p.evaluate(layoutCheck)) problems.push(`${r} ${x}`);
          for (const x of await p.evaluate(contrastCheck)) problems.push(`${r} 대비 ${x}`);
        }
        await p.close();
        assert(!problems.length, "\n   " + [...new Set(problems)].slice(0, 25).join("\n   "));
      });
    }
    await step("움직임 줄이기: 켜면 애니메이션 시간 0", async () => {
      await api("/api/settings", { reduce_motion: true, font_scale: 1, theme: "light" });
      const p = await browser.newPage();
      await p.goto(BASE + "#/");
      await p.waitForSelector(".tile");
      const d = await p.evaluate(() => [getComputedStyle(document.querySelector(".tile")).transitionDuration, getComputedStyle(document.querySelector("#view")).animationDuration]);
      assert(d.every((x) => x.split(",").every((v) => parseFloat(v) === 0)), JSON.stringify(d));
      await api("/api/settings", { reduce_motion: false });
      await p.reload(); await p.waitForSelector(".tile");
      const d2 = await p.evaluate(() => getComputedStyle(document.querySelector(".tile")).transitionDuration);
      assert(parseFloat(d2) > 0, d2);
      await p.close();
    });
    await step("화면 오류 없음", async () => { assert(!errors.length, errors.join("; ")); });
    if (process.env.UI_SHOTS) {
      for (const [i, look] of looks.entries()) {
        await api("/api/settings", { ...look.s, reduce_motion: true });
        for (const r of ["#/", "#/settings", "#/index"]) {
          const p = await browser.newPage({ viewport: { width: 360, height: 640 }, deviceScaleFactor: 1 });
          await p.goto(BASE + r); await p.waitForTimeout(700);
          await p.screenshot({ path: path.join(process.env.UI_SHOTS, `${r.replace(/[#/]/g, "") || "home"}-${i}.png`), fullPage: true });
          await p.close();
        }
      }
    }
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
  console.log(results.join("\n"));
  console.log(failed ? `\n실패 ${failed}개` : "\n모든 화면 테스트 통과");
  process.exit(failed ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
