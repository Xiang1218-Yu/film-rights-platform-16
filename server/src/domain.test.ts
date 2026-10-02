import test from 'node:test'; import assert from 'node:assert/strict'; import { approve, assessContract, assessMilestone, paymentRisks, projectSummary, rightsConflicts } from './domain.js';
test('budget summary exposes forecast variance and high risk lines', () => { const summary = projectSummary('PRJ-001'); assert.equal(summary.lines.length, 4); assert.ok(summary.forecast > summary.planned); assert.equal(summary.highRiskLines.length, 1); });
test('rights conflict engine detects overlapping licensed assets', () => { const conflicts = rightsConflicts('PRJ-001'); assert.ok(conflicts.length >= 1); assert.ok(conflicts.some(item => item.reason.includes('音乐-同步许可'))); });
test('approval changes are auditable and stateful', () => { const result = approve('APR-01', 'approved', '预算已复核'); assert.equal(result?.status, 'approved'); assert.equal(result?.comment, '预算已复核'); });

const TODAY = '2026-10-01';
test('milestone states classify paid, overdue, approaching, invoiced and upcoming', () => {
  assert.equal(assessMilestone({ name: 'A', due: '2026-09-01', amount: 1, status: 'paid' }, '2026-12-01', TODAY).state, 'paid');
  assert.equal(assessMilestone({ name: 'B', due: '2026-09-30', amount: 1, status: 'open' }, '2026-12-01', TODAY).state, 'overdue');
  assert.equal(assessMilestone({ name: 'C', due: '2026-09-30', amount: 1, status: 'invoiced' }, '2026-12-01', TODAY).state, 'overdue');
  assert.equal(assessMilestone({ name: 'D', due: '2026-10-10', amount: 1, status: 'open' }, '2026-12-01', TODAY).state, 'approaching');
  assert.equal(assessMilestone({ name: 'E', due: '2026-12-20', amount: 1, status: 'invoiced' }, '2027-01-01', TODAY).state, 'invoiced');
  assert.equal(assessMilestone({ name: 'F', due: '2026-12-20', amount: 1, status: 'open' }, '2027-01-01', TODAY).state, 'upcoming');
});
test('due date boundary: due today is approaching, not overdue', () => {
  const dueToday = assessMilestone({ name: 'A', due: TODAY, amount: 1, status: 'open' }, '2026-12-01', TODAY);
  assert.equal(dueToday.state, 'approaching'); assert.equal(dueToday.daysToDue, 0); assert.ok(dueToday.flags.includes('今日到期'));
  assert.equal(assessMilestone({ name: 'B', due: '2026-09-30', amount: 1, status: 'open' }, '2026-12-01', TODAY).daysToDue, -1);
});
test('late payment detected only when paidAt is after due', () => {
  const late = assessMilestone({ name: 'A', due: '2026-09-01', amount: 1, status: 'paid', paidAt: '2026-09-05' }, '2026-12-01', TODAY);
  assert.equal(late.latePayment, true); assert.equal(late.lateDays, 4);
  assert.equal(assessMilestone({ name: 'B', due: '2026-09-01', amount: 1, status: 'paid', paidAt: '2026-09-01' }, '2026-12-01', TODAY).latePayment, false);
  assert.equal(assessMilestone({ name: 'C', due: '2026-09-01', amount: 1, status: 'paid' }, '2026-12-01', TODAY).latePayment, false);
});
test('delivery date change moves milestones across the after-delivery line', () => {
  const milestone = { name: 'A', due: '2026-11-20', amount: 1, status: 'open' as const };
  assert.equal(assessMilestone(milestone, '2026-12-01', TODAY).afterDelivery, false);
  assert.equal(assessMilestone(milestone, '2026-11-15', TODAY).afterDelivery, true);
});
test('contract without milestones yields empty health without crashing', () => {
  const health = assessContract({ id: 'X', projectId: 'P', vendor: 'V', scope: 'S', ceiling: 100, committed: 100, paid: 0, milestones: [] }, '2026-12-01', TODAY);
  assert.equal(health.milestones.length, 0); assert.equal(health.counts.overdue, 0); assert.equal(health.exposure, 0);
});
test('amount and status inconsistencies are flagged', () => {
  const health = assessContract({ id: 'X', projectId: 'P', vendor: 'V', scope: 'S', ceiling: 1000, committed: 900, paid: 500, milestones: [{ name: 'A', due: '2026-01-01', amount: 100, status: 'paid' }, { name: 'B', due: '2026-02-01', amount: 950, status: 'open' }] }, '2026-12-01', TODAY);
  assert.ok(health.inconsistencies.some(text => text.includes('已支付节点合计')));
  assert.ok(health.inconsistencies.some(text => text.includes('超出合同承诺额')));
  const clean = assessContract({ id: 'Y', projectId: 'P', vendor: 'V', scope: 'S', ceiling: 1000, committed: 900, paid: 100, milestones: [{ name: 'A', due: '2026-01-01', amount: 100, status: 'paid' }] }, '2026-12-01', TODAY);
  assert.equal(clean.inconsistencies.length, 0);
});
test('payment risks aggregate contracts with overdue first and expose seed late payment', () => {
  const risks = paymentRisks('PRJ-001', TODAY);
  const order = ['overdue', 'approaching', 'late-payment', 'after-delivery', 'inconsistency'];
  const ranks = risks.map(risk => order.indexOf(risk.kind));
  assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b));
  assert.ok(risks.some(risk => risk.kind === 'late-payment' && risk.milestone === '签署' && risk.contractId === 'CTR-02'));
  assert.ok(risks.some(risk => risk.kind === 'inconsistency' && risk.contractId === 'CTR-01'));
  assert.ok(risks.every(risk => risk.vendor && risk.detail));
});
test('project summary keeps contract fields and adds health and payment risks', () => {
  const summary = projectSummary('PRJ-001');
  assert.equal(summary.contracts.length, 2);
  assert.ok(summary.contracts.every(contract => contract.vendor && contract.scope && contract.committed > 0));
  assert.equal(summary.contractHealth.length, 2);
  assert.ok(Array.isArray(summary.paymentRisks));
});
