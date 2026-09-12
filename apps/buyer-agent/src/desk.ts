/**
 * Buyer Desk — the compliance desk's interface: one text box.
 *   NETWORK=hsk-testnet pnpm --filter buyer-agent desk   → http://localhost:4030
 * Runs the LLM buyer agent (agent.ts) as a child process and streams its log to the page over SSE.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { streamSSE } from 'hono/streaming';

const ROOT = path.resolve(import.meta.dirname, '../../..');
const PORT = Number(process.env.DESK_PORT || 4030);
const NETWORK = process.env.NETWORK || 'anvil';
const DEFAULT_LOT = (process.env.FARMER_URLS || 'http://localhost:4020,http://localhost:4022').split(',');
const strip = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
const REPORTS = path.join(ROOT, 'docs', 'reports');

const app = new Hono();
app.get('/', (c) => c.html(PAGE));
app.get('/demo', (c) => c.html(DEMO));
app.get('/config', (c) => c.json({ network: NETWORK, lot: DEFAULT_LOT }));
app.get('/reports/latest', (c) => {
  if (!fs.existsSync(REPORTS)) return c.text('', 404);
  const f = fs.readdirSync(REPORTS).filter((x) => x.endsWith('.md')).sort().at(-1);
  return f ? c.text(fs.readFileSync(path.join(REPORTS, f), 'utf8')) : c.text('', 404);
});
app.get('/run', (c) => {
  const instruction = c.req.query('q') || '';
  const lot = (c.req.query('lot') || DEFAULT_LOT.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
  const only = (c.req.query('only') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const before = fs.existsSync(REPORTS) ? new Set(fs.readdirSync(REPORTS)) : new Set<string>();
  return streamSSE(c, async (stream) => {
    const child = spawn('npx', ['tsx', 'src/agent.ts', instruction, ...lot], { cwd: path.join(ROOT, 'apps', 'buyer-agent'), env: { ...process.env, NETWORK, FORCE_COLOR: '0', ONLY_PROOFS: only.join(',') } });
    const send = (line: string) => stream.writeSSE({ event: 'log', data: JSON.stringify(strip(line)) });
    let buf = '';
    const onData = (d: Buffer) => { buf += d.toString(); const lines = buf.split('\n'); buf = lines.pop() || ''; lines.forEach((l) => send(l)); };
    child.stdout.on('data', onData); child.stderr.on('data', onData);
    await new Promise<void>((resolve) => child.on('close', () => resolve()));
    if (buf) await send(buf);
    const after = fs.existsSync(REPORTS) ? fs.readdirSync(REPORTS).filter((x) => !before.has(x)) : [];
    const report = after.length ? fs.readFileSync(path.join(REPORTS, after.sort().at(-1)!), 'utf8') : '';
    await stream.writeSSE({ event: 'done', data: JSON.stringify({ report }) });
  });
});

const PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Proof of Field · Buyer Desk</title>
<link rel="preconnect" href="https://fonts.googleapis.com"/><link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet"/>
<script src="https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min.js"></script>
<style>
:root{--bg:#fff;--panel:oklch(0.985 0.003 260);--line:oklch(0.91 0.006 260);--line-strong:oklch(0.82 0.01 260);--ink:oklch(0.2 0.02 260);--ink-2:oklch(0.42 0.02 260);--ink-3:oklch(0.56 0.015 260);--primary:oklch(0.38 0.14 262);--primary-hover:oklch(0.33 0.14 262);--ok:oklch(0.52 0.15 150);--ok-soft:oklch(0.95 0.05 150);--bad:oklch(0.55 0.19 27);--bad-soft:oklch(0.95 0.04 27);--mono:'JetBrains Mono',ui-monospace,Menlo,monospace}
*{box-sizing:border-box}body{margin:0;font:14px/1.45 Inter,system-ui,sans-serif;color:var(--ink);background:var(--panel)}
.top{display:flex;align-items:center;gap:10px;padding:14px 22px;background:var(--bg);border-bottom:1px solid var(--line)}
.logo{width:28px;height:28px;border-radius:7px;background:var(--primary);display:grid;place-items:center}.brand{font-weight:600}.brand small{display:block;font-weight:400;color:var(--ink-3);font-size:12px}
.chip{margin-left:auto;padding:4px 8px;border-radius:999px;border:1px solid var(--line-strong);font-size:12px;color:var(--ink-2)}
.wrap{max-width:1100px;margin:0 auto;padding:22px;display:grid;gap:18px}
.card{background:var(--bg);border:1px solid var(--line);border-radius:10px;padding:18px}
h2{margin:0 0 10px;font-size:13px;font-weight:600;color:var(--ink-2)}
textarea{width:100%;min-height:74px;resize:vertical;border:1px solid var(--line-strong);border-radius:6px;padding:10px 12px;font:15px/1.45 Inter,system-ui,sans-serif;color:var(--ink)}
textarea:focus{outline:2px solid var(--primary);outline-offset:1px;border-color:transparent}
.lot{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}.lot label{display:inline-flex;align-items:center;gap:7px;background:var(--panel);border:1px solid var(--line);border-radius:8px;padding:7px 11px;cursor:pointer;font-size:13.5px}.lot label b{font-weight:600}.lot label small{font-family:var(--mono);font-size:11px;color:var(--ink-3)}.lot input{margin:0;accent-color:var(--primary)}.lot .off{color:var(--bad);font-size:11px}
.lot-h{font-size:12.5px;color:var(--ink-3);margin-top:12px}
.sup{border:1px solid var(--line);border-radius:10px;padding:10px 12px;min-width:260px;flex:1}
.sup .sh{display:flex;align-items:center;gap:8px;font-weight:600}.sup .sh small{font-family:var(--mono);font-size:11px;color:var(--ink-3);font-weight:400}
.sup .props{display:flex;flex-direction:column;gap:5px;margin-top:8px;padding-left:2px}
.sup .pr{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-2);cursor:pointer}
.sup .pr input{margin:0;accent-color:var(--primary)}.sup .pr small{color:var(--ink-3);font-size:11.5px}
.sup .pill{font-size:10.5px;font-weight:600;letter-spacing:.04em;padding:1px 6px;border-radius:999px}
.sup .pill.ok{background:var(--ok-soft);color:var(--ok)}.sup .pill.bad{background:var(--bad-soft);color:var(--bad)}
.sup .off{color:var(--bad);font-size:11px}
.row{display:flex;gap:10px;align-items:center;margin-top:12px}
.btn{height:38px;padding:0 16px;border-radius:6px;border:1px solid transparent;background:var(--primary);color:#fff;font:500 14px Inter,system-ui,sans-serif;cursor:pointer}.btn:hover{background:var(--primary-hover)}.btn:disabled{opacity:.5;cursor:not-allowed}
.hint{color:var(--ink-3);font-size:12.5px}
.log{font-family:var(--mono);font-size:12.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;background:#0d0f14;color:#e6e6e6;border-radius:8px;padding:14px 16px;min-height:120px;max-height:460px;overflow:auto}
.log .t{color:#7dd3fc}.log .ok{color:#86efac}.log .bad{color:#fca5a5}.log .dim{color:#9aa0a6}.log .say{color:#fff}
.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}.stat{border:1px solid var(--line);border-radius:8px;padding:12px 14px}.stat b{display:block;font-size:22px;letter-spacing:-.02em}.stat span{color:var(--ink-3);font-size:12px}
.stat.ok b{color:var(--ok)}.stat.bad b{color:var(--bad)}
.report{font-size:14px;overflow-x:auto;word-break:break-word}.report h1{font-size:18px;margin:0 0 10px}.report h2{font-size:14px;color:var(--ink);margin:16px 0 6px}.report table{border-collapse:collapse;width:100%;font-size:12.5px;display:block;overflow-x:auto}.report td,.report th{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}.report code{font-family:var(--mono);font-size:12px;background:var(--panel);padding:1px 4px;border-radius:3px}
.tl{display:flex;flex-direction:column;gap:10px}
.ev{display:grid;grid-template-columns:34px 1fr;gap:12px;align-items:start;padding:12px 14px;border:1px solid var(--line);border-radius:10px;background:var(--bg);animation:in .25s cubic-bezier(.22,1,.36,1)}
@keyframes in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.ev .ic{width:34px;height:34px;border-radius:9px;display:grid;place-items:center;font-size:16px;background:var(--panel)}
.ev.buy .ic{background:oklch(0.95 0.03 262)}.ev.ok .ic{background:var(--ok-soft)}.ev.bad .ic{background:var(--bad-soft)}
.ev h4{margin:0 0 4px;font-size:14px;font-weight:600}.ev p{margin:0;color:var(--ink-2);font-size:13px}
.ev .why{margin-top:6px;font-size:13px;color:var(--ink);border-left:0;background:var(--panel);border-radius:6px;padding:8px 10px}
.ev.bad .why{background:var(--bad-soft)}
.rows{display:flex;flex-direction:column;gap:5px;margin-top:8px}
.row{display:flex;align-items:center;gap:8px;font-size:13px;color:var(--ink-2)}
.pill{font-size:11px;font-weight:600;letter-spacing:.04em;padding:2px 7px;border-radius:999px}
.pill.ok{background:var(--ok-soft);color:var(--ok)}.pill.bad{background:var(--bad-soft);color:var(--bad)}.pill.warn{background:oklch(0.95 0.05 70);color:oklch(0.5 0.14 70)}.pill.dim{background:var(--panel);color:var(--ink-3)}
.checks{display:flex;flex-direction:column;gap:4px;margin-top:8px}.checks div{font-size:12.5px;color:var(--ink-2)}.checks div::before{content:'✔ ';color:var(--ok)}
.say{color:var(--ink-2);font-size:13px;padding:2px 4px}
.raw-t{margin-top:12px;font-size:12.5px;color:var(--primary);background:none;border:0;cursor:pointer;padding:0}
.status{display:inline-flex;align-items:center;gap:8px;font-weight:500}.spin{width:14px;height:14px;border:2px solid var(--line-strong);border-top-color:var(--primary);border-radius:50%;animation:s .8s linear infinite}@keyframes s{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.spin{animation:none}}
</style></head><body>
<div class="top"><div class="logo"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12.5 6.5 3.5 14 12.5Z" fill="#fff"/></svg></div>
<div class="brand">Proof of Field<small>Buyer desk · supplier compliance, one sentence</small></div><div class="chip" id="chip">…</div></div>
<div class="wrap">
  <div class="card"><h2>Instruction to the buyer agent</h2>
    <textarea id="q">Verify these suppliers before we contract the harvest. Budget 30 USDT. Reject deforestation after 2020 or protected land.</textarea>
    <div class="lot-h">Suppliers and their properties (tick exactly what you want verified this run):</div>
    <div class="lot" id="lot"></div>
    <div class="row"><button class="btn" id="run">Run agent</button><span class="hint">Lists the suppliers, checks its own spending policy, buys and verifies each proof, writes the dossier. ~70 s.</span></div>
  </div>
  <div class="card" id="logcard" hidden><h2><span class="status" id="st"><span class="spin"></span>Agent working…</span></h2>
    <div class="tl" id="tl"></div>
    <button class="raw-t" id="rawt" type="button">Show raw agent log</button>
    <div class="log" id="log" hidden></div></div>
  <div class="card" id="repcard" hidden><h2>Compliance report</h2><div class="summary" id="sum"></div><div class="report" id="rep"></div></div>
</div>
<script>
const $=id=>document.getElementById(id);
fetch('/config').then(r=>r.json()).then(async c=>{$('chip').textContent=c.network;window.__lot=c.lot;
 const items=await Promise.all(c.lot.map(async u=>{try{const i=await fetch(u+'/',{signal:AbortSignal.timeout(3000)}).then(r=>r.json());const a=await fetch(u+'/attestations',{signal:AbortSignal.timeout(3000)}).then(r=>r.json());return {u,name:i.name||u,farmer:i.farmer,props:a};}catch{return {u,name:u,off:true,props:[]};}}));
 $('lot').innerHTML=items.map(i=>'<div class="sup" data-u="'+i.u+'"><label class="sh"><input type="checkbox" class="supcb" '+(i.off?'':'checked')+'/> '+i.name+' <small>'+(i.farmer?i.farmer.slice(0,6)+'…'+i.farmer.slice(-4):'')+'</small>'+(i.off?' <span class="off">offline</span>':'')+'</label><div class="props">'+
   (i.props.length?i.props.map(p=>'<label class="pr"><input type="checkbox" class="prcb" value="'+((p.attestation&&p.attestation.fieldId)||p.hash)+'" '+(i.off?'':'checked')+'/> '+(p.label||p.hash.slice(0,10))+(p.report&&p.report.areaHa?' <small>'+Math.round(p.report.areaHa).toLocaleString()+' ha</small>':'')+'</label>').join(''):'<span class="off">no proofs offered</span>')+'</div></div>').join('');
 document.querySelectorAll('.supcb').forEach(cb=>cb.addEventListener('change',e=>{e.target.closest('.sup').querySelectorAll('.prcb').forEach(x=>x.checked=e.target.checked);}));
 document.querySelectorAll('.prcb').forEach(cb=>cb.addEventListener('change',e=>{const sup=e.target.closest('.sup');sup.querySelector('.supcb').checked=[...sup.querySelectorAll('.prcb')].some(x=>x.checked);}));
});
function selectedProofs(){return [...document.querySelectorAll('#lot .prcb:checked')].map(i=>i.value);}
function selectedLot(){return [...document.querySelectorAll('#lot .sup')].filter(s=>s.querySelector('.prcb:checked')).map(s=>s.dataset.u);}
function cls(l){if(/^\\s*⚙/.test(l))return 't';if(/✔/.test(l))return 'ok';if(/✘|NON-COMPLIANT|UNKNOWN/.test(l))return 'bad';if(/^\\s{4,}/.test(l))return 'dim';return 'say';}

$('rawt').onclick=()=>{const h=$('log').hidden;$('log').hidden=!h;$('rawt').textContent=h?'Hide raw agent log':'Show raw agent log';};
let cur=null;
function ev(kind,icon,title,sub){const d=document.createElement('div');d.className='ev '+kind;d.innerHTML='<div class="ic">'+icon+'</div><div><h4></h4><p></p></div>';d.querySelector('h4').textContent=title;d.querySelector('p').textContent=sub||'';$('tl').appendChild(d);cur=d;d.scrollIntoView({block:'nearest'});return d;}
function body(){return cur.querySelector(':scope > div:last-child');}
function addRow(html){if(!cur)return;let r=cur.querySelector('.rows');if(!r){r=document.createElement('div');r.className='rows';body().appendChild(r);}const x=document.createElement('div');x.className='row';x.innerHTML=html;r.appendChild(x);}
function addCheck(t){if(!cur)return;let c=cur.querySelector('.checks');if(!c){c=document.createElement('div');c.className='checks';body().appendChild(c);}const x=document.createElement('div');x.textContent=t;c.appendChild(x);}
function addWhy(t){if(!cur)return;const w=document.createElement('div');w.className='why';w.textContent=t;body().appendChild(w);}
function esc(t){return t.replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));}
function short(u){return u.replace(/^https?:\\/\\//,'').replace(/\\/proof\\/(0x[0-9a-f]{8})[0-9a-f]*/i,'/proof/$1…');}
function handle(l){
  const t=l.trim(); if(!t) return; let m;
  if(/Buyer agent \\(|^operator:|^lot:/.test(t)) return;
  if(/list_lot/.test(t)&&/^\\S*\\s*list_lot/.test(t)){ev('','📋','Listed the suppliers’ proofs',t.replace(/^\\S*\\s*list_lot\\s*/,''));return;}
  if(/^\\S*\\s*policy_status/.test(t)){ev('','🔒','Read its own spending policy on-chain','');return;}
  if(/^\\S*\\s*registry_stats/.test(t)){ev('','🔗','Read the public registry',t.replace(/^\\S*\\s*registry_stats\\s*/,''));return;}
  if((m=t.match(/^\\S*\\s*buy_proof\\s+(\\S+)/))){ev('buy','🛒','Buying a proof over HTTP 402',short(m[1]));return;}
  if((m=t.match(/^\\S*\\s*skip_proof\\s+(\\S+)/))){ev('bad','✋','Refused',short(m[1]));return;}
  if(/^\\S*\\s*write_report/.test(t)){ev('ok','📄','Dossier written','Rendered below.');return;}
  if((m=t.match(/^(COMPLIANT|NON-COMPLIANT)\\s+(known|UNKNOWN)\\s+(CAR-CONFLICT\\s+)?(.*?)\\s{2,}(.*)$/))){
    const v=m[1]==='COMPLIANT'?'<span class="pill ok">compliant</span>':'<span class="pill bad">non-compliant</span>';
    const k=m[2]==='known'?'<span class="pill dim">onboarded</span>':'<span class="pill bad">unknown seller</span>';
    const c=m[3]?'<span class="pill warn">same CAR as another seller</span>':'';
    addRow(v+' '+k+' '+c+' <b>'+esc(m[4])+'</b> <span style="color:var(--ink-3)">'+esc(m[5])+'</span>');return;}
  if(/^remaining today/.test(t)){addRow('<span class="pill dim">policy</span> '+esc(t));return;}
  if((m=t.match(/^✔\\s*(.*)$/))){if(cur&&cur.classList.contains('buy'))addCheck(m[1]);return;}
  if((m=t.match(/^✘\\s*(.*)$/))){if(cur){cur.classList.add('bad');addWhy(m[1]);}return;}
  if(/^\\[\\d\\]/.test(t)) return;
  if(cur&&(cur.classList.contains('buy')||cur.classList.contains('bad'))&&!cur.querySelector('.why')){addWhy(t);return;}
  if(/^\\*\\*|^-\\s|^\\d\\.\\s|^#|^📊|^✔/.test(t)) return;
  const d=document.createElement('div');d.className='say';d.textContent=t;$('tl').appendChild(d);cur=null;
}
$('run').onclick=()=>{const q=$('q').value.trim();if(!q)return;const lot=selectedLot();if(!lot.length){alert('Tick at least one property');return;}$('run').disabled=true;$('logcard').hidden=false;$('repcard').hidden=true;$('log').textContent='';$('tl').innerHTML='';cur=null;$('st').innerHTML='<span class="spin"></span>Agent working…';
 const es=new EventSource('/run?q='+encodeURIComponent(q)+'&lot='+encodeURIComponent(lot.join(','))+'&only='+encodeURIComponent(selectedProofs().join(',')));
 es.addEventListener('log',e=>{const l=JSON.parse(e.data);if(!l.trim())return;const d=document.createElement('div');d.className=cls(l);d.textContent=l;$('log').appendChild(d);$('log').scrollTop=$('log').scrollHeight;try{handle(l);}catch(err){}});
 es.addEventListener('done',e=>{es.close();$('run').disabled=false;$('st').textContent='Done';const {report}=JSON.parse(e.data);
   const txt=$('log').textContent;const m=txt.match(/(\\d+) bought · (\\d+) skipped · ([\\d.]+) USDT spent/);
   if(m){$('sum').innerHTML='<div class="stat ok"><b>'+m[1]+'</b><span>proofs bought</span></div><div class="stat bad"><b>'+m[2]+'</b><span>refused, with reasons</span></div><div class="stat"><b>'+m[3]+' USDT</b><span>spent through the policy wallet</span></div>';}
   if(report){$('rep').innerHTML=marked.parse(report);$('repcard').hidden=false;$('repcard').scrollIntoView({behavior:'smooth'});}
 });
 es.onerror=()=>{es.close();$('run').disabled=false;$('st').textContent='Connection closed';};
};
</script></body></html>`;

const DEMO = `<!doctype html><html lang="en"><head><meta charset="utf-8"/><title>Proof of Field · Demo</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@500;600;700&display=swap" rel="stylesheet"/>
<style>
:root{--ink:oklch(0.2 0.02 260);--line:oklch(0.88 0.006 260);--primary:oklch(0.38 0.14 262);--ok:oklch(0.52 0.15 150)}
html,body{height:100%;margin:0;font-family:Inter,system-ui,sans-serif;background:#0d0f14}
.stage{display:grid;grid-template-columns:1.25fr 1fr;grid-template-rows:auto auto 1fr;height:100%;gap:0}
.top{grid-column:1/3;display:flex;align-items:center;gap:14px;padding:10px 18px;background:#fff;border-bottom:1px solid var(--line)}
.top .logo{width:26px;height:26px;border-radius:7px;background:var(--primary);display:grid;place-items:center}
.top .name{font-weight:700;color:var(--ink);font-size:15px}.top .name small{display:block;font-weight:500;color:#6b7080;font-size:11.5px}
.steps{margin-left:auto;display:flex;align-items:center;gap:8px}
.st{display:inline-flex;align-items:center;gap:7px;font-size:12.5px;font-weight:600;color:var(--ink);background:#f3f4f8;border:1px solid var(--line);border-radius:999px;padding:5px 11px 5px 6px}
.st i{width:18px;height:18px;border-radius:50%;background:var(--primary);color:#fff;font-style:normal;font-size:11px;display:grid;place-items:center}
.st.ok i{background:var(--ok)}
.arrow{color:#9aa0a6}
.net{font-size:11.5px;color:#6b7080;border:1px solid var(--line);border-radius:999px;padding:4px 9px;display:inline-flex;align-items:center;gap:6px}.net b{width:7px;height:7px;border-radius:50%;background:var(--ok);display:inline-block}
.hdr{display:flex;align-items:center;gap:12px;padding:8px 16px;color:#fff;font-weight:600;font-size:14px;background:#141722}
.hdr .tag{font-size:11px;letter-spacing:.12em;padding:3px 8px;border-radius:999px;font-weight:700}
.hdr.farm .tag{background:var(--ok);color:#fff}.hdr.trader .tag{background:var(--primary);color:#fff}
.hdr small{color:#9aa0a6;font-weight:500}
.hdr.farm{border-right:1px solid #2a2f3a}
iframe{border:0;width:100%;height:100%;background:#fff}
.pane{position:relative;min-height:0}.pane.farm{border-right:1px solid #2a2f3a}
.step{position:absolute;top:10px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;font-size:13px;padding:6px 12px;border-radius:999px;opacity:.92;pointer-events:none}
</style></head><body><div class="stage">
<div class="top"><div class="logo"><svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M2 12.5 6.5 3.5 14 12.5Z" fill="#fff"/></svg></div>
<div class="name">Proof of Field<small>Deforestation-free proofs, signed once by the farm, bought and verified by the buyer's agent</small></div>
<div class="steps"><span class="st ok"><i>1</i>Farm signs once</span><span class="arrow">→</span><span class="st"><i>2</i>Trader's agent verifies &amp; pays</span><span class="arrow">→</span><span class="st ok"><i>3</i>Farm is paid</span><span class="net"><b></b>HashKey Chain testnet</span></div></div>
<div class="hdr farm"><span class="tag">FARM</span>Farmer console <small>· picks the property, signs once · dropdown switches farmer</small></div>
<div class="hdr trader"><span class="tag">TRADER</span>Compliance desk <small>· one sentence, the agent does the rest</small></div>
<div class="pane farm"><iframe src="http://localhost:5173" title="Farmer console"></iframe></div>
<div class="pane"><iframe src="http://localhost:4030" title="Buyer desk"></iframe></div>
</div></body></html>`;

serve({ fetch: app.fetch, port: PORT }, () => console.log(`[desk] buyer desk on http://localhost:${PORT} · network ${NETWORK} · lot ${DEFAULT_LOT.join(', ')}`));
