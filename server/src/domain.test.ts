import test from 'node:test'; import assert from 'node:assert/strict'; import { approve, classifyMilestone, projectSummary, rightsConflicts, NEAR_DUE_DAYS } from './domain.js';
test('budget summary exposes forecast variance and high risk lines', () => { const summary = projectSummary('PRJ-001'); assert.equal(summary.lines.length, 4); assert.ok(summary.forecast > summary.planned); assert.equal(summary.highRiskLines.length, 1); });
test('rights conflict engine detects overlapping licensed assets', () => { const conflicts = rightsConflicts('PRJ-001'); assert.ok(conflicts.length >= 1); assert.ok(conflicts.some(item => item.reason.includes('音乐-同步许可'))); });
test('approval changes are auditable and stateful', () => { const result = approve('APR-01', 'approved', '预算已复核'); assert.equal(result?.status, 'approved'); assert.equal(result?.comment, '预算已复核'); });

test('milestone due boundary: due day is not overdue, next day is', () => {
  const delivery = '2026-12-31';
  const onDay = classifyMilestone({ name: 'today', due: '2026-10-01', amount: 100, status: 'open' }, delivery, '2026-10-01');
  const dayBefore = classifyMilestone({ name: 'yesterday', due: '2026-09-30', amount: 100, status: 'open' }, delivery, '2026-10-01');
  const invoiced = classifyMilestone({ name: 'due-soon', due: '2026-10-01', amount: 100, status: 'invoiced' }, delivery, '2026-10-01');
  assert.equal(onDay.daysToDue, 0);
  assert.equal(onDay.derivedStatus, 'near');
  assert.equal(dayBefore.daysToDue, -1);
  assert.equal(dayBefore.derivedStatus, 'overdue');
  assert.equal(invoiced.derivedStatus, 'invoicedPending');
  assert.equal(invoiced.nearDue, true);
});

test('late paid milestones are flagged by actual paid date', () => {
  const m = classifyMilestone({ name: '启动款', due: '2026-09-01', amount: 100, status: 'paid', paidAt: '2026-09-08' }, '2026-12-31', '2026-10-01');
  assert.equal(m.derivedStatus, 'paid');
  assert.equal(m.lateDays, 7);
  assert.ok(m.issues.some(i => i.includes('晚付 7 天')));
});

test('summary derives milestone states and fulfillment risks for PRJ-001', () => {
  const ctr01 = projectSummary('PRJ-001').contracts.find(c => c.id === 'CTR-01')!;
  const byName = (name: string) => ctr01.milestones.find(m => m.name === name)!;
  assert.equal(byName('启动款').derivedStatus, 'paid');
  assert.ok((byName('启动款').lateDays ?? 0) > 0);
  assert.equal(byName('锁剪交付').derivedStatus, 'invoicedPending');
  assert.equal(byName('锁剪交付').nearDue, true);
  assert.equal(byName('母版验收').afterDelivery, true);
  assert.ok(ctr01.budgetLine?.id === 'BL-103');

  const summary = projectSummary('PRJ-001');
  assert.ok(summary.fulfillmentRisks.some(r => r.contractId === 'CTR-01' && r.milestone === '锁剪交付' && r.severity === 'warning'));
  assert.ok(summary.fulfillmentRisks.every(r => !(r.contractId === 'CTR-01' && r.kind === 'contract')));
  const radar = summary.fulfillmentRisks.find(r => r.milestone === '母版验收');
  assert.ok(radar); assert.equal(radar?.budgetLineId, 'BL-103');
  assert.equal(radar?.budgetOverrun, true, '后期科目预测已超预算，headroom 应为负');
});

test('overdue open milestone on PRJ-002 is critical and shows budget impact', () => {
  const summary = projectSummary('PRJ-002');
  const risk = summary.fulfillmentRisks.find(r => r.contractId === 'CTR-03' && r.milestone === '素材包一');
  assert.equal(risk?.severity, 'critical');
  assert.equal(risk?.derivedStatus, 'overdue');
  assert.equal(risk?.budgetLineId, 'BL-201');
  assert.ok((risk?.daysToDue ?? 0) < 0);
  const ctr03 = summary.contracts.find(c => c.id === 'CTR-03')!;
  assert.ok(ctr03.issues.some(i => i.includes('已付金额') && i.includes('不一致')));
  assert.ok(ctr03.issues.some(i => i.includes('承诺缺少节点覆盖')));
});

test('contract without milestones reports coverage gap instead of an empty list', () => {
  const summary = projectSummary('PRJ-001');
  const ctr04 = summary.contracts.find(c => c.id === 'CTR-04')!;
  assert.equal(ctr04.milestones.length, 0);
  assert.ok(ctr04.issues.some(i => i.includes('未登记任何付款节点')));
  const risk = summary.fulfillmentRisks.find(r => r.contractId === 'CTR-04' && r.kind === 'contract');
  assert.equal(risk?.severity, 'warning');
  assert.equal(risk?.amount, 300000);
});

test('delivery date change is quantified with affected milestones', () => {
  const change = projectSummary('PRJ-001').deliveryChange!;
  assert.ok(change.daysShift < 0, 'PRJ-001 交付日应被提前');
  assert.equal(change.affectedMilestoneCount, 1, '母版验收落在新旧交付日之间');
  assert.equal(projectSummary('PRJ-002').deliveryChange, undefined);
});

test('invalid due dates degrade to invalid status instead of crashing', () => {
  const m = classifyMilestone({ name: '坏节点', due: 'not-a-date', amount: -5, status: 'open' }, '2026-12-31', '2026-10-01');
  assert.equal(m.derivedStatus, 'invalid');
  assert.equal(m.daysToDue, null);
  assert.equal(m.amount, 0);
  assert.ok(m.issues.some(i => i.includes('到期日缺失')));
  assert.ok(m.issues.some(i => i.includes('金额为负')));
});

test('near-due window is exactly NEAR_DUE_DAYS inclusive', () => {
  const delivery = '2026-12-31';
  const edge = classifyMilestone({ name: 'edge', due: `2026-10-${String(1 + NEAR_DUE_DAYS).padStart(2, '0')}`, amount: 1, status: 'open' }, delivery, '2026-10-01');
  const beyond = classifyMilestone({ name: 'beyond', due: `2026-10-${String(2 + NEAR_DUE_DAYS).padStart(2, '0')}`, amount: 1, status: 'open' }, delivery, '2026-10-01');
  assert.equal(edge.derivedStatus, 'near');
  assert.equal(beyond.derivedStatus, 'scheduled');
});
