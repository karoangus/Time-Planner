const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const html = fs.readFileSync('index.html', 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];

function app(initial = []) {
  let stored = JSON.stringify(initial);
  const elements = new Map();
  const reports = [];
  let savedPdf = false;
  function element() {
    return {
      value: '', textContent: '', innerHTML: '', style: {}, children: [],
      classList: { add() {}, remove() {} },
      addEventListener(name, cb) { this[name] = cb; },
      appendChild(child) { this.children.push(child); },
      removeChild() {}, remove() {}
    };
  }
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element,
    body: { appendChild(child) { reports.push(child); }, removeChild() {} },
    head: element()
  };
  class PDF {
    constructor() { this.internal = { pageSize: { getWidth: () => 210, getHeight: () => 297 } }; }
    addImage() {} addPage() {} save() { savedPdf = true; }
  }
  const html2canvas = () => Promise.resolve({ width: 800, height: 600, toDataURL: () => 'data:image/jpeg;base64,' });
  const context = vm.createContext({ document, window: { jspdf: { jsPDF: PDF }, html2canvas }, html2canvas,
    localStorage: { getItem: () => stored, setItem: (_, value) => { stored = value; } },
    setTimeout() {}, console, Intl, Date });
  vm.runInContext(script, context);
  return { context, elements, reports, stored: () => JSON.parse(stored), savedPdf: () => savedPdf,
    run: code => vm.runInContext(code, context) };
}

test('quarter-hour controls increment, decrement and keep study and test selections separate', () => {
  const a = app([{ id: '1', name: 'ریاضی', hours: 2, logs: [{ amount: 2 }] }]);
  assert.equal(a.elements.get('stat-total-test-hours').textContent, '۰:۰۰');
  const card = a.elements.get('coursesContainer').children[0].innerHTML;
  assert.doesNotMatch(card, /تعداد ثبت|ثبت مطالعه ·|ثبت تست<\/p>/);
  assert.doesNotMatch(card, /type="number"/);
  a.run("adjustMinutes('1', 'test', -15)");
  assert.equal(a.elements.get('duration-test-1').textContent, '۰:۰۰');
  assert.equal(a.elements.get('minus-test-1').disabled, true);
  for (let i = 0; i < 10; i++) a.run("adjustMinutes('1', 'test', 15)");
  assert.equal(a.elements.get('duration-test-1').textContent, '۲:۳۰');
  a.run("adjustMinutes('1', 'test', -15)");
  assert.equal(a.elements.get('duration-test-1').textContent, '۲:۱۵');
  a.run("adjustMinutes('1', 'study', 15)");
  a.run("addHours('1', 'test')");
  assert.equal(a.stored()[0].hours, 2);
  assert.equal(a.stored()[0].testHours, 2.25);
  assert.equal(a.stored()[0].testLogs.length, 1);
  assert.equal(a.elements.get('stat-total-test-hours').textContent, '۲:۱۵');
  a.run("addHours('1', 'study')");
  assert.equal(a.stored()[0].hours, 2.25);
  assert.equal(a.stored()[0].testHours, 2.25);
  const reloaded = app(a.stored());
  assert.equal(reloaded.elements.get('stat-total-test-hours').textContent, '۲:۱۵');
});

test('zero or non-quarter-hour selection cannot be registered, week reset keeps courses', () => {
  const a = app([{ id: '1', name: 'ریاضی', hours: 2, logs: [{}], testHours: 1, testLogs: [{}] }]);
  a.run("addHours('1', 'test')");
  a.run("adjustMinutes('1', 'test', 5)");
  a.run("addHours('1', 'test')");
  assert.equal(a.stored()[0].testHours, 1);
  a.run("adjustMinutes('1', 'test', 15)");
  a.run('endWeek()');
  assert.match(a.elements.get('confirmMsg').textContent, /مطالعه و تست/);
  a.elements.get('confirmOk').click();
  assert.deepEqual(a.stored(), [{ id: '1', name: 'ریاضی', hours: 0, logs: [], testHours: 0, testLogs: [] }]);
  a.run("addHours('1', 'test')");
  assert.equal(a.stored()[0].testHours, 0);
});

test('new courses start at zero; selections roll over and totals add across courses', () => {
  const a = app([{ id: '1', name: 'ریاضی', hours: 0.75, logs: [], testHours: 0.25, testLogs: [] }]);
  a.elements.get('courseNameInput').value = 'فیزیک';
  a.run('addCourse()');
  const id = a.stored()[1].id;
  for (let i = 0; i < 9; i++) a.run(`adjustMinutes('${id}', 'study', 15)`);
  assert.equal(a.elements.get(`duration-study-${id}`).textContent, '۲:۱۵');
  a.run(`addHours('${id}', 'study')`);
  assert.equal(a.stored()[1].hours, 2.25);
  assert.equal(a.elements.get('stat-total-hours').textContent, '۳:۰۰');
  assert.equal(a.elements.get('stat-total-test-hours').textContent, '۰:۱۵');
});

test('legacy decimal data remains intact and displays in hours and minutes', () => {
  const a = app([{ id: '1', name: 'ریاضی', hours: 1.08, logs: [{}], testHours: 2.75, testLogs: [{}] }]);
  assert.equal(a.elements.get('stat-total-hours').textContent, '۱:۰۵');
  assert.equal(a.elements.get('stat-total-test-hours').textContent, '۲:۴۵');
  a.run("adjustMinutes('1', 'study', 15)");
  a.run("addHours('1', 'study')");
  assert.equal(a.stored()[0].hours, 1.33);
  assert.equal(a.elements.get('stat-total-hours').textContent, '۱:۲۰');
});

test('PDF uses hour:minute format for totals and courses without registration counts', async () => {
  const a = app([{ id: '1', name: 'ریاضی', hours: 2.25, logs: [{}], testHours: 1.5, testLogs: [{}] }]);
  a.run('exportPDF()');
  const report = a.reports[0].innerHTML;
  assert.match(report, /کل ساعات تست/);
  assert.match(report, /۲:۱۵/);
  assert.match(report, /۱:۳۰/);
  assert.doesNotMatch(report, /ثبت مطالعه|ثبت تست|تعداد ثبت/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(a.savedPdf(), true);
});
