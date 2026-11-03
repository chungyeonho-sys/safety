# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 상태

안전골든벨 퀴즈게임(5지선다, 6개 카테고리 × 10문제)입니다. `prompts.md`의 4단계(뼈대 → 기능 → UI → Playwright 검토)를 모두 마쳤습니다. 검토 결과와 수정 내역은 `review/REVIEW.md`에 있습니다.

- `prd.md` — 요구사항의 기준 문서. 기능 요구사항은 FR-01~FR-06, 문제 데이터 규격은 5장, 비기능 요구사항은 6장에 있습니다. 구현·검토는 항상 이 문서를 기준으로 합니다.
- `prompts.md` — 4단계 개발 프롬프트. 단계별로 범위를 지킵니다(예: UI 단계에서 게임 규칙을 바꾸지 않기).

## 구조

- 빌드 도구·패키지 관리자·서버 없는 정적 웹앱: `index.html`, `style.css`, `app.js`, `questions.json`(+ 자동 생성되는 `questions.js`). 외부 JS 라이브러리는 쓰지 않습니다(폰트는 Google Fonts의 Noto Sans KR 허용).
- `index.html`을 더블클릭으로 열어도(`file://`) 동작해야 합니다. 이때 `fetch('questions.json')`이 막히므로 `app.js`는 `questions.js`가 넣어준 `window.QUESTIONS`를 먼저 씁니다.
- 화면 5개(시작 / 카테고리 / 문제 풀이 / 결과 / 순위)는 `index.html` 안의 section이고, `showScreen()`으로 하나만 보입니다. 게임 진행 상황은 `app.js`의 `state` 객체 하나에 모읍니다.
- 게임 규칙 숫자(문제당 점수 10, 제한시간 20초, 이름 10자, 순위 표시 10명, 보관 100건)는 `app.js` 맨 위 상수에 모여 있습니다. 바꿀 때는 `prd.md`와 함께 고칩니다.
- 문제 형식: `{id, category, question, options[5], answer(0~4 인덱스), explanation}`. id 접두어는 SAFE / HEALTH / ENV / FIRE / HAZ / LAB 입니다.
- 순위는 localStorage의 `goldenbell_rankings` 키에 저장합니다. 정렬은 점수 내림차순 → 소요 시간 오름차순 → 일시 오름차순이고, 카테고리별 상위 100건(`RANKING_KEEP`)만 보관합니다. 읽기·쓰기는 모두 try/catch로 감싸 저장소가 손상되거나 막혀도 게임이 멈추지 않게 합니다. 방금 끝낸 게임 기록(`state.lastRecord`)은 저장 여부와 상관없이 순위에 포함하고, 11위 이하면 구분선 아래에 따로 보여줍니다.
- 디자인: 색은 모두 `style.css`의 `:root` 변수입니다. 카테고리 색은 요소의 `data-category` 속성(`[data-category="소방"]` 등)으로 `--cat` 변수를 바꿔 적용합니다. 기본값이 `:root`에 있으므로 컴포넌트 규칙에서 `--cat`을 다시 정의하면 카테고리 색을 덮어씁니다. 모든 글자는 최소 18px(1rem), 피드백 애니메이션은 0.3초 이내입니다.

## 실행·테스트

- 실행: 브라우저에서 `index.html`을 엽니다. Playwright MCP의 `browser_navigate`는 `file://`을 막으므로 `npx --yes http-server -p 8123 -s -c-1`로 띄워 `http://localhost:8123/index.html`에서 확인합니다(`browser_run_code_unsafe` 안의 `page.goto('file:///...')`는 동작합니다). 끝나면 8123 포트 프로세스를 직접 종료해야 합니다(TaskStop만으로는 node가 남습니다).
- 문제 수정: `questions.json`만 고친 뒤 `node tools/build-questions.js`를 실행합니다. 형식·개수·정답 위치 분포를 검증하고 `questions.js`(직접 수정 금지)를 다시 만듭니다.
- 문제 난이도 필드는 없고, 카테고리마다 1~4번째는 쉬움, 5~8번째는 보통, 9~10번째는 어려움 순서입니다.
- 회귀 테스트: 서버를 띄운 뒤 Playwright MCP `browser_run_code_unsafe`에 `filename: review/review-test.js`(프로젝트 폴더 안 파일만 허용)를 지정합니다. 결과는 항목별 JSON(현재 64개 모두 통과)이고, 스크린샷은 `review/screenshots/`에 저장됩니다. 타이머 검사는 이 파일에 들어 있지 않으므로 타이머를 고쳤다면 아래 요령대로 따로 확인합니다.
- Playwright를 쓰면 프로젝트 안에 `.playwright-mcp/` 로그 폴더가 생깁니다. 작업이 끝나면 지웁니다.
- Playwright 요령:
  - 각 문제의 정답은 화면의 문제 문장으로 `window.QUESTIONS`에서 찾습니다.
  - `confirm` 대화상자는 실제로 띄우면 실행 결과가 사라지므로 `window.confirm = () => true/false`로 바꿔 테스트합니다.
  - 타이머는 `page.clock.install()` 후 `page.clock.runFor()`로 검증합니다. 이때 CSS 애니메이션 때문에 `page.click()`이 "element is not stable"로 멈추므로 `page.evaluate(() => el.click())`로 누르고, `clock.pauseAt()`은 쓰지 마세요(실행이 멈춥니다). 실제 시간도 함께 흐르므로 만료 직전 테스트는 1초 이상 여유를 둡니다.

## 주의할 점

- 문제 정답은 현행 법령·기준에 근거해야 하고 정답이 하나로 명확해야 합니다. 법령은 개정되므로 숫자 기준 문제는 원문을 확인하세요(예: 타워크레인 운전 중지 풍속은 2017년에 20m/s → 15m/s로 바뀜).
- 답 처리는 `submitAnswer()` 하나로 모입니다(클릭·숫자키·시간 초과 모두). `state.locked`로 중복 처리를 막고, `goNext()`도 `locked`일 때만 동작합니다. 타이머는 답 확정·그만두기·다음 문제 전환 때 반드시 `clearTimer()`로 멈춥니다.
- 키보드: 전역 `keydown`에서 숫자 1~5는 답 선택, Enter는 다음 문제입니다. 단, 포커스가 버튼에 있으면 Enter는 브라우저 기본 클릭에 맡깁니다(두 문제가 한꺼번에 넘어가는 것을 막기 위함). 새 문제가 나오면 포커스는 보기 버튼이 아니라 문제 문장(`#quiz-question`, `tabindex="-1"`)으로 갑니다. 보기 버튼으로 옮기면 Enter 연타로 답이 잘못 선택됩니다.
- 사용자와는 한국어로 대화합니다.




[퀴즈문제 교차검증 가이드라인]

1. 정답이 하나뿐인가?
 - 다른 해석 가능시 조건 명시 (에: 면전기준, 연도기준)

2. 최상급 표현에 기중이 있는가?
 - 가장 큰, 최초의 등 표현에 측정 기준 명시

3. 시간과 범위가 명확한가?
 - 변할 수 있는 정보는 시점 명시

4. 교차검증 했는가?
 - 의심스러운 정보가 2개이상 출처확인
 - 논란 있는 내용은 주류 학설 기준



