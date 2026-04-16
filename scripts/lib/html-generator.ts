import { RouteFile } from './file-scanner';
import { ParsedEndpoint, HttpMethod } from './ast-parser';
import { ClientApiEntry } from './client-api-scanner';

export interface ApiEntry {
  route: RouteFile;
  endpoint: ParsedEndpoint;
}

const METHOD_COLORS: Record<string, { bg: string; color: string }> = {
  GET: { bg: '#EAF3DE', color: '#3B6D11' },
  POST: { bg: '#E6F1FB', color: '#185FA5' },
  PUT: { bg: '#FAEEDA', color: '#854F0B' },
  DELETE: { bg: '#FCEBEB', color: '#A32D2D' },
  PATCH: { bg: '#FBEAF0', color: '#993556' },
  ALL: { bg: '#F1EFE8', color: '#444441' },
};

function badge(method: string, large = false): string {
  const c = METHOD_COLORS[method] ?? METHOD_COLORS.ALL;
  const s = large
    ? 'font-size:12px;padding:4px 10px;border-radius:5px'
    : 'font-size:10px;padding:2px 6px;border-radius:4px;min-width:44px;text-align:center';
  return `<span style="display:inline-block;font-family:monospace;font-weight:500;background:${c.bg};color:${c.color};${s}">${method}</span>`;
}

