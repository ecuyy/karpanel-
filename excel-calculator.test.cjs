const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const page = fs.readFileSync(__dirname + '/trendyol-komisyon-hesaplama.html', 'utf8');
const app = fs.readFileSync(__dirname + '/karpanel.html', 'utf8');
function formula(html) {
  return html.match(/function calcKar\(p\)\{[\s\S]*?\n\}/)[0];
}
const reference = vm.runInNewContext('(' + formula(app) + ')');
function setup(search = '') {
  const nodes = {};
  for (const match of page.matchAll(/\bid="([^"]+)"/g)) {
    nodes[match[1]] = { value: '', textContent: '', hidden: false, style: {}, validity: {}, attrs: {}, events: {},
      setAttribute(k, v) { this.attrs[k] = v; }, removeAttribute(k) { delete this.attrs[k]; },
      addEventListener(k, cb) { this.events[k] = cb; }, focus() {} };
  }
  const document = { getElementById: id => { assert(nodes[id], 'Missing node: ' + id); return nodes[id]; }, querySelectorAll: () => [], addEventListener() {} };
  const context = vm.createContext({ document, location: { search, hash: '' }, URLSearchParams, Intl });
  const script = [...page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].at(-1)[1];
  vm.runInContext(script, context);
  function fill(values) {
    for (const [id, value] of Object.entries(values)) nodes[id].value = String(value);
    context.calc();
  }
  return { context, nodes, fill };
}
const money = value => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY' }).format(value);
test('public calculator uses the exact Excel product formula without modifying the app', () => {
  assert.equal(formula(page), formula(app));
  const { context } = setup();
  for (const salePrice of [0.01, 299.9, 1000, 1234.56])
    for (const alis of [1, 150.25, 1500])
      for (const kargo of [0, 60, 99.9])
        for (const commissionRate of [0, 12.75, 20, 100]) {
          const product = { salePrice, alis, kargo, commissionRate };
          assert.deepEqual(JSON.parse(JSON.stringify(context.calcKar(product))), JSON.parse(JSON.stringify(reference(product))));
        }
});
test('known example reconciles every deduction, VAT, margin and return on investment', () => {
  const { nodes, fill, context } = setup();
  fill({ sale: 1000, cost: 500, commission: 20, shipping: 60 });
  assert.equal(nodes.profit.textContent, money(180.67));
  assert.equal(nodes.outCommission.textContent, money(200));
  assert.equal(nodes.outService.textContent, money(13.19));
  assert.equal(nodes.outStopaj.textContent, money(1000 / 1.2 * 0.01));
  assert.equal(nodes.margin.textContent, '%18,07');
  assert.equal(nodes.roi.textContent, '%36,13');
  const r = context.calcKar({ salePrice: 1000, alis: 500, commissionRate: 20, kargo: 60 });
  assert(Math.abs(1000 - 500 - 200 - 60 - r.hizmet - r.stopaj - r.odKdv - r.net) < 1e-10);
  for (const [id, field] of Object.entries({ vatSale: 'kdvS', vatCost: 'kdvA', vatShipping: 'kdvK', vatCommission: 'kdvKom', vatService: 'kdvHiz', vatPayable: 'odKdv' })) assert.equal(nodes[id].textContent, money(r[field]));
});
test('incomplete and invalid inputs clear all stale profits; explicit zero rates and shipping work', () => {
  const { nodes, fill } = setup();
  assert.equal(nodes.profit.textContent, '—');
  fill({ sale: 1000, cost: 500, commission: 0, shipping: 0 });
  assert.equal(nodes.outCommission.textContent, money(0));
  assert.notEqual(nodes.profit.textContent, '—');
  for (const [id, invalid] of [['cost', ''], ['cost', '0'], ['sale', '0'], ['shipping', ''], ['shipping', '-1'], ['commission', ''], ['commission', '101'], ['commission', '-1'], ['sale', 'Infinity']]) {
    fill({ sale: 1000, cost: 500, commission: 20, shipping: 60 });
    fill({ [id]: invalid });
    for (const output of ['profit', 'outCommission', 'margin', 'roi', 'outNet', 'vatPayable']) assert.equal(nodes[output].textContent, '—', id + ': ' + invalid);
    assert.equal(nodes['calculation-error'].hidden, false);
  }
});
test('losses keep their sign and VAT credit is not presented as cash profit', () => {
  const { nodes, fill } = setup();
  fill({ sale: 100, cost: 200, commission: 20, shipping: 60 });
  assert.equal(nodes['profit-label'].textContent, 'Net Zarar');
  assert.equal(nodes.profit.textContent, money(-194.02333333333334));
  assert.equal(nodes.outNet.textContent, nodes.profit.textContent);
  assert.equal(nodes.outVat.textContent, money(0));
});
test('example links, clear button and four visible inputs preserve the complete calculation flow', () => {
  const { nodes } = setup('?ornek=1000&rehber=kupon');
  assert.equal(nodes.profit.textContent, money(180.67));
  nodes['clear-inputs'].events.click();
  assert.equal(nodes.profit.textContent, '—');
  for (const id of ['sale', 'cost', 'commission', 'shipping']) assert.equal(nodes[id].value, '');
  nodes['load-example'].events.click();
  assert.equal(nodes.profit.textContent, money(180.67));
  assert.match(page, /<section[^>]+id="net-kar-detay"/);
  assert.doesNotMatch(page, /<details[^>]+id="net-kar-detay"/);
  assert.doesNotMatch(page, /<input[^>]+id="(?:service|vat)"/);
  assert.equal((page.match(/id="(?:sale|cost|commission|shipping)"/g) || []).length, 4);
});
