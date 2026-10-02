export type ProjectStatus = 'development' | 'production' | 'post' | 'delivered';
export type AssetType = 'master' | 'trailer' | 'poster' | 'audio' | 'subtitle';
export type ApprovalStatus = 'pending' | 'approved' | 'rejected';
export type MilestoneRawStatus = 'open' | 'invoiced' | 'paid';
export type MilestoneDerivedStatus = 'overdue' | 'near' | 'invoicedPending' | 'paid' | 'scheduled' | 'invalid';

export interface Project { id: string; code: string; title: string; season: number; status: ProjectStatus; currency: string; budgetVersionId: string; deliveryDate: string; originalDeliveryDate?: string; }
export interface BudgetLine { id: string; projectId: string; category: string; subcategory: string; planned: number; committed: number; actual: number; forecast: number; owner: string; risk: 'low' | 'medium' | 'high'; }
export interface ContractMilestone { name: string; due: string; amount: number; status: MilestoneRawStatus; invoicedAt?: string; paidAt?: string; }
export interface Contract { id: string; projectId: string; vendor: string; scope: string; ceiling: number; committed: number; paid: number; budgetLineId?: string; milestones: ContractMilestone[]; }
export interface DerivedMilestone extends ContractMilestone { key: string; status: MilestoneRawStatus; derivedStatus: MilestoneDerivedStatus; daysToDue: number | null; lateDays: number | null; nearDue: boolean; afterDelivery: boolean; issues: string[]; }
export interface EnrichedContract extends Omit<Contract, 'milestones'> { milestones: DerivedMilestone[]; budgetLine?: BudgetLine; milestoneScheduledTotal: number; milestonePaidTotal: number; issues: string[]; }
export interface FulfillmentRisk { kind: 'milestone' | 'contract'; severity: 'critical' | 'warning'; contractId: string; vendor: string; scope: string; milestone?: string; due?: string; amount: number; rawStatus?: MilestoneRawStatus; derivedStatus?: MilestoneDerivedStatus; daysToDue: number | null; lateDays: number | null; reason: string; budgetLineId?: string; budgetLineLabel?: string; budgetHeadroom: number | null; atRiskRatio: number | null; budgetOverrun: boolean; }
export interface DeliveryChange { from: string; to: string; daysShift: number; affectedMilestoneCount: number; }
export interface Asset { id: string; projectId: string; name: string; type: AssetType; version: number; status: 'draft' | 'review' | 'approved' | 'locked'; owner: string; checksum: string; territories: string[]; platforms: string[]; availableFrom: string; availableTo: string; rightsTags: string[]; }
export interface Approval { id: string; projectId: string; entityType: 'budget' | 'asset' | 'delivery'; entityId: string; title: string; requestedBy: string; status: ApprovalStatus; approver: string; createdAt: string; comment?: string; }
export interface AuditEvent { id: string; action: string; entity: string; entityId: string; actor: string; at: string; details: string; }

const now = Date.now();
const iso = (days: number) => new Date(now + days * 86400000).toISOString().slice(0, 10);
const formatCNY = (value: number) => `¥${Math.round(value).toLocaleString('zh-CN')}`;
export const NEAR_DUE_DAYS = 14;