function esc(str: string): string {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function groupBy<T>(items: T[], key: (item: T) => string): Map<string, T[]> {
  const map = new Map<string, T[]>();
  items.forEach((item) => {
    const k = key(item);
    if (!map.has(k)) map.set(k, []);
    map.get(k)!.push(item);
  });
  return map;
}

function paramSection(params: { name: string; type: string; description: string; required: boolean }[]): string {
  if (params.length === 0) return `<div class="param-empty">파라미터 없음 — JSDoc @param 또는 모델 클래스 미확인</div>`;
  return params.map((p) => `
    <div class="param-row">
      <div class="param-name">${esc(p.name)}<span class="pill ${p.required ? 'req' : 'opt'}">${p.required ? 'required' : 'optional'}</span></div>
      <span class="type-badge">${esc(p.type)}</span>
      <div class="param-desc">${esc(p.description || '')}</div>
    </div>`).join('');
}

function returnsSection(returns: { type: string; description: string } | null): string {
  if (!returns) return `<div class="param-empty">반환 정보 없음 — JSDoc @returns 미작성</div>`;
  return `<div class="returns-box"><div class="returns-type">${esc(returns.type)}</div><div class="returns-desc">${esc(returns.description)}</div></div>`;
}

function usageTree(entry: ClientApiEntry): string {
  const chain = entry.usageChain;
  if (!chain || (chain.directCallers.length === 0 && chain.pageCallers.length === 0)) {
    return `<div class="param-empty">사용처를 찾지 못했습니다.</div>`;
  }

  const shortPath = (file: string) => {
    const parts = file.replace(/\\/g, '/').split('/');
    return parts.length >= 3 ? parts.slice(-3).join('/') : file;
  };

  const rows: string[] = [];

  chain.directCallers.forEach((caller) => {
    rows.push(`
      <div class="usage-row-caller">
        <span class="usage-caller">${esc(caller.functionName)}</span>
        <span class="usage-via">${esc(caller.file)}</span>
      </div>`);
  });

  if (chain.pageCallers.length > 0) {
    const pages = chain.pageCallers.filter((c) => c.isPage);
    const components = chain.pageCallers.filter((c) => !c.isPage);

    pages.forEach((p) => {
      rows.push(`
        <div class="usage-row-page">
          <span class="usage-page-main" title="${esc(p.file)}">${esc(shortPath(p.file))}</span>
        </div>`);
    });

    components.forEach((c) => {
      const isPageLike = c.file.endsWith('.tsx') || c.file.endsWith('.vue');
      if (isPageLike) {
        rows.push(`
          <div class="usage-row-page">
            <span class="usage-page-main" title="${esc(c.file)}">${esc(shortPath(c.file))}</span>
          </div>`);
      } else {
        rows.push(`
          <div class="usage-row-caller">
            <span class="usage-caller" title="${esc(c.file)}">${esc(c.functionName)}</span>
            <span class="usage-via">${esc(c.file)}</span>
          </div>`);
      }
    });
  }

  return rows.join('');
}

function serverPanels(entries: ApiEntry[]): string {
  return entries.map((e, i) => {
    const { methods, description, params, returns, sourceLine } = e.endpoint;
    return `
    <div class="panel" id="s-panel-${i}">
      <div class="ep-header">
        <div class="ep-title">${methods.map((m) => badge(m, true)).join(' ')}<span class="path-text">${esc(e.route.routePath)}</span></div>
        <div class="ep-desc">${esc(description || '설명 없음 — JSDoc @description을 추가해주세요.')}</div>
        <div class="source-path">${esc(e.route.relativePath)} · line ${sourceLine}</div>
      </div>
      <div class="section"><div class="section-title">Parameters</div>${paramSection(params)}</div>
      <div class="section"><div class="section-title">Returns</div>${returnsSection(returns)}</div>
    </div>`;
  }).join('');
}

function clientPanels(entries: ClientApiEntry[]): string {
  return entries.map((e, i) => `
    <div class="panel" id="c-panel-${i}">
      <div class="ep-header">
        <div class="ep-title">${badge(e.method, true)}<span class="path-text">/${esc(e.url)}</span></div>
        <div class="ep-desc">${esc(e.description || '설명 없음 — JSDoc @description을 추가해주세요.')}</div>
        <div class="source-path">${esc(e.sourceFile)} · ${esc(e.functionName)}() · line ${e.sourceLine}</div>
      </div>
      <div class="section"><div class="section-title">Parameters</div>${paramSection(e.params)}</div>
      <div class="section"><div class="section-title">Returns</div>${returnsSection(e.returns)}</div>
      <div class="section"><div class="section-title">사용처</div><div class="usage-tree">${usageTree(e)}</div></div>
    </div>`).join('');
}

function serverSidebar(entries: ApiEntry[]): string {
  const groups = groupBy(entries, (e) => e.route.group);
  return Array.from(groups.entries()).map(([group, items]) => `
    <div class="group-label">${esc(group)}</div>
    ${items.map((e) => {
    const i = entries.indexOf(e);
    const m = e.endpoint.methods[0] ?? 'ALL';
    return `<div class="route-item" data-tab="server" data-index="${i}" onclick="select('server',${i})">${badge(m)}<span class="route-path">${esc(e.route.routePath)}</span></div>`;
  }).join('')}`).join('');
}

function clientSidebar(entries: ClientApiEntry[]): string {
  const groups = groupBy(entries, (e) => e.group);
  return Array.from(groups.entries()).map(([group, items]) => `
    <div class="group-label">${esc(group)}</div>
    ${items.map((e) => {
    const i = entries.indexOf(e);
    const chain = e.usageChain;
    const pageCount = chain
      ? [...new Set(chain.pageCallers
        .filter((p) => !chain.directCallers.some((c) => c.file === p.file))
        .map((p) => p.file))].length
      : 0;
    const pageHint = pageCount > 0 ? `<span class="page-count" data-tip="${pageCount}개 페이지에서 사용">${pageCount}</span>` : '';
    return `<div class="route-item" data-tab="client" data-index="${i}" onclick="select('client',${i})">${badge(e.method)}<span class="route-path">/${esc(e.url)}</span>${pageHint}</div>`;
  }).join('')}`).join('');
}

export function generateHtml(
  serverEntries: ApiEntry[],
  clientEntries: ClientApiEntry[],
  projectName: string
): string {
  const now = new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' });

  return `<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(projectName)} — API Docs</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#fff;--bg2:#f8f8f6;--bd:rgba(0,0,0,0.1);--tx:#1a1a1a;--tx2:#6b6b68;--tx3:#9e9e9b}
@media(prefers-color-scheme:dark){:root{--bg:#1e1e1c;--bg2:#252523;--bd:rgba(255,255,255,0.1);--tx:#e8e8e2;--tx2:#a0a09c;--tx3:#6b6b68}}
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:var(--bg);color:var(--tx);font-size:14px}
.wrap{display:flex;height:100vh;overflow:hidden}

/* 사이드바 */
.sidebar{width:280px;min-width:280px;border-right:0.5px solid var(--bd);overflow-y:auto;background:var(--bg2);display:flex;flex-direction:column}
.sidebar-header{padding:16px 18px 12px;border-bottom:0.5px solid var(--bd)}
.sidebar-header h1{font-size:14px;font-weight:500}
.sidebar-header p{font-size:12px;color:var(--tx3);margin-top:2px}
.tabs{display:flex;border-bottom:0.5px solid var(--bd);flex-shrink:0}
.tab-btn{flex:1;padding:10px 0;font-size:12px;font-weight:500;background:none;border:none;cursor:pointer;color:var(--tx3);border-bottom:2px solid transparent}
.tab-btn.active{color:var(--tx);border-bottom-color:#378ADD}
.sidebar-body{flex:1;overflow-y:auto}
.group-label{font-size:11px;color:var(--tx3);padding:12px 18px 5px;letter-spacing:.07em;text-transform:uppercase}
.route-item{display:flex;align-items:center;gap:8px;padding:8px 18px;cursor:pointer;border-left:2px solid transparent}
.route-item:hover{background:var(--bg)}
.route-item.active{background:var(--bg);border-left-color:#378ADD}
.route-path{font-size:13px;color:var(--tx2);font-family:monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1}
.route-item.active .route-path{color:var(--tx)}
.page-count{font-size:11px;background:#E6F1FB;color:#185FA5;padding:2px 6px;border-radius:3px;flex-shrink:0;cursor:default;position:relative}
.page-count::after{content:attr(data-tip);position:absolute;right:0;top:calc(100% + 4px);background:#1a1a1a;color:#fff;font-size:12px;padding:4px 8px;border-radius:4px;white-space:nowrap;display:none;z-index:10;font-family:sans-serif;pointer-events:none}
.page-count:hover::after{display:block}

/* 리사이즈 핸들 */
.resize-handle{width:4px;flex-shrink:0;cursor:col-resize;background:transparent;transition:background 0.15s;z-index:5}
.resize-handle:hover,.resize-handle.dragging{background:#378ADD}

/* 메인 */
.main{flex:1;overflow-y:auto;padding:32px 40px}
.empty{display:flex;align-items:center;justify-content:center;height:100%;color:var(--tx3);font-size:14px}
.panel{display:none}
.ep-header{margin-bottom:26px;padding-bottom:20px;border-bottom:0.5px solid var(--bd)}
.ep-title{display:flex;align-items:center;gap:12px;margin-bottom:10px;flex-wrap:wrap}
.path-text{font-size:22px;font-weight:500;font-family:monospace;color:var(--tx)}
.ep-desc{font-size:14px;color:var(--tx2);line-height:1.6}
.source-path{font-size:12px;color:var(--tx3);font-family:monospace;margin-top:6px}
.section{margin-top:26px}
.section-title{font-size:11px;font-weight:500;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:12px;padding-bottom:7px;border-bottom:0.5px solid var(--bd)}

/* 파라미터 테이블 — flex 기반 */
.param-row{display:flex;align-items:flex-start;padding:11px 0;border-bottom:0.5px solid var(--bd);font-size:13px;gap:0}
.param-row:last-child{border-bottom:none}
.param-name{font-family:monospace;font-size:13px;display:flex;align-items:center;gap:6px;flex-wrap:nowrap;width:160px;min-width:160px;flex-shrink:0}
.pill{font-size:11px;padding:2px 6px;border-radius:3px;font-family:sans-serif;flex-shrink:0}
.pill.req{background:#FCEBEB;color:#A32D2D}
.pill.opt{background:#F1EFE8;color:#5F5E5A}
.type-badge{font-family:monospace;font-size:12px;color:#185FA5;background:#E6F1FB;padding:3px 8px;border-radius:3px;word-break:break-word;display:inline-block;width:160px;min-width:160px;flex-shrink:0;margin-right:16px}
.param-desc{color:var(--tx2);line-height:1.6;font-size:13px;flex:1}
.param-empty{font-size:13px;color:var(--tx3);padding:8px 0}

/* 반환 */
.returns-box{background:var(--bg2);border-radius:8px;padding:16px 18px}
.returns-type{font-family:monospace;color:#185FA5;font-size:14px}
.returns-desc{color:var(--tx2);font-size:13px;margin-top:6px;line-height:1.6}

/* 사용처 */
.usage-tree{display:flex;flex-direction:column;gap:8px}
.usage-row-page{background:linear-gradient(135deg,#f0f7ff 0%,#e8f4e8 100%);border:1px solid rgba(55,138,221,0.2);border-radius:8px;padding:12px 16px;display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.usage-page-main{font-family:monospace;font-size:15px;font-weight:600;color:#0f5599;background:#dbeeff;padding:5px 14px;border-radius:6px;cursor:default;letter-spacing:-0.3px}
.usage-row-caller{background:var(--bg2);border-radius:6px;padding:9px 14px;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.usage-caller{font-family:monospace;font-size:13px;color:var(--tx2);font-weight:500}
.usage-via{font-size:11px;color:var(--tx3);font-family:monospace}

.tab-content{display:none}
.tab-content.active{display:block}

/* 검색 */
.search-wrap{padding:10px 18px;border-bottom:0.5px solid var(--bd);display:flex;align-items:center;gap:8px}
.search-wrap input{flex:1;padding:7px 10px;border:1px solid var(--bd);border-radius:6px;background:var(--bg);color:var(--tx);font-size:13px;outline:none}
.search-wrap input:focus{border-color:#378ADD}
.search-wrap kbd{font-size:11px;padding:2px 6px;border:1px solid var(--bd);border-radius:3px;color:var(--tx3);background:var(--bg)}

/* 메서드 필터 */
.method-filters{padding:8px 18px;border-bottom:0.5px solid var(--bd);display:flex;gap:4px;flex-wrap:wrap}
.method-btn{font-size:11px;padding:3px 8px;border-radius:4px;border:1px solid var(--bd);background:var(--bg);color:var(--tx3);cursor:pointer;font-family:monospace}
.method-btn.active{background:#E6F1FB;color:#185FA5;border-color:rgba(55,138,221,0.3)}

/* 통계 대시보드 */
.stats-dashboard{max-width:680px}
.stats-header h2{font-size:18px;font-weight:500;margin-bottom:4px}
.stats-header p{font-size:13px;color:var(--tx2);margin-bottom:24px}
.stats-section{margin-bottom:24px}
.stats-section-title{font-size:11px;font-weight:500;color:var(--tx3);text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px}
.stats-bar-row{display:flex;align-items:center;gap:10px;margin-bottom:6px;font-size:13px}
.stats-bar-label{width:60px;font-family:monospace;font-weight:500}
.stats-bar{flex:1;height:20px;background:var(--bg2);border-radius:4px;overflow:hidden}
.stats-bar-fill{height:100%;border-radius:4px;transition:width 0.3s}
.stats-bar-count{width:30px;text-align:right;color:var(--tx2);font-size:12px}
.orphan-item{font-family:monospace;font-size:12px;color:var(--tx2);padding:4px 0}
</style>
</head>
<body>
<div class="wrap">
  <div class="sidebar" id="sidebar">
    <div class="sidebar-header">
      <h1>${esc(projectName)}</h1>
      <p>생성: ${now}</p>
    </div>
    <div class="tabs">
      <button class="tab-btn active" id="tab-server" onclick="switchTab('server')">서버 라우트 (${serverEntries.length})</button>
      <button class="tab-btn" id="tab-client" onclick="switchTab('client')">클라이언트 호출 (${clientEntries.length})</button>
      <button class="tab-btn" id="tab-stats" onclick="switchTab('stats')">통계</button>
    </div>
    <div class="search-wrap">
      <input type="text" id="search-input" placeholder="API 검색… (경로, 함수명)" spellcheck="false" />
      <kbd>/</kbd>
    </div>
    <div class="method-filters" id="method-filters">
      <button class="method-btn active" data-method="ALL" onclick="toggleMethod('ALL')">ALL</button>
      <button class="method-btn" data-method="GET" onclick="toggleMethod('GET')">GET</button>
      <button class="method-btn" data-method="POST" onclick="toggleMethod('POST')">POST</button>
      <button class="method-btn" data-method="PUT" onclick="toggleMethod('PUT')">PUT</button>
      <button class="method-btn" data-method="DELETE" onclick="toggleMethod('DELETE')">DELETE</button>
      <button class="method-btn" data-method="PATCH" onclick="toggleMethod('PATCH')">PATCH</button>
    </div>
    <div class="sidebar-body">
      <div class="tab-content active" id="sidebar-server">${serverSidebar(serverEntries)}</div>
      <div class="tab-content" id="sidebar-client">${clientSidebar(clientEntries)}</div>
      <div class="tab-content" id="sidebar-stats"></div>
    </div>
  </div>
  <div class="resize-handle" id="resize-handle"></div>
  <div class="main" id="main">
    <div class="empty" id="empty-state">← 왼쪽에서 항목을 선택하세요</div>
    <div class="stats-dashboard" id="stats-panel" style="display:none"></div>
    ${serverPanels(serverEntries)}
    ${clientPanels(clientEntries)}
  </div>
</div>
<script>
let curTab='server',curIdx=-1;
let activeMethod='ALL';

/* ── 탭 전환 ── */
function switchTab(tab){
  curTab=tab;curIdx=-1;
  ['server','client','stats'].forEach(t=>{
    var btn=document.getElementById('tab-'+t);
    if(btn)btn.classList.toggle('active',t===tab);
    var sc=document.getElementById('sidebar-'+t);
    if(sc)sc.classList.toggle('active',t===tab);
  });
  document.querySelectorAll('.panel').forEach(p=>p.style.display='none');
  var statsPanel=document.getElementById('stats-panel');
  var emptyState=document.getElementById('empty-state');
  if(tab==='stats'){
    emptyState.style.display='none';
    statsPanel.style.display='block';
    renderStats();
  } else {
    statsPanel.style.display='none';
    emptyState.style.display='flex';
  }
}

/* ── 항목 선택 ── */
function select(tab,idx){
  document.querySelectorAll('.route-item').forEach(el=>el.classList.remove('active'));
  document.querySelectorAll('.panel').forEach(p=>p.style.display='none');
  document.getElementById('empty-state').style.display='none';
  document.getElementById('stats-panel').style.display='none';
  var prefix=tab==='server'?'s':'c';
  var panel=document.getElementById(prefix+'-panel-'+idx);
  if(panel)panel.style.display='block';
  var item=document.querySelector('.route-item[data-tab="'+tab+'"][data-index="'+idx+'"]');
  if(item){item.classList.add('active');item.scrollIntoView({block:'nearest'});}
  curTab=tab;curIdx=idx;
}

/* ── 검색 ── */
var searchInput=document.getElementById('search-input');
searchInput.addEventListener('input',function(){applyFilters();});

function applyFilters(){
  var q=searchInput.value.toLowerCase().trim();
  document.querySelectorAll('.route-item').forEach(function(el){
    var text=el.textContent.toLowerCase();
    var matchesSearch=!q||text.indexOf(q)!==-1;
    var matchesMethod=true;
    if(activeMethod!=='ALL'){
      var badge=el.querySelector('span[style]');
      matchesMethod=badge&&badge.textContent===activeMethod;
    }
    el.style.display=(matchesSearch&&matchesMethod)?'flex':'none';
  });
  // group labels: hide if all children hidden
  document.querySelectorAll('.group-label').forEach(function(label){
    var next=label.nextElementSibling;
    var anyVisible=false;
    while(next&&!next.classList.contains('group-label')){
      if(next.classList.contains('route-item')&&next.style.display!=='none')anyVisible=true;
      next=next.nextElementSibling;
    }
    label.style.display=anyVisible?'':'none';
  });
}

/* ── 메서드 필터 ── */
function toggleMethod(method){
  activeMethod=method;
  document.querySelectorAll('.method-btn').forEach(function(b){
    b.classList.toggle('active',b.getAttribute('data-method')===method);
  });
  applyFilters();
}

/* ── 키보드 단축키 ── */
document.addEventListener('keydown',function(e){
  if(e.key==='/'&&document.activeElement!==searchInput){
    e.preventDefault();searchInput.focus();
  }
  if(e.key==='Escape'){searchInput.blur();searchInput.value='';applyFilters();}
  if(e.key==='ArrowDown'||e.key==='ArrowUp'){
    e.preventDefault();
    var items=Array.from(document.querySelectorAll('.route-item[data-tab="'+curTab+'"]')).filter(function(el){return el.style.display!=='none';});
    if(!items.length)return;
    var ci=items.findIndex(function(el){return el.classList.contains('active');});
    var ni=e.key==='ArrowDown'?Math.min(ci+1,items.length-1):Math.max(ci-1,0);
    var t=items[ni].getAttribute('data-tab');
    var idx=parseInt(items[ni].getAttribute('data-index'),10);
    select(t,idx);
  }
});

/* ── 통계 대시보드 렌더링 ── */
function renderStats(){
  var sItems=document.querySelectorAll('.route-item[data-tab="server"]');
  var cItems=document.querySelectorAll('.route-item[data-tab="client"]');
  var methods={GET:0,POST:0,PUT:0,DELETE:0,PATCH:0};
  var groups={};

  function countItem(el,type){
    var badge=el.querySelector('span[style]');
    var m=badge?badge.textContent:'ALL';
    if(methods[m]!==undefined)methods[m]++;
    var groupEl=el.previousElementSibling;
    while(groupEl&&!groupEl.classList.contains('group-label'))groupEl=groupEl.previousElementSibling;
    var gName=groupEl?groupEl.textContent.trim():'기타';
    if(!groups[gName])groups[gName]={server:0,client:0};
    groups[gName][type]++;
  }

  sItems.forEach(function(el){countItem(el,'server');});
  cItems.forEach(function(el){countItem(el,'client');});

  var total=sItems.length+cItems.length;
  var maxMethod=Math.max.apply(null,Object.values(methods))||1;

  var html='<div class="stats-header"><h2>API 통계 대시보드</h2>';
  html+='<p>총 '+total+'개 엔드포인트 (서버 '+sItems.length+' / 클라이언트 '+cItems.length+')</p></div>';

  // 메서드 분포
  html+='<div class="stats-section"><div class="stats-section-title">HTTP 메서드 분포</div>';
  var mColors={GET:'#3B6D11',POST:'#185FA5',PUT:'#854F0B',DELETE:'#A32D2D',PATCH:'#993556'};
  var mBgs={GET:'#EAF3DE',POST:'#E6F1FB',PUT:'#FAEEDA',DELETE:'#FCEBEB',PATCH:'#FBEAF0'};
  Object.keys(methods).forEach(function(m){
    var c=methods[m];
    var pct=Math.round((c/maxMethod)*100);
    html+='<div class="stats-bar-row"><span class="stats-bar-label" style="color:'+mColors[m]+'">'+m+'</span>';
    html+='<div class="stats-bar"><div class="stats-bar-fill" style="width:'+pct+'%;background:'+mBgs[m]+';border:1px solid '+mColors[m]+'33"></div></div>';
    html+='<span class="stats-bar-count">'+c+'</span></div>';
  });
  html+='</div>';

  // 그룹별
  html+='<div class="stats-section"><div class="stats-section-title">그룹별 분포</div>';
  var gKeys=Object.keys(groups).sort();
  var maxG=Math.max.apply(null,gKeys.map(function(k){return groups[k].server+groups[k].client;}))||1;
  gKeys.forEach(function(k){
    var g=groups[k];var t=g.server+g.client;
    var pct=Math.round((t/maxG)*100);
    html+='<div class="stats-bar-row"><span class="stats-bar-label">'+k+'</span>';
    html+='<div class="stats-bar">';
    if(g.server>0){var sp=Math.round((g.server/maxG)*100);html+='<div class="stats-bar-fill" style="width:'+sp+'%;background:#E6F1FB;display:inline-block;float:left"></div>';}
    if(g.client>0){var cp=Math.round((g.client/maxG)*100);html+='<div class="stats-bar-fill" style="width:'+cp+'%;background:#FAEEDA;display:inline-block;float:left"></div>';}
    html+='</div><span class="stats-bar-count">'+t+'</span></div>';
  });
  html+='</div>';

  // 문서화 품질
  var panels=document.querySelectorAll('.panel');
  var noDesc=0;var noParams=0;
  panels.forEach(function(p){
    var desc=p.querySelector('.ep-desc');
    if(desc&&desc.textContent.indexOf('설명 없음')!==-1)noDesc++;
    var empty=p.querySelector('.param-empty');
    if(empty&&empty.textContent.indexOf('파라미터 없음')!==-1)noParams++;
  });
  html+='<div class="stats-section"><div class="stats-section-title">문서화 품질</div>';
  var docTotal=panels.length||1;
  var descPct=Math.round(((docTotal-noDesc)/docTotal)*100);
  var paramPct=Math.round(((docTotal-noParams)/docTotal)*100);
  html+='<div class="stats-bar-row"><span class="stats-bar-label">설명</span><div class="stats-bar"><div class="stats-bar-fill" style="width:'+descPct+'%;background:#EAF3DE;border:1px solid #3B6D1133"></div></div><span class="stats-bar-count">'+descPct+'%</span></div>';
  html+='<div class="stats-bar-row"><span class="stats-bar-label">파라미터</span><div class="stats-bar"><div class="stats-bar-fill" style="width:'+paramPct+'%;background:#E6F1FB;border:1px solid #185FA533"></div></div><span class="stats-bar-count">'+paramPct+'%</span></div>';
  if(noDesc>0)html+='<div class="orphan-item">⚠ 설명 누락: '+noDesc+'개 엔드포인트</div>';
  if(noParams>0)html+='<div class="orphan-item">⚠ 파라미터 미확인: '+noParams+'개 엔드포인트</div>';
  html+='</div>';

  document.getElementById('stats-panel').innerHTML=html;
}

/* ── 초기 로딩 ── */
window.onload=function(){
  var first=document.querySelector('.route-item[data-tab="server"]');
  if(first)select('server',0);
  else{
    var cfirst=document.querySelector('.route-item[data-tab="client"]');
    if(cfirst){switchTab('client');select('client',0);}
  }
};

/* ── 사이드바 리사이즈 ── */
var sidebar=document.getElementById('sidebar');
var handle=document.getElementById('resize-handle');
var isResizing=false;
handle.addEventListener('mousedown',function(e){
  isResizing=true;
  handle.classList.add('dragging');
  document.body.style.cursor='col-resize';
  document.body.style.userSelect='none';
  e.preventDefault();
});
document.addEventListener('mousemove',function(e){
  if(!isResizing)return;
  var newWidth=Math.min(Math.max(e.clientX,160),600);
  sidebar.style.width=newWidth+'px';
  sidebar.style.minWidth=newWidth+'px';
});
document.addEventListener('mouseup',function(){
  if(!isResizing)return;
  isResizing=false;
  handle.classList.remove('dragging');
  document.body.style.cursor='';
  document.body.style.userSelect='';
});
</script>
</body>
</html>`;
}