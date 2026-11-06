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

test('old courses are retained; study and test hours are independently persisted and displayed', () => {
  const a = app([{ id: '1', name: 'ریاضی', hours: 2, logs: [{ amount: 2 }] }]);
  assert.equal(a.elements.get('stat-total-test-hours').textContent, '۰');
  a.elements.set('test-hrs-1', { value: '1.5' });
  a.run("addHours('1', 'test')");
  assert.equal(a.stored()[0].hours, 2);
  assert.equal(a.stored()[0].testHours, 1.5);
  assert.equal(a.stored()[0].testLogs.length, 1);
  assert.equal(a.elements.get('stat-total-test-hours').textContent, '۱.۵');
  a.elements.set('hrs-1', { value: '0.25' });
  a.run("addHours('1')");
  assert.equal(a.stored()[0].hours, 2.25);
  assert.equal(a.stored()[0].testHours, 1.5);
  const reloaded = app(a.stored());
  assert.equal(reloaded.elements.get('stat-total-test-hours').textContent, '۱.۵');
});

test('invalid test hours are rejected and ending the week resets both types but keeps courses', () => {
  const a = app([{ id: '1', name: 'ریاضی', hours: 2, logs: [{}], testHours: 1, testLogs: [{}] }]);
  for (const value of ['', '-1', '0', '1.234', 'Infinity']) {
    a.elements.set('test-hrs-1', { value });
    a.run("addHours('1', 'test')");
    assert.equal(a.stored()[0].testHours, 1);
  }
  a.run('endWeek()');
  assert.match(a.elements.get('confirmMsg').textContent, /مطالعه و تست/);
  a.elements.get('confirmOk').click();
  assert.deepEqual(a.stored(), [{ id: '1', name: 'ریاضی', hours: 0, logs: [], testHours: 0, testLogs: [] }]);
});

test('PDF report includes test hours and can be saved', async () => {
  const a = app([{ id: '1', name: 'ریاضی', hours: 2, logs: [{}], testHours: 1.5, testLogs: [{}] }]);
  a.run('exportPDF()');
  assert.match(a.reports[0].innerHTML, /کل ساعات تست/);
  assert.match(a.reports[0].innerHTML, /ثبت تست/);
  assert.match(a.reports[0].innerHTML, /۱\.۵ ساعت/);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(a.savedPdf(), true);
});