export const projects: Project[] = [
  { id: 'PRJ-001', code: 'NORTHSTAR-S1', title: 'Northstar / 北境回声', season: 1, status: 'post', currency: 'CNY', budgetVersionId: 'BUD-001-V3', deliveryDate: iso(44), originalDeliveryDate: iso(60) },
  { id: 'PRJ-002', code: 'ORBIT-DOC', title: 'Orbit / 轨道之外', season: 1, status: 'production', currency: 'CNY', budgetVersionId: 'BUD-002-V2', deliveryDate: iso(126) }
];
export const budgetLines: BudgetLine[] = [
  { id: 'BL-101', projectId: 'PRJ-001', category: '制作', subcategory: '主演与主创', planned: 12800000, committed: 11200000, actual: 10400000, forecast: 13100000, owner: '制片部', risk: 'medium' },
  { id: 'BL-102', projectId: 'PRJ-001', category: '制作', subcategory: '摄影器材与场地', planned: 6800000, committed: 6400000, actual: 5980000, forecast: 7020000, owner: '现场制片', risk: 'low' },
  { id: 'BL-103', projectId: 'PRJ-001', category: '后期', subcategory: '调色、DIT、母版', planned: 5400000, committed: 4300000, actual: 2800000, forecast: 5750000, owner: '后期制片', risk: 'high' },
  { id: 'BL-104', projectId: 'PRJ-001', category: '宣发', subcategory: '预告片与物料', planned: 3600000, committed: 1900000, actual: 1240000, forecast: 3200000, owner: '营销部', risk: 'medium' },
  { id: 'BL-201', projectId: 'PRJ-002', category: '制作', subcategory: '跨国拍摄', planned: 9200000, committed: 5100000, actual: 3300000, forecast: 9000000, owner: '制片部', risk: 'medium' }
];
export const contracts: Contract[] = [
  { id: 'CTR-01', projectId: 'PRJ-001', vendor: '曜石后期制作', scope: '4K HDR 调色、声音、DCP 母版', ceiling: 5200000, committed: 4300000, paid: 1100000, budgetLineId: 'BL-103', milestones: [
    { name: '启动款', due: iso(-35), amount: 1100000, status: 'paid', paidAt: iso(-28) },
    { name: '锁剪交付', due: iso(6), amount: 1200000, status: 'invoiced', invoicedAt: iso(-1) },
    { name: '母版验收', due: iso(50), amount: 2000000, status: 'open' }
  ] },
  { id: 'CTR-02', projectId: 'PRJ-001', vendor: '远景国际版权', scope: '北美与欧洲音乐同步许可', ceiling: 880000, committed: 880000, paid: 440000, milestones: [
    { name: '签署', due: iso(-16), amount: 440000, status: 'paid', paidAt: iso(-16) },
    { name: '交付版权证明', due: iso(-3), amount: 440000, status: 'invoiced', invoicedAt: iso(-9) }
  ] },
  { id: 'CTR-03', projectId: 'PRJ-002', vendor: '云帧视觉', scope: '纪录片航拍与卫星素材', ceiling: 1600000, committed: 1100000, paid: 600000, budgetLineId: 'BL-201', milestones: [
    { name: '素材包一', due: iso(-5), amount: 500000, status: 'open' }
  ] },
  { id: 'CTR-04', projectId: 'PRJ-001', vendor: '星幕字幕本地化', scope: '多语言字幕与本地化交付', ceiling: 300000, committed: 300000, paid: 0, budgetLineId: 'BL-104', milestones: [] }
];
export const assets: Asset[] = [
  { id: 'AST-001', projectId: 'PRJ-001', name: '北境回声 S01E01 4K HDR Master', type: 'master', version: 7, status: 'review', owner: '后期制片', checksum: 'sha256:91b7…e2a1', territories: ['CN', 'HK', 'SG'], platforms: ['影院', 'StreamBox'], availableFrom: iso(-2), availableTo: iso(730), rightsTags: ['音乐-同步许可', '演员-全媒介'] },
  { id: 'AST-002', projectId: 'PRJ-001', name: '主预告 90s / Cut A', type: 'trailer', version: 4, status: 'approved', owner: '营销部', checksum: 'sha256:42ca…9b02', territories: ['CN'], platforms: ['StreamBox', '短视频'], availableFrom: iso(6), availableTo: iso(180), rightsTags: ['演员-宣传许可'] },
  { id: 'AST-003', projectId: 'PRJ-001', name: '片尾曲 / Winter Signal', type: 'audio', version: 2, status: 'locked', owner: '音乐版权', checksum: 'sha256:113c…78f0', territories: ['CN', 'US', 'CA'], platforms: ['影院', 'StreamBox'], availableFrom: iso(-40), availableTo: iso(52), rightsTags: ['音乐-同步许可'] },
  { id: 'AST-004', projectId: 'PRJ-002', name: 'Orbit E02 Satellite Plates', type: 'master', version: 3, status: 'review', owner: '视觉总监', checksum: 'sha256:8a10…4a9d', territories: ['全球'], platforms: ['影院'], availableFrom: iso(18), availableTo: iso(365), rightsTags: ['航拍-编辑许可'] }
];
export const approvals: Approval[] = [
  { id: 'APR-01', projectId: 'PRJ-001', entityType: 'budget', entityId: 'BUD-001-V3', title: '后期超支预案 V3', requestedBy: '制片主任', status: 'pending', approver: '财务负责人', createdAt: iso(-1) },
  { id: 'APR-02', projectId: 'PRJ-001', entityType: 'asset', entityId: 'AST-001', title: 'E01 最终母版锁定', requestedBy: '后期制片', status: 'pending', approver: '总制片人', createdAt: iso(-2) },
  { id: 'APR-03', projectId: 'PRJ-002', entityType: 'delivery', entityId: 'DEL-007', title: '海外节展交付包', requestedBy: '发行部', status: 'approved', approver: '法务负责人', createdAt: iso(-5), comment: '已补充航拍授权凭证' }
];
export const auditEvents: AuditEvent[] = [{ id: 'AUD-01', action: 'CREATE', entity: 'budget', entityId: 'BUD-001-V3', actor: '制片主任', at: new Date(now - 86400000).toISOString(), details: '从 V2 复制并调整后期科目' }];

