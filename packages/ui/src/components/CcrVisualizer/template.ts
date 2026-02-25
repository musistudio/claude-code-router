// CSS and JS string constants for the self-contained HTML output.
// These are verbatim strings — no logic here, just content.

export const VISUALIZER_CSS: string = `/* ---- Theme ---- */
:root {
  --bg: #f1f5f9; --card-bg: #fff; --card-hdr: #f8fafc;
  --border: #e2e8f0; --text: #0f172a; --text-muted: #64748b; --text-dim: #94a3b8;
  --accent: #2563eb; --hover: #f8fafc;
  --green: #16a34a; --red: #dc2626; --amber: #d97706; --purple: #7c3aed; --blue: #2563eb;
  --tok-in: #2563eb; --tok-out: #16a34a;
  --sc-think-bg: #f5f3ff; --sc-think-c: #7c3aed;
  --sc-background-bg: #eff6ff; --sc-background-c: #1d4ed8;
  --sc-longContext-bg: #fff7ed; --sc-longContext-c: #c2410c;
  --sc-webSearch-bg: #f0fdf4; --sc-webSearch-c: #15803d;
  --sc-default-bg: #f1f5f9; --sc-default-c: #475569;
  --sc-thinking-bg: #fdf2f8; --sc-thinking-c: #9d174d;
  --sc-injected-bg: #fefce8; --sc-injected-c: #854d0e;
  --ev-incoming: #2563eb; --ev-body: #7c3aed; --ev-routing: #8b5cf6;
  --ev-final: #059669; --ev-fallback: #d97706; --ev-error: #dc2626; --ev-completed: #16a34a;
  --fb-ok-bg: #f0fdf4; --fb-ok-c: #166534; --fb-ok-b: #bbf7d0;
  --fb-err-bg: #fef2f2; --fb-err-c: #991b1b; --fb-err-b: #fecaca;
  --fb-pend-bg: #f8fafc; --fb-pend-c: #475569; --fb-pend-b: #e2e8f0;
  --pg-arms-bg: #f5f3ff; --pg-arms-b: #ddd6fe;
  --pg-fork-bg:#f5f3ff; --pg-fork-c:#6d28d9; --pg-fork-b:#c4b5fd;
  --pg-branch-bg:#eff6ff; --pg-branch-c:#1d4ed8; --pg-branch-b:#bfdbfe;
  --pg-join-bg:#fdf2f8; --pg-join-c:#9d174d; --pg-join-b:#fbcfe8;
  --code-bg: #f8fafc; --code-c: #1e293b;
  --sec-req-c: #2563eb; --sec-resp-c: #16a34a;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f172a; --card-bg: #1e293b; --card-hdr: #172032;
    --border: #334155; --text: #f1f5f9; --text-muted: #94a3b8; --text-dim: #475569;
    --accent: #3b82f6; --hover: #1a2744;
    --green: #22c55e; --red: #ef4444; --amber: #f59e0b; --purple: #a78bfa; --blue: #3b82f6;
    --tok-in: #60a5fa; --tok-out: #4ade80;
    --sc-think-bg: #3b1f6e; --sc-think-c: #c4b5fd;
    --sc-background-bg: #1e3a5f; --sc-background-c: #93c5fd;
    --sc-longContext-bg: #5c2a0e; --sc-longContext-c: #fdba74;
    --sc-webSearch-bg: #1a3e2a; --sc-webSearch-c: #86efac;
    --sc-default-bg: #1e293b; --sc-default-c: #94a3b8;
    --sc-thinking-bg: #4a1a2a; --sc-thinking-c: #f9a8d4;
    --sc-injected-bg: #3a2e0a; --sc-injected-c: #fde68a;
    --ev-incoming: #60a5fa; --ev-body: #a78bfa; --ev-routing: #c4b5fd;
    --ev-final: #34d399; --ev-fallback: #fbbf24; --ev-error: #f87171; --ev-completed: #4ade80;
    --fb-ok-bg: #052e16; --fb-ok-c: #86efac; --fb-ok-b: #166534;
    --fb-err-bg: #2d0a0a; --fb-err-c: #fca5a5; --fb-err-b: #7f1d1d;
    --fb-pend-bg: #1e293b; --fb-pend-c: #94a3b8; --fb-pend-b: #334155;
    --pg-arms-bg: #1e1a3a; --pg-arms-b: #3730a3;
    --pg-fork-bg:#2d1f4e; --pg-fork-c:#c4b5fd; --pg-fork-b:#4c1d95;
    --pg-branch-bg:#1e3a5f; --pg-branch-c:#93c5fd; --pg-branch-b:#1e40af;
    --pg-join-bg:#3a1a2a; --pg-join-c:#f9a8d4; --pg-join-b:#9d174d;
    --code-bg: #0f172a; --code-c: #cbd5e1;
    --sec-req-c: #3b82f6; --sec-resp-c: #22c55e;
  }
}

/* ---- Reset & Base ---- */
*{box-sizing:border-box;margin:0;padding:0}
body{font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;font-size:14px;line-height:1.5;background:var(--bg);color:var(--text)}
.page-wrap{max-width:1080px;margin:0 auto;padding:24px 32px}
a{color:var(--accent)}

/* ---- Stats ---- */
.stats-row{display:flex;flex-wrap:wrap;gap:10px;margin-bottom:16px}
.stat-box{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;padding:14px 20px;flex:1;min-width:110px;text-align:center}
.stat-n{font-size:26px;font-weight:800;color:var(--text);letter-spacing:-.02em;line-height:1.1}
.stat-n-ok{color:var(--green)}
.stat-n-warn{color:var(--amber)}
.stat-n-blue{color:var(--tok-in)}
.stat-n-grn{color:var(--tok-out)}
.stat-sub{font-size:12px;color:var(--text-muted)}
.stat-lbl{font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;font-weight:700;margin-top:3px}

/* ---- Section cards ---- */
.section-card{background:var(--card-bg);border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:14px}
.section-hdr{padding:10px 14px;display:flex;justify-content:space-between;align-items:center;cursor:pointer;background:var(--card-hdr);font-size:13px;font-weight:700;color:var(--text-muted)}
.section-hdr:hover{background:var(--hover)}
.section-body-pad{padding:14px 16px}
.what-happened p{margin-bottom:6px;font-size:13px;color:var(--text)}
.what-happened p:last-child{margin-bottom:0}

/* ---- Cost table ---- */
.ct-note{font-size:11px;color:var(--text-dim);padding:8px 12px 0}
.cost-table{width:100%;border-collapse:collapse;font-size:12px;margin-top:6px}
.cost-table th{padding:6px 10px;text-align:inherit;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.05em;background:var(--card-hdr);border-bottom:1px solid var(--border)}
.cost-table td{padding:6px 10px;border-bottom:1px solid var(--border)}
.cost-table tr:last-child td{border-bottom:none}
.cost-table tbody tr:hover td{background:var(--hover)}
.ct-l{text-align:left}.ct-r{text-align:right}.ct-c{text-align:center}
.ct-total td{border-top:2px solid var(--border)!important}
.grand-cost{color:var(--accent)}
.mono{font-family:ui-monospace,SFMono-Regular,monospace}
.free-tag{font-size:10px;color:var(--green);margin-left:4px;font-weight:700}
.fetching-tag{font-size:10px;color:var(--amber);margin-left:4px;font-style:italic}
.free-cost{color:var(--green)}
.pi{background:var(--card-hdr);border:1px solid var(--border);border-radius:4px;color:var(--text);padding:2px 5px;font-size:11px;font-family:ui-monospace,monospace;width:62px;text-align:right}
.pi:focus{outline:none;border-color:var(--accent)}

/* ---- Timeline ---- */
.timeline-wrap{margin-bottom:14px;border:1px solid var(--border);border-radius:8px;overflow:hidden}
.timeline-hdr{padding:10px 14px;display:flex;justify-content:space-between;align-items:center;background:var(--card-hdr)}
.timeline-hdr-l{font-size:13px;font-weight:700;color:var(--text-muted)}
.tl-btn{padding:4px 10px;border:1px solid var(--border);border-radius:6px;background:var(--card-bg);color:var(--text-muted);font-size:11px;cursor:pointer}
.tl-btn:hover{background:var(--hover);color:var(--text)}
.timeline-body{padding:12px 14px;background:var(--card-bg)}

/* ---- Filter ---- */
.filter-row{margin-bottom:12px;display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.f-lbl{font-size:10px;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;font-weight:700}
.f-btn{padding:4px 12px;border-radius:6px;border:1px solid var(--border);background:var(--card-bg);color:var(--text-muted);cursor:pointer;font-size:12px}
.f-btn.active{background:var(--accent);color:#fff;border-color:var(--accent)}
.f-btn:hover:not(.active){background:var(--hover);color:var(--text)}
.f-err{border-color:#fecaca;color:var(--red)}
.f-err.active{background:var(--red);border-color:var(--red);color:#fff}

/* ---- Request cards ---- */
.req-card{border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:8px}
.req-row{display:flex;align-items:center;gap:8px;padding:11px 14px;background:var(--card-bg);cursor:pointer;flex-wrap:wrap}
.req-row:hover{background:var(--hover)}
.rn{font-size:12px;color:var(--text-dim);font-weight:700;min-width:26px}
.rm{flex:1;font-size:13px;color:var(--text);font-family:ui-monospace,SFMono-Regular,monospace;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.rs{font-size:13px;font-weight:700;flex-shrink:0}
.rs-ok{color:var(--green)}.rs-err{color:var(--red)}.rs-warn{color:var(--amber)}.rs-dim{color:var(--text-dim)}
.rt{font-size:12px;color:var(--text-muted);min-width:56px;text-align:right;flex-shrink:0}
.req-body{border-top:1px solid var(--border)}

/* ---- Metadata lines ---- */
.meta-line{padding:8px 14px;font-size:12px;color:var(--text);border-bottom:1px solid var(--border);background:var(--card-hdr);line-height:1.8}
.tok-line{padding:6px 14px;font-size:12px;color:var(--text);border-bottom:1px solid var(--border);background:var(--card-hdr)}
.mk{color:var(--text-muted);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.04em;margin-right:3px}
.tok-in{color:var(--tok-in);font-weight:700}
.tok-out{color:var(--tok-out);font-weight:700}

/* ---- Section blocks (REQUEST/RESPONSE) ---- */
.sec-block{border-left:3px solid var(--border);margin:10px 14px 6px}
.sec-req{border-left-color:var(--sec-req-c)}
.sec-resp{border-left-color:var(--sec-resp-c)}
.sec-hdr{padding:6px 10px;font-size:12px;font-weight:700;cursor:default}
.sec-req .sec-hdr{color:var(--sec-req-c)}
.sec-resp .sec-hdr{color:var(--sec-resp-c)}
.sec-d{font-weight:400;color:var(--text-muted);font-size:11px}
.sec-body{padding:2px 10px 8px}

/* ---- Sub items ---- */
.sub-item{margin-bottom:2px}
.sub-row{display:flex;align-items:baseline;gap:5px;padding:3px 0;cursor:pointer;font-size:13px;color:var(--text-muted)}
.sub-row:hover{color:var(--text)}
.no-toggle{cursor:default}
.sub-arr{font-size:9px;flex-shrink:0;color:var(--text-dim)}
.sub-hdr{flex:1}
.sd{font-weight:400;color:var(--text-dim);font-size:11px}
.sub-body{padding:4px 0 4px 14px}

/* ---- Code blocks ---- */
.cb{background:var(--code-bg);border:1px solid var(--border);border-radius:5px;padding:7px 10px;font-size:12px;white-space:pre-wrap;word-break:break-word;font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,monospace;color:var(--code-c);margin:4px 0}
.sm-cb{font-size:11px}
.cb-trunc{color:var(--text-dim);font-style:italic}
.view-full-btn{display:inline-block;margin-top:4px;padding:3px 9px;border:1px solid var(--border);border-radius:5px;background:var(--card-hdr);color:var(--accent);font-size:11px;cursor:pointer;text-decoration:none}
.view-full-btn:hover{background:var(--hover);text-decoration:underline}
.purple-cb{color:var(--purple)}.err-cb{color:var(--red)}
.err-block{margin:4px 0}.err-label{font-size:12px;font-weight:600;color:var(--red);margin-bottom:4px}
.chip-row{display:flex;flex-wrap:wrap;gap:4px;padding:4px 0}
.chip{display:inline-block;padding:2px 7px;background:var(--card-hdr);border:1px solid var(--border);border-radius:4px;font-size:11px;color:var(--text-muted)}
.inj-item{margin-bottom:6px}
.dim-text{color:var(--text-dim)}

/* ---- Tool calls (response) ---- */
.tc-item{margin-bottom:8px}
.tc-name{font-size:12px;font-weight:700;color:var(--blue);display:block;margin-bottom:3px}

/* ---- Tool definitions (request) ---- */
.tool-defs-list{padding:2px 0}
.tool-def-name{font-size:13px;font-weight:700;color:var(--blue)}
.tool-def-desc{font-size:12px;color:var(--text-muted)}
.tool-full-desc{font-size:12px;color:var(--text);margin-bottom:8px;line-height:1.6;padding:4px 0}
.param-table{width:100%;border-collapse:collapse;font-size:12px;margin:4px 0 8px}
.param-table th{padding:4px 8px;text-align:left;font-size:10px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:.04em;border-bottom:1px solid var(--border);background:var(--card-hdr)}
.param-table td{padding:4px 8px;border-bottom:1px solid var(--border);vertical-align:top}
.param-table tr:last-child td{border-bottom:none}
.param-name{font-family:ui-monospace,SFMono-Regular,monospace;font-weight:700;color:var(--text);white-space:nowrap}
.param-type{font-family:ui-monospace,SFMono-Regular,monospace;font-size:11px;color:var(--purple);white-space:nowrap}
.param-desc{color:var(--text-muted)}
.param-req{font-size:10px;font-weight:700;color:var(--amber);white-space:nowrap}
.param-opt{font-size:10px;color:var(--text-dim);white-space:nowrap}

/* ---- Scrollable text previews ---- */
.text-scroll-wrap{max-height:320px;overflow-y:auto;border-radius:5px}
.text-preview{max-height:none;overflow:visible}

/* ---- Conversation ---- */
.conv-scroll{max-height:280px;overflow-y:auto}
.conv-msg{margin-bottom:10px}
.conv-role{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;display:block;margin-bottom:3px}
.role-user{color:var(--blue)}.role-asst{color:var(--purple)}
.conv-blocks{padding-left:8px;border-left:2px solid var(--border)}
.conv-text{font-size:12px;color:var(--text);white-space:pre-wrap;margin-bottom:3px}
.conv-think{font-size:12px;color:var(--purple);font-style:italic;margin-bottom:3px}
.conv-tool{background:var(--card-hdr);border:1px solid var(--border);border-radius:4px;padding:5px 8px;margin-bottom:3px}
.tool-name{font-size:12px;color:var(--blue);display:block;margin-bottom:2px}
.tool-input{font-size:11px;color:var(--text-muted)}
.conv-result{font-size:12px;background:var(--card-hdr);border:1px solid var(--border);border-radius:4px;padding:4px 8px;margin-bottom:3px}
.result-ok{color:var(--green)}
.conv-image{font-size:12px;background:var(--card-hdr);border:1px solid var(--border);border-radius:4px;padding:4px 8px;margin-bottom:3px}

/* ---- Fallback chain ---- */
.fb-chain{display:flex;flex-wrap:wrap;gap:8px;padding:8px 14px}
.fb-node{border-radius:6px;padding:6px 12px;font-size:12px;border:1px solid}
.fb-ok{background:var(--fb-ok-bg);color:var(--fb-ok-c);border-color:var(--fb-ok-b)}
.fb-err{background:var(--fb-err-bg);color:var(--fb-err-c);border-color:var(--fb-err-b)}
.fb-pend{background:var(--fb-pend-bg);color:var(--fb-pend-c);border-color:var(--fb-pend-b)}
.fb-st{opacity:.7;margin-left:2px}
.fb-err-body{font-size:11px;margin-top:3px;opacity:.75;font-family:ui-monospace,monospace}

/* ---- Event timeline ---- */
.ev-section{padding:8px 14px 10px;border-top:1px solid var(--border)}
.ev-label{font-size:10px;font-weight:700;color:var(--text-dim);text-transform:uppercase;letter-spacing:.06em;margin-bottom:5px}
.ev-list{border-left:2px solid var(--border);padding-left:10px}
.ev-row{display:flex;align-items:baseline;gap:10px;margin-bottom:3px;font-size:12px}
.ev-time{font-family:ui-monospace,monospace;color:var(--text-dim);min-width:100px;flex-shrink:0}
.ev-type{font-family:ui-monospace,monospace;min-width:96px;flex-shrink:0;font-weight:600;font-size:11px}
.ev-detail{color:var(--text-muted);word-break:break-all}
.ev-incoming{color:var(--ev-incoming)}.ev-body{color:var(--ev-body)}.ev-routing{color:var(--ev-routing)}
.ev-final{color:var(--ev-final)}.ev-fallback{color:var(--ev-fallback)}.ev-error{color:var(--ev-error)}.ev-completed{color:var(--ev-completed)}.ev-other{color:var(--text-dim)}

/* ---- Badges ---- */
.badge{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:700;letter-spacing:.02em}
.sc-think{background:var(--sc-think-bg);color:var(--sc-think-c)}
.sc-background{background:var(--sc-background-bg);color:var(--sc-background-c)}
.sc-longContext{background:var(--sc-longContext-bg);color:var(--sc-longContext-c)}
.sc-webSearch{background:var(--sc-webSearch-bg);color:var(--sc-webSearch-c)}
.sc-default{background:var(--sc-default-bg);color:var(--sc-default-c)}
.sc-thinking{background:var(--sc-thinking-bg);color:var(--sc-thinking-c)}
.sc-injected{background:var(--sc-injected-bg);color:var(--sc-injected-c)}
.pg-fork{background:var(--pg-fork-bg);color:var(--pg-fork-c);border:1px solid var(--pg-fork-b)}
.pg-branch{background:var(--pg-branch-bg);color:var(--pg-branch-c);border:1px solid var(--pg-branch-b)}
.pg-join{background:var(--pg-join-bg);color:var(--pg-join-c);border:1px solid var(--pg-join-b)}

/* ---- Chevron ---- */
.chevron{display:inline-block;transition:transform .2s;color:var(--text-dim);font-size:10px;flex-shrink:0}
.chevron.open{transform:rotate(180deg)}

/* ---- Parallel group visual container ---- */
/* A vertical connector line runs through the gap between fork, arms, and join */
.pg-group{position:relative;margin-bottom:12px}
.pg-group::before{content:'';position:absolute;left:calc(50% - 1px);top:0;bottom:0;width:1px;background:var(--pg-arms-b);pointer-events:none;z-index:0}
.pg-group .req-card{margin-bottom:6px;position:relative;z-index:1}
.pg-group .pg-arms{position:relative;z-index:1;margin-bottom:6px}

/* ---- Parallel group arms ---- */
.pg-arms{display:flex;gap:0;border:1px solid var(--pg-arms-b);border-radius:8px;overflow:hidden;background:var(--pg-arms-bg)}
.pg-col{padding:10px 12px;min-width:0;flex:1}
/* Local tools: green left accent */
.pg-col-local{border-left:3px solid var(--green)}
/* Subagent: blue left accent, separated from local by a border */
.pg-col-subagent{border-left:3px solid var(--accent);border-left-width:1px;border-left-color:var(--pg-arms-b);box-shadow:inset 3px 0 0 var(--accent)}
.pg-col-hdr{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px;padding-bottom:6px;border-bottom:1px solid var(--pg-arms-b)}
.pg-col-local .pg-col-hdr{color:var(--green)}
.pg-col-subagent .pg-col-hdr{color:var(--accent)}
.local-tool-row{display:flex;align-items:baseline;gap:8px;margin-bottom:4px}
.local-tool-name{font-size:13px;font-weight:700;color:var(--text);flex-shrink:0}
.local-tool-detail{font-size:11px;color:var(--text-dim);font-family:ui-monospace,SFMono-Regular,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:220px}`;

