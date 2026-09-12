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
  const before = fs.existsSync(REPORTS) ? new Set(fs.readdirSync(REPORTS)) : new Set<string>();
  return streamSSE(c, async (stream) => {
    const child = spawn('npx', ['tsx', 'src/agent.ts', instruction, ...lot], { cwd: path.join(ROOT, 'apps', 'buyer-agent'), env: { ...process.env, NETWORK, FORCE_COLOR: '0' } });
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
.row{display:flex;gap:10px;align-items:center;margin-top:12px}
.btn{height:38px;padding:0 16px;border-radius:6px;border:1px solid transparent;background:var(--primary);color:#fff;font:500 14px Inter,system-ui,sans-serif;cursor:pointer}.btn:hover{background:var(--primary-hover)}.btn:disabled{opacity:.5;cursor:not-allowed}
.hint{color:var(--ink-3);font-size:12.5px}
.log{font-family:var(--mono);font-size:12.5px;line-height:1.55;white-space:pre-wrap;word-break:break-word;background:#0d0f14;color:#e6e6e6;border-radius:8px;padding:14px 16px;min-height:120px;max-height:460px;overflow:auto}
.log .t{color:#7dd3fc}.log .ok{color:#86efac}.log .bad{color:#fca5a5}.log .dim{color:#9aa0a6}.log .say{color:#fff}
.summary{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:14px}.stat{border:1px solid var(--line);border-radius:8px;padding:12px 14px}.stat b{display:block;font-size:22px;letter-spacing:-.02em}.stat span{color:var(--ink-3);font-size:12px}
.stat.ok b{color:var(--ok)}.stat.bad b{color:var(--bad)}
.report{font-size:14px}.report h1{font-size:18px;margin:0 0 10px}.report h2{font-size:14px;color:var(--ink);margin:16px 0 6px}.report table{border-collapse:collapse;width:100%;font-size:13px}.report td,.report th{border:1px solid var(--line);padding:6px 8px;text-align:left;vertical-align:top}.report code{font-family:var(--mono);font-size:12px;background:var(--panel);padding:1px 4px;border-radius:3px}
.status{display:inline-flex;align-items:center;gap:8px;font-weight:500}.spin{width:14px;height:14px;border:2px solid var(--line-strong);border-top-color:var(--primary);border-radius:50%;animation:s .8s linear infinite}@keyframes s{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.spin{animation:none}}
</style></head><body>
<div class="top"><div class="logo"><svg width="16" height="16" viewBox="0 0 16 16" fill="none"><path d="M2 12.5 6.5 3.5 14 12.5Z" fill="#fff"/></svg></div>
<div class="brand">Proof of Field<small>Buyer desk · supplier compliance, one sentence</small></div><div class="chip" id="chip">…</div></div>
<div class="wrap">
  <div class="card"><h2>Instruction to the buyer agent</h2>
    <textarea id="q">Verify these suppliers before we contract the harvest. Budget 30 USDT. Reject deforestation after 2020 or protected land.</textarea>
    <div class="lot-h">Suppliers to verify (onboarded agents; tick who you want checked this run):</div>
    <div class="lot" id="lot"></div>
    <div class="row"><button class="btn" id="run">Run agent</button><span class="hint">Lists the suppliers, checks its own spending policy, buys and verifies each proof, writes the dossier. ~70 s.</span></div>
  </div>
  <div class="card" id="logcard" hidden><h2><span class="status" id="st"><span class="spin"></span>Agent working…</span></h2><div class="log" id="log"></div></div>
  <div class="card" id="repcard" hidden><h2>Compliance report</h2><div class="summary" id="sum"></div><div class="report" id="rep"></div></div>
</div>
<script>
const $=id=>document.getElementById(id);
fetch('/config').then(r=>r.json()).then(async c=>{$('chip').textContent=c.network;window.__lot=c.lot;
 const items=await Promise.all(c.lot.map(async u=>{try{const i=await fetch(u+'/',{signal:AbortSignal.timeout(3000)}).then(r=>r.json());return {u,name:i.name||u,farmer:i.farmer,n:i.attestations};}catch{return {u,name:u,off:true};}}));
 $('lot').innerHTML=items.map(i=>'<label><input type="checkbox" value="'+i.u+'" '+(i.off?'':'checked')+'/> <b>'+i.name+'</b> <small>'+(i.farmer?i.farmer.slice(0,6)+'…'+i.farmer.slice(-4):i.u)+'</small>'+(i.off?' <span class="off">offline</span>':'')+'</label>').join('');});
function selectedLot(){return [...document.querySelectorAll('#lot input:checked')].map(i=>i.value);}
function cls(l){if(/^\\s*⚙/.test(l))return 't';if(/✔/.test(l))return 'ok';if(/✘|NON-COMPLIANT|UNKNOWN/.test(l))return 'bad';if(/^\\s{4,}/.test(l))return 'dim';return 'say';}
$('run').onclick=()=>{const q=$('q').value.trim();if(!q)return;const lot=selectedLot();if(!lot.length){alert('Tick at least one supplier');return;}$('run').disabled=true;$('logcard').hidden=false;$('repcard').hidden=true;$('log').textContent='';$('st').innerHTML='<span class="spin"></span>Agent working…';
 const es=new EventSource('/run?q='+encodeURIComponent(q)+'&lot='+encodeURIComponent(lot.join(',')));
 es.addEventListener('log',e=>{const l=JSON.parse(e.data);if(!l.trim())return;const d=document.createElement('div');d.className=cls(l);d.textContent=l;$('log').appendChild(d);$('log').scrollTop=$('log').scrollHeight;});
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
.stage{display:grid;grid-template-columns:1.25fr 1fr;grid-template-rows:auto 1fr;height:100%;gap:0}
.hdr{display:flex;align-items:center;gap:12px;padding:10px 18px;color:#fff;font-weight:600;font-size:15px;border-bottom:1px solid #2a2f3a}
.hdr .tag{font-size:11px;letter-spacing:.12em;padding:3px 8px;border-radius:999px;font-weight:700}
.hdr.farm .tag{background:var(--ok);color:#fff}.hdr.trader .tag{background:var(--primary);color:#fff}
.hdr small{color:#9aa0a6;font-weight:500}
.hdr.farm{border-right:1px solid #2a2f3a}
iframe{border:0;width:100%;height:100%;background:#fff}
.pane{position:relative;min-height:0}.pane.farm{border-right:1px solid #2a2f3a}
.step{position:absolute;top:10px;left:50%;transform:translateX(-50%);background:var(--ink);color:#fff;font-size:13px;padding:6px 12px;border-radius:999px;opacity:.92;pointer-events:none}
</style></head><body><div class="stage">
<div class="hdr farm"><span class="tag">FARM</span>Farmer console <small>· picks the property, signs once · switch farms with the dropdown</small></div>
<div class="hdr trader"><span class="tag">TRADER</span>Compliance desk <small>· one sentence, the agent does the rest</small></div>
<div class="pane farm"><iframe src="http://localhost:5173" title="Farmer console"></iframe></div>
<div class="pane"><iframe src="http://localhost:4030" title="Buyer desk"></iframe></div>
</div></body></html>`;

serve({ fetch: app.fetch, port: PORT }, () => console.log(`[desk] buyer desk on http://localhost:${PORT} · network ${NETWORK} · lot ${DEFAULT_LOT.join(', ')}`));
