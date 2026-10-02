import { useCallback, useEffect, useMemo, useState } from 'react';

type Project = { id: string; title: string; status: string; deliveryDate: string };
type RawStatus = 'open' | 'invoiced' | 'paid';
type DerivedStatus = 'overdue' | 'near' | 'invoicedPending' | 'paid' | 'scheduled' | 'invalid';
type BudgetLine = { id: string; category: string; subcategory: string; planned: number; committed: number; actual: number; forecast: number; risk: string };
type Milestone = {
  name: string; due: string; amount: number; status: RawStatus; invoicedAt?: string; paidAt?: string;
  key: string; derivedStatus: DerivedStatus; daysToDue: number | null; lateDays: number | null;
  nearDue: boolean; afterDelivery: boolean; issues: string[];
};
type Contract = {
  id: string; vendor: string; scope: string; ceiling: number; committed: number; paid: number;
  budgetLineId?: string; budgetLine?: BudgetLine; milestones: Milestone[];
  milestoneScheduledTotal: number; milestonePaidTotal: number; issues: string[];
};
type FulfillmentRisk = {
  kind: 'milestone' | 'contract'; severity: 'critical' | 'warning';
  contractId: string; vendor: string; scope: string; milestone?: string; due?: string; amount: number;
  rawStatus?: RawStatus; derivedStatus?: DerivedStatus; daysToDue: number | null; lateDays: number | null;
  reason: string; budgetLineId?: string; budgetLineLabel?: string;
  budgetHeadroom: number | null; atRiskRatio: number | null; budgetOverrun: boolean;
};
type DeliveryChange = { from: string; to: string; daysShift: number; affectedMilestoneCount: number };
type Summary = {
  planned: number; forecast: number; actual: number; variance: number; utilization: number;
  committed: number; contractExposure: number; assetCount: number; pendingApprovals: number;
  highRiskLines: BudgetLine[]; lines: BudgetLine[]; contracts: Contract[];
  fulfillmentRisks: FulfillmentRisk[]; deliveryChange?: DeliveryChange;
  assets: { id: string; name: string; type: string; version: number; status: string; availableTo: string }[];
  approvals: { id: string; title: string; status: string; approver: string }[];
  project: Project;
};
type Conflict = { severity: string; assetA: string; assetB: string; reason: string };

const money = (n: number) => `¥${(n / 10000).toFixed(0)}万`;
const api = '/api';
const NEAR_DUE_DAYS = 14;

