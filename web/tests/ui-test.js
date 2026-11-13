/* 보기 화면 자동 테스트(Playwright).
 * 실행: node web/tests/ui-test.js   (엔진을 임시 폴더로 직접 띄움)
 * 1) 흐름: 폴더 선택 → 색인 → 이름 검색 → 내용 검색 → 음성 검색 → 날짜별 보기 → 중복 찾기(휴지통 확인 창까지)
 * 2) 디자인: 360×640·가장 큰 글씨·어두운·고대비 모드에서 잘림·겹침 없음, 글자 대비(WCAG AA), 움직임 줄이기
 */
const { chromium } = require("playwright");
const { spawn, spawnSync } = require("child_process");
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
  catch (e) {
    failed++;
    let extra = "";
    if (global.__page && process.env.UI_DEBUG) {
      try {
        await global.__page.screenshot({ path: path.join(process.env.UI_DEBUG, `fail-${failed}.png`) });
        extra = " | 화면: " + (await global.__page.evaluate(() => location.hash + " :: status=" + JSON.stringify(App.status && App.status.index) + " hidden=" + document.hidden + " :: " + document.body.innerText.slice(0, 300).replace(/\n/g, " / ")));
      } catch (x) { extra = " | 디버그 실패: " + x.message.slice(0, 200); }
    }
    results.push(`✖ ${name}: ${e.message}${extra}`);
  }
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
      // 시험용 마이크 장치
      if (navigator.mediaDevices) navigator.mediaDevices.enumerateDevices = async () => [{ kind: "audioinput", deviceId: "fake", label: "" }];
    });
    const page = await ctx.newPage();
    global.__page = page;
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
    await step("스크롤 유지: 목록을 내려 보는 중 자료가 갱신돼도 위로 튀지 않음 + '새로 보기'", async () => {
      const big = path.join(HOME, "큰폴더");
      const py = `from PIL import Image\nimport os,sys\nd=sys.argv[1]\nos.makedirs(d,exist_ok=True)\nfor i in range(420):\n e=Image.Exif(); e[306]='2001:01:%02d 10:00:00'%(i%28+1)\n Image.new('RGB',(64,48),(i%255,90,160)).save(os.path.join(d,'p%04d.jpg'%i),exif=e.tobytes())`;
      const g = spawnSync(PY, ["-c", py, big]);
      assert.strictEqual(g.status, 0, String(g.stderr));
      await api("/api/roots", { path: big });
      await api("/api/index/start", {});
      for (let i = 0; i < 200; i++) { const st = await api("/api/index/status"); if (!st.running && st.state.phase === "done") break; await new Promise((r) => setTimeout(r, 300)); }
      await page.goto(BASE + "#/photos?year=2001&month=1");
      await page.waitForSelector(".thumb-card");
      await page.evaluate(() => window.scrollTo(0, 900));
      await page.waitForTimeout(300);
      const y0 = await page.evaluate(() => window.scrollY);
      assert(y0 > 500, "스크롤이 안 됨 " + y0);
      // 자료 갱신(새 파일 생김) → 색인 → 상태 확인이 돌아도 위치 그대로
      spawnSync(PY, ["-c", "from PIL import Image\nimport sys\nImage.new('RGB',(20,20)).save(sys.argv[1])", path.join(big, "new1.jpg")]);
      await api("/api/index/start", {});
      await page.waitForSelector("#newdata", { timeout: 20000 });
      assert.strictEqual(await page.evaluate(() => window.scrollY), y0);
      await page.click("#newdata button:has-text('새로 보기')");
      await page.waitForTimeout(800);
      assert(Math.abs((await page.evaluate(() => window.scrollY)) - y0) < 5, "새로 보기 후 위치가 바뀜");
    });
    await step("스크롤 유지: 파일을 열었다가 '뒤로' 오면 보던 위치", async () => {
      const y0 = await page.evaluate(() => window.scrollY);
      const card = page.locator(".thumb-card").nth(30);
      await card.click();
      await page.waitForSelector(".viewer");
      await page.goBack();
      await page.waitForSelector(".thumb-card");
      await page.waitForTimeout(600);
      assert(Math.abs((await page.evaluate(() => window.scrollY)) - y0) < 30, "뒤로 왔는데 위치가 바뀜");
    });
    await step("실패 → 다시 시도(화면): 오류 상자에서 다시 시도하면 정상, 화면 오류 없음", async () => {
      let n = 0;
      await page.route("**/api/timeline/years*", (r) => (n++ === 0 ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "시험용 실패", stage: "색인 저장" }) }) : r.continue()));
      await page.goto(BASE + "#/photos");
      await page.waitForSelector("[role=alert] >> text=시험용 실패");
      assert(await page.locator("[role=alert] a:has-text('문제 신고')").count() >= 1, "오류 상자에 문제 신고 없음");
      await page.click("[role=alert] button:has-text('다시 시도')");
      await page.waitForSelector("a.tile:has-text('2001년')"); // 실제 폴더를 추가해서 체험용 예제(2005년)는 자동으로 숨겨짐
      await page.unroute("**/api/timeline/years*");
    });
    await step("실패 → 다시 시도(대화상자): 실패 창을 닫고 다시 해도 오류 없음", async () => {
      let n = 0;
      await page.route("**/api/persons/merge", (r) => (n++ === 0 ? r.fulfill({ status: 500, contentType: "application/json", body: JSON.stringify({ error: "시험용 합치기 실패" }) }) : r.continue()));
      const before = (await api("/api/persons")).length;
      for (let t = 0; t < 2; t++) {
        await page.goto(BASE + "#/people");
        await page.click("button:has-text('두 사람 합치기')");
        await page.click(".modal .actions button:has-text('합치기')");
        if (t === 0) {
          await page.waitForSelector(".toast:has-text('시험용 합치기 실패') >> a:has-text('문제 신고')");
          await page.evaluate(() => document.querySelectorAll(".toast").forEach((x) => x.remove()));
        } else await page.waitForSelector(".toast:has-text('합쳤어요')");
      }
      assert.strictEqual((await api("/api/persons")).length, before - 1);
      await page.unroute("**/api/persons/merge");
    });
    await step("상태 표시: 홈·설정에 4가지 따로, 저장하면 바로 바뀜", async () => {
      await page.goto(BASE + "#/");
      for (const t of ["색인", "얼굴 인식", "구글", "PC 엔진"]) await page.waitForSelector(`.status-chips >> text=${t}`);
      await page.goto(BASE + "#/settings");
      await page.waitForSelector(".status-chips >> text=구글 연결 안 함");
      await page.evaluate(() => App.saveSettings({ google_client_id: "x.apps.googleusercontent.com" }));
      await page.waitForSelector(".status-chips >> text=구글 연결 필요", { timeout: 5000 });
      await api("/api/settings", { google_client_id: "" });
    });
    await step("앱 꾸미기: 표시 이름이 창 제목에 바로 반영", async () => {
      await page.goto(BASE + "#/settings");
      await page.fill("input[aria-label='표시 이름']", "우리집 자료");
      await page.click("button:has-text('이름 저장')");
      await page.waitForFunction(() => document.title.includes("우리집 자료"));
      await page.goto(BASE + "#/");
      await page.waitForSelector("#page-title:has-text('우리집 자료')");
      await api("/api/settings", { app_name: "" });
    });
    await step("화면 재설계: 가장 먼저 눈에 띄는 것이 가장 중요한 것인가(홈)", async () => {
      for (const vp of [{ width: 1280, height: 860 }, { width: 390, height: 844 }]) {
        const p = await browser.newPage({ viewport: vp });
        await p.goto(BASE + "#/");
        await p.waitForSelector(".ktiles");
        const r = await p.evaluate(() => {
          const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top + scrollY, h: b.height, w: b.width, area: b.width * b.height }; };
          const hero = box(".hero-search"), input = box(".hero-search input"), card = box(".memory") || box(".today"), tiles = [...document.querySelectorAll(".ktile")].map((t) => t.getBoundingClientRect());
          const strip = box(".ixstrip"), main = box("main .page");
          const tops = {}; tiles.forEach((t) => { const k = Math.round(t.top); tops[k] = (tops[k] || 0) + 1; });
          return { hero, input, card, strip, main, maxPerRow: Math.max(...Object.values(tops)), tileArea: Math.max(...tiles.map((t) => t.width * t.height)), tileH: Math.min(...tiles.map((t) => t.height)), tileTop: Math.min(...tiles.map((t) => t.top + scrollY)) };
        });
        assert(r.input.h >= 64, "검색창 높이 " + r.input.h);
        assert(r.hero.w >= r.main.w * 0.95, "검색창이 화면 폭 전체가 아님");
        assert(r.hero.top < r.card.top && r.card.top < r.tileTop && r.tileTop < r.strip.top, "순서: 검색창 > 오늘 카드 > 타일 > 진행 띠");
        assert(r.card.area > r.tileArea, "오늘 카드가 타일보다 작음");
        assert(r.strip.h < r.tileH * 1.2 || vp.width < 500, "진행 띠가 너무 큼");
        assert(r.maxPerRow <= 2, "같은 크기 타일이 한 줄에 " + r.maxPerRow + "개");
        await p.close();
      }
    });
    await step("가상 스크롤: 420장 달도 화면에 보이는 것만 그림", async () => {
      await page.goto(BASE + "#/photos?year=2001&month=1");
      await page.waitForSelector(".vlist .thumb-card img");
      const n = await page.locator(".thumb-card").count();
      assert(n < 200, "그린 칸 " + n);
      await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
      await page.waitForTimeout(800);
      assert(await page.locator(".thumb-card img").count() > 0, "끝까지 내려도 사진이 그려짐");
    });
    await step("설정: 그룹별 카드, 업데이트·문제 신고는 맨 위, 위험 동작은 맨 아래 빨강", async () => {
      await page.goto(BASE + "#/settings");
      await page.waitForSelector("#g-danger");
      const ids = await page.evaluate(() => [...document.querySelectorAll("main .page > section")].map((s) => s.id));
      assert.strictEqual(ids[0], "update-card");
      for (const g of ["g-folders", "g-schedule", "g-faces", "g-google", "g-view", "g-data"]) assert(ids.includes(g), g + " 없음");
      assert.strictEqual(ids[ids.length - 1], "g-danger");
      assert(await page.locator("main .page > .row a:has-text('문제 신고')").count() === 1);
    });
    // ---- 업데이트 카드: 안드로이드는 '백업 → 받기 → 옛 앱 지우기 → 설치 → 다시 연결' ----
    const ANDROID_UA = "Mozilla/5.0 (Linux; Android 14; SM-S911N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Mobile Safari/537.36";
    const mockUpdate = (resp) => async (route) => route.fulfill({ contentType: "application/json", body: JSON.stringify({ notes: "- 바뀐 점", page: "https://example.invalid/rel", engine_busy: false, can_auto_install: false,
      assets: { android: { name: "HDBiseo-x-android.apk", url: "https://example.invalid/a.apk" }, windows: { name: "HDBiseo-Setup-x.exe", url: "https://example.invalid/s.exe" }, mac: { name: "x.dmg", url: "https://example.invalid/m.dmg" } }, ...resp }) });
    const engineVer = (await api("/api/health")).version;
    await step("업데이트(안드로이드 앱이 옛 버전): 백업 먼저, 옛 앱 지우고 설치, 덮어쓰기 약속 없음", async () => {
      const c = await browser.newContext({ userAgent: ANDROID_UA, viewport: { width: 360, height: 640 } });
      await c.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; localStorage.setItem("hd_base", location.origin); });
      const p = await c.newPage();
      p.on("pageerror", (e) => errors.push(e.message));
      // PC 엔진은 최신인데 휴대폰 앱만 옛 버전인 경우(1.1.0에서는 '최신 버전이에요'로 잘못 나왔음)
      await p.route("**/api/update/check", mockUpdate({ current: engineVer, latest: engineVer, newer: false }));
      await p.goto(BASE + "#/settings");
      await p.waitForSelector("#g-danger");
      await p.evaluate(() => { App.version = "1.0.0"; App.render(); });
      await p.waitForSelector("#g-danger");
      await p.click("#update-card button:has-text('업데이트 확인')");
      await p.waitForSelector("#android-steps");
      const card = await p.locator("#update-card").innerText();
      assert(!card.includes("최신 버전이에요"), "옛 앱인데 최신이라고 함");
      assert(!/덮어|설치 화면이 열려요/.test(card), "덮어쓰기 약속: " + card);
      const steps = await p.$$eval("#android-steps li", (ls) => ls.map((l) => l.textContent));
      assert(steps.length === 5, "순서 " + steps.length + "개");
      assert(/백업/.test(steps[0]) && /지워요/.test(steps[2]) && /설치/.test(steps[3]) && /연결 번호/.test(steps[4]), JSON.stringify(steps));
      assert.strictEqual(await p.getAttribute("#apk-link", "href"), "https://example.invalid/a.apk");
      const lay = await p.evaluate(layoutCheck);
      assert(!lay.length, lay.join("; "));
      // 백업하지 않고 받으려 하면 먼저 백업하라고 묻는다 → 백업은 PC에 저장
      const before = (await api("/api/backups")).length;
      await p.click("#apk-link");
      await p.waitForSelector(".modal >> text=아직 백업하지 않았어요");
      await p.click(".modal button:has-text('백업하기')");
      await p.waitForSelector("#android-steps .badge.st-ok:not([hidden])");
      assert.strictEqual((await api("/api/backups")).length, before + 1, "백업 파일이 PC에 생기지 않음");
      await c.close();
    });
    await step("업데이트(윈도우 PC): '지금 설치'는 그대로, 안드로이드 순서 없음 / 둘 다 최신이면 '최신'", async () => {
      const p = await browser.newPage();
      await p.route("**/api/update/check", mockUpdate({ current: engineVer, latest: "9.9.9", newer: true, can_auto_install: true }));
      await p.goto(BASE + "#/settings");
      await p.waitForSelector("#g-danger");
      await p.click("#update-card button:has-text('업데이트 확인')");
      await p.waitForSelector("#update-card button:has-text('지금 설치')");
      assert.strictEqual(await p.locator("#android-steps").count(), 0);
      await p.unroute("**/api/update/check");
      await p.route("**/api/update/check", mockUpdate({ current: engineVer, latest: engineVer, newer: false }));
      await p.click("#update-card button:has-text('업데이트 확인')");
      await p.waitForSelector("#update-card >> text=최신 버전이에요");
      await p.close();
    });

    // ---- 안드로이드 포장 앱 흐름: 다른 출처(http://localhost) + 다른 기기 주소로 PC 엔진에 접속 ----
    await step("안드로이드 앱 흐름: 연결 번호 → 사진 → 백업 → 앱 지우고 새로 설치 → 다시 연결 → 복원", async () => {
      const ip = Object.values(os.networkInterfaces()).flat().find((a) => a && a.family === "IPv4" && !a.internal);
      assert(ip, "시험할 네트워크 주소가 없음");
      const PORT2 = PORT + 1000, PORT3 = PORT + 1500;
      const HOME2 = fs.mkdtempSync(path.join(os.tmpdir(), "hdui-lan-"));
      const env2 = { ...env, HDBISEO_HOME: HOME2, HDBISEO_PORT: String(PORT2) };
      spawnSync(PY, ["-c", "from hdbiseo import settings as st; st.save_app_config({'lan_enabled': True, 'pair_code': '123456'})"], { cwd: path.join(ROOT, "engine"), env: env2 });
      const eng2 = spawn(PY, ["-m", "hdbiseo", "--no-browser"], { cwd: path.join(ROOT, "engine"), env: env2, stdio: "ignore" });
      const stat = spawn(PY, ["-m", "http.server", String(PORT3), "--bind", "127.0.0.1", "--directory", path.join(ROOT, "web")], { stdio: "ignore" });
      const LOCAL2 = `http://127.0.0.1:${PORT2}`, PC = `http://${ip.address}:${PORT2}`, APP = `http://localhost:${PORT3}/`;
      const post2 = async (p2, b) => (await fetch(LOCAL2 + p2, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b || {}) })).json();
      const c = await browser.newContext({ userAgent: ANDROID_UA, viewport: { width: 360, height: 740 } });
      try {
        for (let i = 0; i < 100; i++) { try { if ((await fetch(LOCAL2 + "/api/health")).ok) break; } catch (e) { /* 기다림 */ } await new Promise((r) => setTimeout(r, 200)); }
        for (let i = 0; i < 50; i++) { try { if ((await fetch(APP)).ok) break; } catch (e) { /* 기다림 */ } await new Promise((r) => setTimeout(r, 200)); }
        const sm = await post2("/api/samples"); await post2("/api/roots", { path: sm.path, label: "체험용 예제" }); await post2("/api/index/start");
        for (let i = 0; i < 240; i++) { const s = await (await fetch(LOCAL2 + "/api/index/status")).json(); if (!s.running && s.state.phase === "done") break; await new Promise((r) => setTimeout(r, 500)); }
        await c.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
        const p = await c.newPage();
        p.on("pageerror", (e) => errors.push(e.message));
        const pair = async () => {
          await p.waitForSelector(".modal >> text=연결 번호 입력", { timeout: 15000 });
          assert.strictEqual(await p.locator(".offline").count(), 0, "연결 번호 창이 'PC를 찾을 수 없어요'에 가려짐");
          await p.fill(".modal input", "123456");
          const reloaded = p.waitForEvent("load"); // 연결되면 앱이 처음부터 다시 켜진다
          await p.click(".modal button:has-text('확인')");
          await reloaded;
          assert(await p.evaluate(() => !!localStorage.getItem("hd_token")), "연결 표가 저장되지 않음");
          await p.waitForSelector("#view .page");
        };
        const photosDrawn = async () => {
          await p.evaluate(() => { location.hash = "#/photos"; });
          await p.waitForSelector("a.tile", { timeout: 15000 });
          for (let i = 0; i < 3 && !(await p.locator(".thumb-card img").count()); i++) { await p.locator("a.tile").first().click(); await p.waitForTimeout(1200); }
          await p.waitForFunction(() => [...document.querySelectorAll(".thumb-card img")].some((im) => im.complete && im.naturalWidth > 0), null, { timeout: 15000 });
        };
        // 1) 처음 설치: PC 주소를 찾은 뒤 연결 번호 입력 → 사진(썸네일은 연결 표가 붙은 주소로 그려짐)
        await p.goto(APP);
        await p.waitForSelector(".offline >> text=PC 엔진을 찾을 수 없어요");
        await p.evaluate((pc) => localStorage.setItem("hd_base", pc), PC);
        await p.reload();
        await pair();
        await photosDrawn();
        // 2) 업데이트 전 백업(PC에 저장)
        const bk = await p.evaluate(async () => (await App.api("/api/backup", { body: {} })).file);
        assert(fs.readdirSync(HOME2, { recursive: true }).some((f) => String(f).endsWith(bk)), "백업 파일이 PC에 없음");
        // 3) 앱 삭제 + 새로 설치 = 휴대폰에 있던 PC 주소·연결 표가 모두 사라짐
        await p.evaluate(() => localStorage.clear());
        await c.clearCookies();
        await p.goto(APP);
        await p.waitForSelector(".offline >> text=PC 엔진을 찾을 수 없어요");
        await p.click(".offline button:has-text('PC 주소 직접 입력')");
        await p.fill(".modal input", PC.replace("http://", ""));
        const typed = p.waitForEvent("load");
        await p.click(".modal button:has-text('확인')");
        await typed;
        // 4) 연결 번호를 다시 넣으면 PC의 자료가 그대로 보인다
        await pair();
        await photosDrawn();
        // 5) 설정 > 자료 관리 > 백업·복원에서 방금 백업으로 복원
        await p.evaluate(() => { location.hash = "#/settings"; });
        await p.waitForSelector("#g-data select");
        await p.selectOption("#g-data select", bk);
        await p.click("#g-data button:has-text('이 백업으로 복원')");
        await p.click(".modal button:has-text('복원하기')");
        await p.waitForSelector("text=백업에서 되살렸어요");
      } finally { await c.close(); eng2.kill(); stat.kill(); }
    });
    await step("마이크 장치가 없는 기기: 음성 인식이 있어도 글자 입력칸만", async () => {
      const p3 = await browser.newPage();
      await p3.addInitScript(() => { window.webkitSpeechRecognition = function () {}; if (navigator.mediaDevices) navigator.mediaDevices.enumerateDevices = async () => []; });
      await p3.goto(BASE + "#/search");
      await p3.waitForSelector("input[type=search]");
      assert.strictEqual(await p3.locator("button.mic").count(), 0);
      await p3.close();
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
      await p.waitForSelector(".ktile");
      const d = await p.evaluate(() => [getComputedStyle(document.querySelector(".ktile")).transitionDuration, getComputedStyle(document.querySelector("#view .page")).animationDuration]);
      assert(d.every((x) => x.split(",").every((v) => parseFloat(v) === 0)), JSON.stringify(d));
      await api("/api/settings", { reduce_motion: false });
      await p.reload(); await p.waitForSelector(".ktile");
      const d2 = await p.evaluate(() => getComputedStyle(document.querySelector(".ktile")).transitionDuration);
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