// 统一按本地日历日解析，避免 ISO 字符串被 UTC 转换后跨天；非法日期返回 null 由调用方降级
function toLocalDay(value: string | Date | undefined): Date | null {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : new Date(value.getFullYear(), value.getMonth(), value.getDate());
  const text = String(value).trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  const d = match ? new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])) : new Date(text);
  return Number.isNaN(d.getTime()) ? null : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
function dayDiff(from: Date, to: Date) { return Math.round((to.getTime() - from.getTime()) / 86400000); }

// 到期边界：到期日当天不算逾期（daysToDue=0），次日才算逾期；晚付从实际支付日相对到期日计算
export function classifyMilestone(milestone: ContractMilestone, deliveryDate: string, todayValue: string | Date = new Date()): DerivedMilestone {
  const issues: string[] = [];
  let status: MilestoneRawStatus = milestone.status;
  if (!['open', 'invoiced', 'paid'].includes(status)) { issues.push(`节点状态「${milestone.status}」无法识别，已按未开始处理`); status = 'open'; }
  const amount = Number.isFinite(milestone.amount) && milestone.amount >= 0 ? milestone.amount : 0;
  if (!Number.isFinite(milestone.amount) || milestone.amount < 0) issues.push('节点金额为负或缺失，请核对合同金额');
  const today = toLocalDay(todayValue) ?? new Date();
  const dueDate = toLocalDay(milestone.due);
  const delivery = toLocalDay(deliveryDate);
  const daysToDue = dueDate ? dayDiff(today, dueDate) : null;
  if (!dueDate) issues.push(`节点「${milestone.name}」到期日缺失或格式错误`);
  const paidDate = status === 'paid' ? toLocalDay(milestone.paidAt) : null;
  const lateDays = dueDate && paidDate ? dayDiff(dueDate, paidDate) : null;
  if (lateDays !== null && lateDays > 0) issues.push(`晚付 ${lateDays} 天（${milestone.paidAt} 支付）`);

  let derivedStatus: MilestoneDerivedStatus;
  if (!dueDate) derivedStatus = 'invalid';
  else if (status === 'paid') derivedStatus = 'paid';
  else if ((daysToDue as number) < 0) derivedStatus = 'overdue';
  else if (status === 'invoiced') derivedStatus = 'invoicedPending';
  else if ((daysToDue as number) <= NEAR_DUE_DAYS) derivedStatus = 'near';
  else derivedStatus = 'scheduled';

  const nearDue = daysToDue !== null && daysToDue >= 0 && daysToDue <= NEAR_DUE_DAYS && status !== 'paid';
  const afterDelivery = !!dueDate && !!delivery && dueDate.getTime() > delivery.getTime();
  if (afterDelivery && status !== 'paid') issues.push('节点晚于项目交付日，付款条件将压到锁剪之后');
  if (derivedStatus === 'overdue') issues.push(status === 'invoiced' ? `已开票但逾期 ${-(daysToDue as number)} 天未付` : `已逾期 ${-(daysToDue as number)} 天，仍未开票/未验收`);

  return { ...milestone, status, amount, key: `${milestone.name}@${milestone.due ?? 'NA'}`, derivedStatus, daysToDue, lateDays, nearDue, afterDelivery, issues };
}

