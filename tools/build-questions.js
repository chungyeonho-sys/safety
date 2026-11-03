// questions.json을 검증하고 questions.js(window.QUESTIONS)를 생성합니다.
// 사용법: node tools/build-questions.js
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const questions = JSON.parse(fs.readFileSync(path.join(root, 'questions.json'), 'utf8'));

const CATEGORIES = ['안전', '보건', '환경', '소방', '위험물', '시험실화학물질'];
const errors = [];
const ids = new Set();

questions.forEach((q, i) => {
  const where = q.id || `#${i}`;
  if (!q.id || ids.has(q.id)) errors.push(`${where}: id 누락 또는 중복`);
  ids.add(q.id);
  if (!CATEGORIES.includes(q.category)) errors.push(`${where}: 알 수 없는 카테고리 "${q.category}"`);
  if (!q.question) errors.push(`${where}: question 누락`);
  if (!Array.isArray(q.options) || q.options.length !== 5) errors.push(`${where}: options는 5개여야 함`);
  else if (new Set(q.options).size !== 5) errors.push(`${where}: options에 중복 보기`);
  if (!Number.isInteger(q.answer) || q.answer < 0 || q.answer > 4) errors.push(`${where}: answer는 0~4`);
  if (!q.explanation) errors.push(`${where}: explanation 누락`);
});

const report = CATEGORIES.map((cat) => {
  const list = questions.filter((q) => q.category === cat);
  if (list.length !== 10) errors.push(`${cat}: 문제 수 ${list.length}개 (10개여야 함)`);
  const dist = [0, 0, 0, 0, 0];
  list.forEach((q) => dist[q.answer]++);
  return { 카테고리: cat, 문제수: list.length, '①': dist[0], '②': dist[1], '③': dist[2], '④': dist[3], '⑤': dist[4] };
});

console.table(report);
console.log(`총 ${questions.length}문제`);

if (errors.length) {
  console.error('검증 실패:\n' + errors.join('\n'));
  process.exit(1);
}

const out =
  '// 자동 생성 파일입니다. 직접 수정하지 말고 questions.json 수정 후\n' +
  '// node tools/build-questions.js 를 실행하세요.\n' +
  'window.QUESTIONS = ' + JSON.stringify(questions, null, 2) + ';\n';
fs.writeFileSync(path.join(root, 'questions.js'), out, 'utf8');
console.log('questions.js 생성 완료');