export const VISUALIZER_JS: string = `function toggleCard(id){
  var b=document.getElementById(id),c=document.getElementById(id+'-chevron');
  if(!b)return;
  if(b.style.display==='none'){b.style.display='block';if(c)c.classList.add('open');}
  else{b.style.display='none';if(c)c.classList.remove('open');}
}
function toggleSection(id){
  var b=document.getElementById(id),c=document.getElementById(id+'-chevron');
  if(!b)return;
  if(b.style.display==='none'){b.style.display='block';if(c)c.classList.add('open');}
  else{b.style.display='none';if(c)c.classList.remove('open');}
}
function toggleSub(id){
  var b=document.getElementById(id),a=document.getElementById(id+'-arr');
  if(!b)return;
  if(b.style.display==='none'){b.style.display='block';if(a)a.innerHTML='&#9660;';}
  else{b.style.display='none';if(a)a.innerHTML='&#9658;';}
}
function toggleSec(id){
  var b=document.getElementById(id);if(!b)return;
  b.style.display=b.style.display==='none'?'block':'none';
}
var _tlOpen=false;
function toggleTimeline(){
  var b=document.getElementById('timeline-body'),btn=document.getElementById('tl-btn');
  if(!b)return;
  _tlOpen=!_tlOpen;
  b.style.display=_tlOpen?'block':'none';
  btn.innerHTML=_tlOpen?'Hide Timeline &#9650;':'Show Timeline &#9660;';
}
function filterCards(s,btn){
  document.querySelectorAll('.f-btn').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');
  document.querySelectorAll('.req-card').forEach(function(c){
    c.style.display=(s==='all'||c.dataset.scenario===s)?'':'none';
  });
}
function filterErrors(btn){
  document.querySelectorAll('.f-btn').forEach(function(b){b.classList.remove('active');});
  btn.classList.add('active');
  document.querySelectorAll('.req-card').forEach(function(c){
    c.style.display=c.dataset.status==='error'?'':'none';
  });
}
// Fetch OpenRouter prices for models not in default price table
(async function(){
  var costDiv=document.getElementById('cost-body');
  if(!costDiv||!costDiv.dataset.fetch)return;
  var models=costDiv.dataset.fetch.split(',').map(decodeURIComponent);
  try{
    var resp=await fetch('https://openrouter.ai/api/v1/models');
    if(!resp.ok)return;
    var data=await resp.json();
    var priceMap={};
    (data.data||[]).forEach(function(m){
      if(m.pricing){
        // OpenRouter prices are per-token strings, convert to $/M
        var pIn=parseFloat(m.pricing.prompt||'0')*1e6;
        var pOut=parseFloat(m.pricing.completion||'0')*1e6;
        priceMap[m.id]=[pIn,pOut];
      }
    });
    models.forEach(function(model){
      var rid='cr-'+model.replace(/[^a-zA-Z0-9]/g,'-');
      var prices=priceMap[model];
      if(!prices)return;
      var pinEl=document.getElementById(rid+'-pin');
      var poutEl=document.getElementById(rid+'-pout');
      if(pinEl&&prices[0]>0){pinEl.value=prices[0].toFixed(4);}
      if(poutEl&&prices[1]>0){poutEl.value=prices[1].toFixed(4);}
      // Remove the "fetching\u2026" tag
      var row=document.querySelector('tr[data-model="'+model+'"]');
      if(row){var ft=row.querySelector('.fetching-tag');if(ft)ft.remove();}
      recalcRow(rid);
    });
  }catch(e){
    // Silently ignore fetch errors - user can manually enter prices
    document.querySelectorAll('.fetching-tag').forEach(function(el){el.textContent='(enter manually)';});
  }
})();
function openFullFromData(btn){
  var text=btn.getAttribute('data-fulltext')||'';
  var title=btn.getAttribute('data-title')||'Full Text';
  openFullText(text,title);
}
function openFullText(text, title){
  var w=window.open('','_blank');
  if(!w)return;
  var e=function(s){return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');};
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>'+e(title||'Full Text')+'</title><style>body{font-family:ui-monospace,monospace;font-size:13px;line-height:1.6;padding:24px;background:#f8fafc;color:#0f172a;white-space:pre-wrap;word-break:break-word}@media(prefers-color-scheme:dark){body{background:#0f172a;color:#f1f5f9}}</style></head><body>'+e(text)+'</body></html>');
  w.document.close();
}
function recalcRow(rid){
  var d=document.getElementById(rid+'-data'),el=document.getElementById(rid+'-cost');
  if(!d||!el)return;
  var pIn=parseFloat((document.querySelector('.pi[data-row="'+rid+'"][data-type="in"]')||{}).value)||0;
  var pOut=parseFloat((document.querySelector('.pi[data-row="'+rid+'"][data-type="out"]')||{}).value)||0;
  var cost=(parseFloat(d.dataset.in||'0')*pIn+parseFloat(d.dataset.out||'0')*pOut)/1e6;
  el.textContent='$'+cost.toFixed(4);
  var grand=0;
  document.querySelectorAll('[id$="-cost"]:not(#grand-total-cost)').forEach(function(e){grand+=parseFloat(e.textContent.replace('$',''))||0;});
  var gt=document.getElementById('grand-total-cost');
  if(gt)gt.innerHTML='<strong>$'+grand.toFixed(4)+'</strong>';
}`;