function buildFulfillmentRisks(contract: EnrichedContract, budgetHeadroom: number | null, budgetLineLabel: string | undefined): FulfillmentRisk[] {
  const risks: FulfillmentRisk[] = [];
  const push = (risk: Omit<FulfillmentRisk, 'contractId' | 'vendor' | 'scope' | 'budgetHeadroom' | 'atRiskRatio' | 'budgetOverrun' | 'budgetLineId' | 'budgetLineLabel' | 'daysToDue' | 'lateDays'> & Partial<Pick<FulfillmentRisk, 'amount' | 'daysToDue' | 'lateDays'>>) => {
    const amount = risk.amount ?? 0;
    risks.push({
      ...risk,
      contractId: contract.id, vendor: contract.vendor, scope: contract.scope, amount,
      budgetLineId: contract.budgetLineId, budgetLineLabel,
      budgetHeadroom, budgetOverrun: budgetHeadroom !== null && budgetHeadroom < 0,
      atRiskRatio: budgetHeadroom !== null && budgetHeadroom > 0 ? amount / budgetHeadroom : null,
      daysToDue: risk.daysToDue ?? null, lateDays: risk.lateDays ?? null
    });
  };
  for (const m of contract.milestones) {
    const base = { milestone: m.name, due: m.due, amount: m.amount, rawStatus: m.status, derivedStatus: m.derivedStatus, daysToDue: m.daysToDue, lateDays: m.lateDays };
    if (m.derivedStatus === 'overdue') {
      push({ ...base, kind: 'milestone', severity: 'critical', reason: m.status === 'invoiced' ? `发票已开出，逾期 ${-(m.daysToDue as number)} 天未付款，锁剪前需完成支付` : `节点已逾期 ${-(m.daysToDue as number)} 天仍未开票/未验收，交付与付款均无凭证` });
    } else if (m.derivedStatus === 'invoicedPending') {
      push({ ...base, kind: 'milestone', severity: m.nearDue ? 'warning' : 'warning', reason: m.daysToDue === 0 ? '已开票待付，节点今日到期' : `已开票待付，距到期 ${m.daysToDue} 天` });
    } else if (m.derivedStatus === 'near') {
      push({ ...base, kind: 'milestone', severity: 'warning', reason: m.daysToDue === 0 ? '节点今日到期，尚未开票' : `节点临近到期，剩余 ${m.daysToDue} 天` });
    } else if (m.lateDays !== null && m.lateDays > 0) {
      push({ ...base, kind: 'milestone', severity: 'warning', reason: `款项已支付但晚于到期日 ${m.lateDays} 天，需复核供应商账期信用` });
    } else if (m.afterDelivery && m.derivedStatus !== 'invalid') {
      push({ ...base, kind: 'milestone', severity: 'warning', reason: '节点到期日晚于项目交付日，交付日调整后付款条件缺乏保障' });
    } else if (m.derivedStatus === 'invalid') {
      push({ ...base, kind: 'milestone', severity: 'warning', reason: '节点到期日缺失或无法解析，无法判断是否逾期' });
    }
  }
  for (const issue of contract.issues) {
    let amount = 0;
    if (issue.includes('未登记任何付款节点')) amount = Math.max(0, contract.committed - contract.paid);
    else if (issue.includes('不一致')) amount = Math.abs(contract.paid - contract.milestonePaidTotal);
    else if (issue.includes('承诺缺少节点覆盖')) amount = Math.max(0, contract.committed - contract.milestoneScheduledTotal);
    else if (issue.includes('超过合同额度')) amount = Math.max(contract.milestoneScheduledTotal - contract.ceiling, contract.committed - contract.ceiling);
    push({ kind: 'contract', severity: 'warning', reason: issue, amount });
  }
  return risks;
}