const MILESTONE_META: Record<DerivedStatus, { label: string; cls: string }> = {
  overdue: { label: '逾期', cls: 'overdue' },
  near: { label: '临近', cls: 'near' },
  invoicedPending: { label: '已开票待付', cls: 'invoiced' },
  paid: { label: '已支付', cls: 'paid' },
  scheduled: { label: '未到期', cls: 'scheduled' },
  invalid: { label: '日期异常', cls: 'invalid' },
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${api}${path}`, init);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.message || `请求失败 (${response.status})`);
  return body as T;
}
const reasonMessage = (reason: unknown) => reason instanceof Error ? reason.message : '无法连接制作服务';
const asArray = <T,>(value: unknown): T[] => (Array.isArray(value) ? value as T[] : []);
const num = (value: unknown, fallback = 0) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

// 前端兜底推导：服务端字段缺失（旧版本响应/部分加载失败）时仍按同一套到期边界出状态
function fallbackDerive(rawStatus: string, due: string, deliveryDate: string, paidAt?: string) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const parse = (text: string) => { const d = new Date(`${text}T00:00:00`); return Number.isNaN(d.getTime()) ? null : d; };
  const dueDate = parse(due);
  const delivery = parse(deliveryDate);
  const daysToDue = dueDate ? Math.round((dueDate.getTime() - today.getTime()) / 86400000) : null;
  const paid = rawStatus === 'paid' ? parse(paidAt ?? '') : null;
  const lateDays = dueDate && paid ? Math.round((paid.getTime() - dueDate.getTime()) / 86400000) : null;
  let derivedStatus: DerivedStatus;
  if (!dueDate) derivedStatus = 'invalid';
  else if (rawStatus === 'paid') derivedStatus = 'paid';
  else if ((daysToDue as number) < 0) derivedStatus = 'overdue';
  else if (rawStatus === 'invoiced') derivedStatus = 'invoicedPending';
  else if ((daysToDue as number) <= NEAR_DUE_DAYS) derivedStatus = 'near';
  else derivedStatus = 'scheduled';
  return { daysToDue, lateDays, derivedStatus, nearDue: daysToDue !== null && daysToDue >= 0 && daysToDue <= NEAR_DUE_DAYS && rawStatus !== 'paid', afterDelivery: !!dueDate && !!delivery && dueDate.getTime() > delivery.getTime() };
}

function normalizeMilestone(raw: Partial<Milestone> & { name?: string }, deliveryDate: string): Milestone {
  const status: RawStatus = raw.status === 'invoiced' || raw.status === 'paid' ? raw.status : 'open';
  const due = typeof raw.due === 'string' ? raw.due : '';
  const fallback = fallbackDerive(status, due, deliveryDate, raw.paidAt);
  const derivedStatus = (raw.derivedStatus as DerivedStatus) in MILESTONE_META ? raw.derivedStatus as DerivedStatus : fallback.derivedStatus;
  return {
    name: raw.name ?? '未命名节点', due, amount: num(raw.amount), status,
    invoicedAt: raw.invoicedAt, paidAt: raw.paidAt,
    key: raw.key || `${raw.name ?? 'node'}@${due || 'NA'}`,
    derivedStatus,
    daysToDue: typeof raw.daysToDue === 'number' ? raw.daysToDue : fallback.daysToDue,
    lateDays: typeof raw.lateDays === 'number' ? raw.lateDays : fallback.lateDays,
    nearDue: typeof raw.nearDue === 'boolean' ? raw.nearDue : fallback.nearDue,
    afterDelivery: typeof raw.afterDelivery === 'boolean' ? raw.afterDelivery : fallback.afterDelivery,
    issues: asArray<string>(raw.issues),
  };
}

function normalizeSummary(raw: Partial<Summary>): Summary {
  const project = (raw.project ?? { id: '', title: '未知项目', status: '', deliveryDate: '' }) as Project;
  const lines = asArray<BudgetLine>(raw.lines).map(l => ({ ...l, planned: num(l?.planned), committed: num(l?.committed), actual: num(l?.actual), forecast: num(l?.forecast) }));
  const contracts = asArray<Partial<Contract> & { vendor?: string }>(raw.contracts).map((c, ci) => {
    const id = c.id ?? `CTR-LOCAL-${ci}`;
    const budgetLine = c.budgetLineId ? lines.find(l => l.id === c.budgetLineId) : undefined;
    return {
      id, vendor: c.vendor ?? '未知供应商', scope: c.scope ?? '', ceiling: num(c.ceiling),
      committed: num(c.committed), paid: num(c.paid), budgetLineId: c.budgetLineId,
      budgetLine, milestones: asArray<Partial<Milestone>>(c.milestones).map(m => normalizeMilestone(m, project.deliveryDate)),
      milestoneScheduledTotal: num(c.milestoneScheduledTotal), milestonePaidTotal: num(c.milestonePaidTotal),
      issues: asArray<string>(c.issues),
    };
  });
  return {
    project,
    planned: num(raw.planned), forecast: num(raw.forecast), actual: num(raw.actual),
    variance: num(raw.variance), utilization: num(raw.utilization), committed: num(raw.committed),
    contractExposure: num(raw.contractExposure), assetCount: num(raw.assetCount),
    pendingApprovals: num(raw.pendingApprovals),
    highRiskLines: asArray<BudgetLine>(raw.highRiskLines), lines, contracts,
    fulfillmentRisks: asArray<FulfillmentRisk>(raw.fulfillmentRisks).map(r => ({ ...r, amount: num(r.amount), budgetHeadroom: typeof r.budgetHeadroom === 'number' ? r.budgetHeadroom : null, atRiskRatio: typeof r.atRiskRatio === 'number' ? r.atRiskRatio : null, daysToDue: typeof r.daysToDue === 'number' ? r.daysToDue : null, lateDays: typeof r.lateDays === 'number' ? r.lateDays : null })),
    deliveryChange: raw.deliveryChange,
    assets: asArray<Summary['assets'][number]>(raw.assets),
    approvals: asArray<Summary['approvals'][number]>(raw.approvals),
  };
}

function dueText(m: Milestone) {
  if (m.daysToDue === null) return '到期日缺失';
  if (m.daysToDue === 0) return '今日到期';
  return m.daysToDue > 0 ? `还剩 ${m.daysToDue} 天` : `逾期 ${-m.daysToDue} 天`;
}
function impactText(r: FulfillmentRisk) {
  if (!r.budgetLineLabel) return '未关联预算科目，建议先补关联再判断付款敞口';
  if (r.budgetOverrun) return `${r.budgetLineLabel}：预测已超支 ${money(-(r.budgetHeadroom ?? 0))}，付款将继续放大风险`;
  const ratio = r.atRiskRatio != null && (r.budgetHeadroom ?? 0) > 0 ? Math.round(r.atRiskRatio * 100) : null;
  return `${r.budgetLineLabel}：剩余空间 ${money(r.budgetHeadroom ?? 0)}${ratio ? `，该敞口占 ${Math.min(999, ratio)}%` : ''}`;
}

export default function App() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [selected, setSelected] = useState('PRJ-001');
  const [summary, setSummary] = useState<Summary>();
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [tab, setTab] = useState<'overview' | 'budget' | 'rights'>('overview');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [summaryError, setSummaryError] = useState('');
  const [conflictsError, setConflictsError] = useState('');
  const [focus, setFocus] = useState<{ contractId: string; milestoneKey?: string }>({ contractId: '' });

  const load = useCallback(async (id = 'PRJ-001', mode: 'initial' | 'refresh' = 'initial') => {
    if (mode === 'refresh') setRefreshing(true); else setLoading(true);
    setError('');
    try {
      const items = await request<Project[]>('/projects');
      const active = items.find(item => item.id === id) ?? items[0];
      if (!active) throw new Error('服务端没有返回项目数据');
      const [s, c] = await Promise.allSettled([
        request<Partial<Summary>>(`/projects/${active.id}/summary`),
        request<unknown>(`/projects/${active.id}/rights-conflicts`),
      ]);
      setProjects(items);
      setSelected(active.id);
      setFocus({ contractId: '' });
      if (s.status === 'fulfilled') { setSummary(normalizeSummary(s.value)); setSummaryError(''); }
      else {
        const msg = reasonMessage(s.reason);
        setSummaryError(msg);
        if (mode === 'refresh') setError(`合同与预算数据刷新失败：${msg}`);
        else setError(msg);
      }
      if (c.status === 'fulfilled') { setConflicts(asArray<Conflict>(c.value)); setConflictsError(''); }
      else { setConflicts([]); setConflictsError(reasonMessage(c.reason)); }
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '无法连接制作服务');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  // 从风险雷达回到供应商与原节点：切换到预算页后滚动并高亮
  useEffect(() => {
    if (tab !== 'budget' || !focus.contractId) return;
    const all = Array.from(document.querySelectorAll('[data-mkey]')) as HTMLElement[];
    const target = focus.milestoneKey
      ? all.find(el => el.dataset.mkey === focus.milestoneKey)
      : document.querySelector(`[data-contract="${focus.contractId}"]`);
    target?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [tab, focus, summary]);

  const jumpToRisk = (r: FulfillmentRisk) => {
    setFocus({ contractId: r.contractId, milestoneKey: r.kind === 'milestone' && r.milestone ? `${r.milestone}@${r.due ?? 'NA'}` : undefined });
    setTab('budget');
  };
  const switchProject = (id: string) => { void load(id, summary ? 'refresh' : 'initial'); };

  const approve = async (id: string) => {
    try {
      await request(`/approvals/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'approved', comment: '在控制台完成复核' }) });
      setMessage('审批已通过，审计事件已写入');
      await load(selected, 'refresh');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '审批操作失败'); }
  };

  const variancePct = useMemo(() => summary ? Math.round(summary.variance / summary.planned * 100) : 0, [summary]);
  const riskCount = summary ? summary.pendingApprovals + conflicts.length + summary.fulfillmentRisks.length : 0;

  if (loading && !summary) return <main className="connection-state"><div className="loading">正在载入制作控制台…</div><small>正在通过 Vite API 代理连接本地制作服务</small></main>;
  if (!summary) return <main className="connection-state"><h2>无法连接制作服务</h2><p>{error || '服务端没有返回项目数据。'}</p><p>请从项目根目录运行 <code>npm run dev</code>，确认前端 5173 和 API 4104 均已启动。</p><button onClick={() => void load(selected)}>重新连接</button></main>;

  const retryBanner = (msg: string) => msg
    ? <div className="load-error"><span>数据加载失败：{msg}</span><button onClick={() => void load(selected, 'refresh')}>重试</button></div>
    : null;

  return <main>
    <header>
      <div>
        <div className="eyebrow">STUDIO OPS / RIGHTS &amp; FINANCE CONTROL</div>
        <h1>FrameLedger <span>影视制作预算与资产版权协同</span></h1>
        <p>将预算承诺、供应商付款、资产版本与跨地域版权窗口串成可审计的交付链路。</p>
      </div>
      <div className="header-actions">
        <select value={selected} onChange={e => switchProject(e.target.value)}>{projects.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}</select>
        <span className="live"><i /> {refreshing ? 'REFRESHING…' : 'LIVE CONTROL'}</span>
      </div>
    </header>
    {message && <div className="toast" onClick={() => setMessage('')}>{message} ×</div>}
    {error && <div className="toast error-toast" onClick={() => setError('')}>{error} ×</div>}

    <section className="kpis">
      <div><small>FORECAST COST</small><b>{money(summary.forecast)}</b><span>预算偏差 <em className={summary.variance > 0 ? 'bad' : ''}>{variancePct}%</em></span></div>
      <div><small>COMMITTED</small><b>{money(summary.committed)}</b><span>已锁定供应商与合同</span></div>
      <div><small>ASSET REGISTER</small><b>{summary.assetCount}<em> 个</em></b><span>版本与交付状态纳管</span></div>
      <div><small>RISK QUEUE</small><b>{riskCount}<em> 项</em></b><span>{summary.fulfillmentRisks.length} 条履约风险 / {conflicts.length} 条版权冲突 / {summary.pendingApprovals} 个审批</span></div>
    </section>

    <nav className="tabs">
      <button className={tab === 'overview' ? 'active' : ''} onClick={() => setTab('overview')}>项目驾驶舱</button>
      <button className={tab === 'budget' ? 'active' : ''} onClick={() => setTab('budget')}>预算与合同</button>
      <button className={tab === 'rights' ? 'active' : ''} onClick={() => setTab('rights')}>资产版权图谱</button>
      <span>
        交付日 {summary.project.deliveryDate}
        {summary.deliveryChange && <em className={summary.deliveryChange.daysShift < 0 ? 'bad' : ''}> · 已{summary.deliveryChange.daysShift < 0 ? `提前 ${-summary.deliveryChange.daysShift}` : `延后 ${summary.deliveryChange.daysShift}`} 天</em>}
      </span>
    </nav>

    {tab === 'overview' && <div className="grid">
      <section className="panel hero">
        <div className="panel-head">
          <div><div className="eyebrow">PROJECT HEALTH / {summary.project.id}</div><h2>{summary.project.title}</h2></div>
          <span className="badge amber">{summary.project.status.toUpperCase()}</span>
        </div>
        <div className="progress-label"><span>成本消耗 {Math.round(summary.utilization * 100)}%</span><b>{money(summary.actual)} / {money(summary.planned)}</b></div>
        <div className="progress"><i style={{ width: `${Math.min(100, summary.utilization * 100)}%` }} /></div>
        <div className="split">
          <div><small>合同暴露额</small><strong>{money(summary.contractExposure)}</strong></div>
          <div><small>高风险预算项</small><strong className="bad">{summary.highRiskLines.length}</strong></div>
          <div><small>版权冲突</small><strong className={conflicts.length ? 'bad' : ''}>{conflicts.length}</strong></div>
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><h3>待审批队列</h3><span>{summary.approvals.filter(a => a.status === 'pending').length} PENDING</span></div>
        {summary.approvals.map(a => <div className="approval" key={a.id}><span className={`status ${a.status}`} /><div><b>{a.title}</b><small>{a.approver} · {a.id}</small></div>{a.status === 'pending' ? <button onClick={() => approve(a.id)}>通过</button> : <em>已完成</em>}</div>)}
      </section>
      <section className="panel wide">
        <div className="panel-head"><h3>交付风险雷达</h3><span>版权窗口 + 供应商节点履约，点击风险可回到供应商与原节点</span></div>
        {retryBanner(summaryError || conflictsError)}
        {[
          ...conflicts.map((c, i) => ({ key: `c${i}`, severity: c.severity, title: c.assetA, sub: `↔ ${c.assetB} · ${c.reason}`, impact: '', onClick: undefined as undefined | (() => void) })),
          ...summary.fulfillmentRisks.map((r, i) => ({
            key: `f${i}`, severity: r.severity,
            title: r.kind === 'milestone' ? `${r.vendor} · ${r.milestone}` : r.vendor,
            sub: `${r.reason}${r.due ? ` · ${r.due}` : ''} · ${money(r.amount)}`,
            impact: impactText(r), onClick: () => jumpToRisk(r),
          })),
        ].sort((a, b) => a.severity === b.severity ? 0 : a.severity === 'critical' ? -1 : 1)
          .map(item => (
            <button type="button" className={`risk-row ${item.onClick ? 'clickable' : ''}`} key={item.key} onClick={item.onClick}>
              <strong className={item.severity}>{item.severity === 'critical' ? 'CRITICAL' : 'WARNING'}</strong>
              <div>
                <b>{item.title}</b>
                <small>{item.sub}</small>
                {item.impact && <small className="risk-impact">预算影响：{item.impact}</small>}
              </div>
              {item.onClick && <em className="goto">供应商节点 →</em>}
            </button>
          ))}
        {!conflicts.length && !summary.fulfillmentRisks.length && !summaryError && !conflictsError && <div className="empty">当前项目未发现版权窗口冲突与节点履约风险。</div>}
      </section>
    </div>}

    {tab === 'budget' && <div className="grid">
      {summary.deliveryChange && <section className="panel wide delivery-banner">
        <b>交付日变更：{summary.deliveryChange.from} → {summary.deliveryChange.to}</b>
        <span>{summary.deliveryChange.daysShift < 0 ? `提前 ${-summary.deliveryChange.daysShift} 天` : `延后 ${summary.deliveryChange.daysShift} 天`}，{summary.deliveryChange.affectedMilestoneCount} 个付款节点落入压缩窗口，锁剪前需重排付款与验收条件。</span>
      </section>}
      {retryBanner(summaryError)}
      <section className="panel wide">
        <div className="panel-head"><h3>预算版本 V3 / 成本基线</h3><span>实际 + 承诺 + 预测</span></div>
        <div className="table">
          <div className="tr th"><span>科目</span><span>预算</span><span>已承诺</span><span>实际</span><span>预测</span><span>风险</span></div>
          {summary.lines.map(line => <div className="tr" key={line.id}>
            <span><b>{line.category}</b><small>{line.subcategory}</small></span>
            <span>{money(line.planned)}</span>
            <span>{money(line.committed)}</span>
            <span>{money(line.actual)}</span>
            <span className={line.forecast > line.planned ? 'bad' : ''}>{money(line.forecast)}</span>
            <span className={`risk ${line.risk}`}>{line.risk}</span>
          </div>)}
        </div>
      </section>
      <section className="panel wide">
        <div className="panel-head"><h3>供应商付款里程碑</h3><span>按当前日期与项目交付日 {summary.project.deliveryDate} 判定：逾期 / 临近 / 已开票待付 / 已支付</span></div>
        {summary.contracts.map(c => {
          const counts = c.milestones.reduce((acc, m) => { acc[m.derivedStatus] += 1; return acc; }, { overdue: 0, near: 0, invoicedPending: 0, paid: 0, scheduled: 0, invalid: 0 } as Record<DerivedStatus, number>);
          const focused = focus.contractId === c.id;
          const headroom = c.budgetLine ? c.budgetLine.planned - c.budgetLine.forecast : null;
          return <div className={`contract ${focused ? 'focused' : ''}`} data-contract={c.id} key={c.id}>
            <div className="contract-head">
              <div><b>{c.vendor}</b><small>{c.scope} · {c.id}</small></div>
              <span className="milestone-counts">
                {counts.overdue > 0 && <i className="chip overdue">逾期 {counts.overdue}</i>}
                {counts.near > 0 && <i className="chip near">临近 {counts.near}</i>}
                {counts.invoicedPending > 0 && <i className="chip invoiced">已开票待付 {counts.invoicedPending}</i>}
                {counts.paid > 0 && <i className="chip paid">已支付 {counts.paid}</i>}
                {!c.milestones.length && <i className="chip invalid">无节点</i>}
              </span>
            </div>
            <div className="contract-bar"><i style={{ width: `${c.committed ? Math.round(c.paid / c.committed * 100) : 0}%` }} /></div>
            <div className="contract-meta">
              <span>{money(c.paid)} / {money(c.committed)} 已付 · 合同额度 {money(c.ceiling)}</span>
              <small>{c.budgetLine
                ? <>关联预算：{c.budgetLine.category} / {c.budgetLine.subcategory} · {headroom != null && headroom < 0 ? <em className="bad">科目预测已超支 {money(-headroom)}</em> : <>科目剩余空间 {money(headroom ?? 0)}</>}</>
                : '未关联预算科目，无法计算预算影响'}</small>
            </div>
            {c.milestones.length > 0 && <div className="milestone-list">
              {c.milestones.map(m => {
                const meta = MILESTONE_META[m.derivedStatus];
                return <div className={`milestone-row ${focus.milestoneKey === m.key ? 'focused' : ''}`} data-mkey={m.key} key={m.key}>
                  <span className="m-name"><b>{m.name}</b><small>{m.due || '日期缺失'} · {dueText(m)}</small></span>
                  <span className="m-amount">{money(m.amount)}</span>
                  <span className="m-tags">
                    {m.lateDays != null && m.lateDays > 0 && <i className="tag late">晚付 {m.lateDays} 天</i>}
                    {m.afterDelivery && m.status !== 'paid' && <i className="tag after">晚于交付日</i>}
                    {m.derivedStatus === 'invalid' && m.issues.map((x, i) => <i className="tag bad" key={i}>{x}</i>)}
                  </span>
                  <span className={`pill milestone ${meta.cls}`}>{meta.label}</span>
                </div>;
              })}
            </div>}
            {c.issues.map((issue, i) => <div className="contract-issue" key={i}>⚠ {issue}</div>)}
          </div>;
        })}
        {!summary.contracts.length && <div className="empty">该项目暂无合同数据。</div>}
      </section>
    </div>}

    {tab === 'rights' && <div className="grid">
      <section className="panel wide">
        <div className="panel-head"><h3>资产版本登记</h3><span>{summary.assets.length} assets / checksum tracked</span></div>
        <div className="table">
          <div className="tr th"><span>资产</span><span>版本</span><span>状态</span><span>授权截止</span></div>
          {summary.assets.map(a => <div className="tr" key={a.id}><span><b>{a.name}</b><small>{a.id} · {a.type}</small></span><span>v{a.version}</span><span className={`pill ${a.status}`}>{a.status}</span><span>{a.availableTo}</span></div>)}
        </div>
      </section>
      <section className="panel">
        <div className="panel-head"><h3>授权冲突</h3><span>{conflicts.length} detected</span></div>
        {retryBanner(conflictsError)}
        {conflicts.map((c, i) => <div className="conflict" key={i}><strong>{c.severity}</strong><b>{c.assetA}</b><small>{c.reason}</small></div>)}
        {!conflicts.length && !conflictsError && <div className="empty">当前项目未发现版权窗口冲突。</div>}
      </section>
    </div>}
    <footer>FrameLedger baseline · 内存仓储 + REST API · 可扩展对象存储、预算版本审批、版权方台账与交付包校验</footer>
  </main>;
}