export function projectSummary(projectId = projects[0].id, todayValue: string | Date = new Date()) {
  const lines = budgetLines.filter(line => line.projectId === projectId);
  const project = projects.find(item => item.id === projectId);
  const projectContracts = contracts.filter(contract => contract.projectId === projectId);
  const projectAssets = assets.filter(asset => asset.projectId === projectId);
  const projectApprovals = approvals.filter(approval => approval.projectId === projectId);
  const planned = lines.reduce((sum, line) => sum + line.planned, 0);
  const forecast = lines.reduce((sum, line) => sum + line.forecast, 0);
  const actual = lines.reduce((sum, line) => sum + line.actual, 0);

  const enrichedContracts: EnrichedContract[] = projectContracts.map(contract => {
    const milestones = contract.milestones.map(m => classifyMilestone(m, project?.deliveryDate ?? '', todayValue));
    const issues: string[] = [];
    const milestonePaidTotal = milestones.filter(m => m.status === 'paid').reduce((sum, m) => sum + m.amount, 0);
    const milestoneScheduledTotal = milestones.reduce((sum, m) => sum + m.amount, 0);
    if (milestones.length === 0 && contract.committed > 0) issues.push(`合同已承诺 ${formatCNY(contract.committed)} 但未登记任何付款节点，锁剪前无法判断履约进度，未覆盖金额 ${formatCNY(Math.max(0, contract.committed - contract.paid))}`);
    if (milestones.length > 0 && milestonePaidTotal !== contract.paid) issues.push(`已付金额 ${formatCNY(contract.paid)} 与「已支付」节点合计 ${formatCNY(milestonePaidTotal)} 不一致，金额与节点状态需对账`);
    if (milestones.length > 0 && milestoneScheduledTotal < contract.committed) issues.push(`节点金额合计 ${formatCNY(milestoneScheduledTotal)} 小于承诺额 ${formatCNY(contract.committed)}，${formatCNY(contract.committed - milestoneScheduledTotal)} 承诺缺少节点覆盖`);
    if (milestoneScheduledTotal > contract.ceiling) issues.push(`节点金额合计 ${formatCNY(milestoneScheduledTotal)} 超过合同额度 ${formatCNY(contract.ceiling)}`);
    if (contract.committed > contract.ceiling) issues.push(`承诺额 ${formatCNY(contract.committed)} 超过合同额度 ${formatCNY(contract.ceiling)}`);
    return { ...contract, milestones, budgetLine: lines.find(line => line.id === contract.budgetLineId), milestoneScheduledTotal, milestonePaidTotal, issues };
  });

  const projectHeadroom = planned - forecast;
  const fulfillmentRisks = enrichedContracts.flatMap(contract => {
    const line = contract.budgetLine;
    const headroom = line ? line.planned - line.forecast : projectHeadroom;
    const label = line ? `${line.category} / ${line.subcategory}` : undefined;
    return buildFulfillmentRisks(contract, headroom, label);
  }).sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'critical' ? -1 : 1;
    const av = a.daysToDue ?? Number.POSITIVE_INFINITY; const bv = b.daysToDue ?? Number.POSITIVE_INFINITY;
    return av - bv;
  });

  let deliveryChange: DeliveryChange | undefined;
  if (project?.originalDeliveryDate) {
    const from = toLocalDay(project.originalDeliveryDate); const to = toLocalDay(project.deliveryDate);
    if (from && to && from.getTime() !== to.getTime()) {
      const daysShift = dayDiff(from, to);
      const affectedMilestoneCount = enrichedContracts.reduce((count, contract) => count + contract.milestones.filter(m => {
        const due = toLocalDay(m.due); if (!due) return false;
        return daysShift < 0 ? due.getTime() > to.getTime() && due.getTime() <= from.getTime() : due.getTime() < to.getTime() && due.getTime() >= from.getTime();
      }).length, 0);
      deliveryChange = { from: project.originalDeliveryDate, to: project.deliveryDate, daysShift, affectedMilestoneCount };
    }
  }

  return { project, planned, forecast, actual, variance: forecast - planned, utilization: planned ? actual / planned : 0, committed: lines.reduce((sum, line) => sum + line.committed, 0), contractExposure: projectContracts.reduce((sum, contract) => sum + contract.ceiling, 0), assetCount: projectAssets.length, pendingApprovals: projectApprovals.filter(item => item.status === 'pending').length, highRiskLines: lines.filter(line => line.risk === 'high'), lines, contracts: enrichedContracts, fulfillmentRisks, deliveryChange, assets: projectAssets, approvals: projectApprovals };
}

export function rightsConflicts(projectId = projects[0].id) {
  const list = assets.filter(asset => asset.projectId === projectId);
  const conflicts: { severity: 'critical' | 'warning'; assetA: string; assetB: string; reason: string }[] = [];
  for (let i = 0; i < list.length; i += 1) for (let j = i + 1; j < list.length; j += 1) {
    const a = list[i], b = list[j];
    const sameTag = a.rightsTags.some(tag => b.rightsTags.includes(tag));
    const sameTerritory = a.territories.includes('全球') || b.territories.includes('全球') || a.territories.some(territory => b.territories.includes(territory));
    if (sameTag && sameTerritory && a.availableTo >= b.availableFrom && b.availableTo >= a.availableFrom) conflicts.push({ severity: a.status === 'locked' || b.status === 'locked' ? 'critical' : 'warning', assetA: a.name, assetB: b.name, reason: `同一授权标签在重叠窗口内覆盖相同地域：${a.rightsTags.filter(tag => b.rightsTags.includes(tag)).join('、')}` });
  }
  return conflicts;
}

export function approve(id: string, status: ApprovalStatus, comment = '') {
  const item = approvals.find(approval => approval.id === id); if (!item) return undefined;
  item.status = status; item.comment = comment; auditEvents.unshift({ id: `AUD-${Date.now()}`, action: status.toUpperCase(), entity: item.entityType, entityId: item.entityId, actor: '当前审批人', at: new Date().toISOString(), details: comment || `${item.title} 已${status === 'approved' ? '通过' : '驳回'}` }); return item;
}
export function createApproval(input: Pick<Approval, 'projectId' | 'entityType' | 'entityId' | 'title' | 'requestedBy' | 'approver'>) { const item: Approval = { ...input, id: `APR-${Date.now()}`, status: 'pending', createdAt: new Date().toISOString() }; approvals.unshift(item); return item; }
export function dashboard() { return projects.map(project => projectSummary(project.id)).map(summary => ({ id: summary.project?.id, title: summary.project?.title, status: summary.project?.status, forecast: summary.forecast, variance: summary.variance, pendingApprovals: summary.pendingApprovals, rightsConflicts: rightsConflicts(summary.project?.id).length })); }
