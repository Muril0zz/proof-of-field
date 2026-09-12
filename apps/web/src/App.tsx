import { useCallback, useEffect, useMemo, useState } from 'react';
import * as turf from '@turf/turf';
import { MapView } from './components/MapView';
import { api, fmtHa, short, usdt, type AgentInfo, type Attestation, type Payment, type Report } from './lib/api';

interface Sample { id: string; label: string; car: string; areaHaCar: number; geometry: GeoJSON.Geometry }
type Phase = 'idle' | 'checking' | 'checked' | 'attesting' | 'attested';

export function App() {
  const [info, setInfo] = useState<AgentInfo | null>(null);
  const [offline, setOffline] = useState(false);
  const [prodes, setProdes] = useState<GeoJSON.FeatureCollection | null>(null);
  const [coverage, setCoverage] = useState<{ regions: string[]; polygons: number } | null>(null);
  const [samples, setSamples] = useState<Sample[]>([]);
  const [list, setList] = useState<Attestation[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [sales, setSales] = useState<{ payments: Payment[]; totalUnits: string }>({ payments: [], totalUnits: '0' });
  const [flash, setFlash] = useState<string | null>(null);

  const [drawing, setDrawing] = useState(false);
  const [showProdes, setShowProdes] = useState(false);
  const [field, setField] = useState<GeoJSON.Geometry | null>(null);
  const [label, setLabel] = useState<string>('');
  const [report, setReport] = useState<Report | null>(null);
  const [phase, setPhase] = useState<Phase>('idle');
  const [result, setResult] = useState<(Attestation & { proofUrl: string }) | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const say = (m: string) => { setToast(m); setTimeout(() => setToast(null), 2200); };
  const refresh = useCallback(() => api.list().then(setList).catch(() => {}), []);

  // poll the sales ledger so a buyer agent paying shows up live during the demo
  useEffect(() => {
    let known = -1;
    const tick = async () => {
      try {
        const s = await api.payments();
        setSales(s);
        if (known >= 0 && s.payments.length > known) { const p = s.payments[0]; setFlash(p.txHash); say(`Paid ${usdt(p.amount)} by ${short(p.payer, 4)} for ${p.label || short(p.attestationHash, 6)}`); setTimeout(() => setFlash(null), 4000); }
        known = s.payments.length;
      } catch {}
    };
    tick(); const id = setInterval(tick, 2500); return () => clearInterval(id);
  }, []);

  useEffect(() => {
    api.info().then((i) => { setInfo(i); setOffline(false); }).catch(() => setOffline(true));
    api.coverage().then(setCoverage).catch(() => {});
    fetch('/api/samples').then((r) => r.json()).then(setSamples).catch(() => {});
    refresh();
  }, [refresh]);

  const loadProdesAround = useCallback((g: GeoJSON.Geometry) => {
    const b = turf.bbox({ type: 'Feature', properties: {}, geometry: g } as any);
    const pad = Math.max(0.15, (b[2] - b[0]) * 1.5, (b[3] - b[1]) * 1.5);
    api.prodes([b[0] - pad, b[1] - pad, b[2] + pad, b[3] + pad]).then(setProdes).catch(() => {});
  }, []);

  const runCheck = useCallback(async (g: GeoJSON.Geometry, lbl: string) => {
    setSelected(null); setResult(null); setField(g); setLabel(lbl); setPhase('checking'); setReport(null);
    loadProdesAround(g);
    try { const r = await api.check(g); setReport(r); setPhase('checked'); }
    catch (e: any) { say(`Check failed: ${e.message}`); setPhase('idle'); }
  }, [loadProdesAround]);

  const onDrawn = useCallback((g: GeoJSON.Polygon) => { setDrawing(false); runCheck(g, `Field drawn ${new Date().toLocaleTimeString()}`); }, [runCheck]);

  const attest = async () => {
    if (!field) return;
    setPhase('attesting');
    try {
      const r = await api.attest(field, label);
      setResult(r); setReport({ ...r.report, intersections: r.intersections, compliant: r.compliant }); setPhase('attested'); refresh();
      say(r.txHash ? 'Attestation anchored on-chain' : 'Signed — anchoring failed (check farmer agent log)');
    } catch (e: any) { say(`Attest failed: ${e.message}`); setPhase('checked'); }
  };

  const openExisting = async (a: Attestation) => {
    setSelected(a.hash); setDrawing(false);
    try {
      const d = await api.privateDetail(a.hash);
      setField(d.geometry); setLabel(d.label || ''); loadProdesAround(d.geometry); setReport({ ...d.report, intersections: d.intersections, compliant: d.compliant });
      setResult({ ...d, proofUrl: `${location.origin.replace(/:\d+$/, ':4020')}/proof/${d.hash}` } as any); setPhase('attested');
    } catch (e: any) { say(e.message); }
  };

  const reset = () => { setField(null); setReport(null); setResult(null); setPhase('idle'); setSelected(null); };
  const intersections = useMemo(() => report?.intersections ?? null, [report]);
  const proofUrl = result?.proofUrl;

  return (
    <div className="app">
      <aside className="panel">
        <header className="panel-head">
          <div className="logo" aria-hidden><svg viewBox="0 0 16 16" fill="none"><path d="M2 12.5 6.5 3.5 14 12.5Z" fill="#fff" /></svg></div>
          <div className="brand">Proof of Field<small>Farmer console · data stays on this machine</small></div>
          <div className={`chip ${offline ? 'off' : ''}`} title={info ? `${info.farmer}\nregistry ${info.registry}` : 'farmer agent offline'}>
            <span className="dot" />{offline ? 'agent offline' : info ? `${info.network} · ${short(info.farmer, 4)}` : '…'}
          </div>
        </header>

        <div className="panel-body">
          <section className="section">
            <h2>Registered properties <span className="count">CAR · official polygons</span></h2>
            {samples.length > 0 && (
              <div className="samples">
                {samples.map((s) => (
                  <button key={s.id} className="sample" onClick={() => runCheck(s.geometry, s.label)} title={s.car}>
                    <div><div className="name">{s.label}</div><div className="meta">{s.car.slice(0, 19)}…</div></div>
                    <div className="ha">{fmtHa(s.areaHaCar)}</div>
                  </button>
                ))}
              </div>
            )}
            <div className="btn-row" style={{ marginTop: 10 }}>
              <button className="btn btn-secondary" aria-pressed={drawing} onClick={() => { reset(); setDrawing((d) => !d); }}>
                <svg width="15" height="15" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6"><path d="M3 4.5 8 2l5 3-1.5 7L5 13.5z" /><circle cx="3" cy="4.5" r="1.2" fill="currentColor" /><circle cx="13" cy="5" r="1.2" fill="currentColor" /><circle cx="5" cy="13.5" r="1.2" fill="currentColor" /></svg>
                {drawing ? 'Drawing… (Esc to cancel)' : 'Draw a sub-field'}
              </button>
              {field && <button className="btn btn-secondary" onClick={reset}>Clear</button>}
            </div>
            <div className="empty" style={{ marginTop: 6 }}>Compliance is attested on the registered property. Sub-fields are for lot traceability only and are marked unregistered.</div>
          </section>

          {(phase !== 'idle') && (
            <section className="section">
              <h2>Compliance check <span className="count">INPE / PRODES · baseline 2020</span></h2>
              {phase === 'checking' && <div className="steps"><div className="step doing"><span className="ic" />Intersecting with {coverage?.polygons.toLocaleString() ?? '…'} PRODES polygons</div></div>}
              {report && phase !== 'checking' && <Verdict report={report} label={label} />}
              {phase === 'checked' && report?.coverage?.covered !== false && (
                <>
                  <button className="btn btn-primary btn-block" style={{ marginTop: 14 }} onClick={attest}>Sign attestation &amp; anchor on-chain</button>
                  <div className="note">
                    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="7" width="10" height="7" rx="1.5" /><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" /></svg>
                    <span>Only a hash of this polygon and the verdict go on-chain. The geometry never leaves the farmer agent.</span>
                  </div>
                </>
              )}
              {phase === 'attesting' && (
                <div className="steps">
                  <div className="step done"><span className="ic">✓</span>Deforestation check</div>
                  <div className="step doing"><span className="ic" />Signing EIP-712 attestation &amp; anchoring on {info?.network ?? 'chain'}</div>
                </div>
              )}
              {phase === 'attested' && result && (
                <>
                  <dl className="kv" style={{ marginTop: 14 }}>
                    <dt>Attestation</dt><dd className="mono" title={result.hash}>{short(result.hash, 10)}</dd>
                    <dt>Signer</dt><dd className="mono">{short(result.farmer, 6)}</dd>
                    <dt>Anchor tx</dt><dd className="mono">{result.txHash ? (result.txUrl && !result.txUrl.startsWith('0x') ? <a href={result.txUrl} target="_blank" rel="noreferrer">{short(result.txHash, 8)} ↗</a> : short(result.txHash, 8)) : <span style={{ color: 'var(--bad)' }}>not anchored</span>}</dd>
                    <dt>Price</dt><dd>{usdt(result.priceUnits)}</dd>
                  </dl>
                  {proofUrl && (
                    <>
                      <div className="proof-url">
                        <input readOnly value={proofUrl} onFocus={(e) => e.currentTarget.select()} />
                        <button className="btn btn-secondary" onClick={() => { navigator.clipboard?.writeText(proofUrl); say('Proof URL copied — send it to the buyer agent'); }}>Copy</button>
                      </div>
                      <div className="note"><span>Buyers fetch this URL, get <code>402 Payment Required</code>, pay in USDT, and receive the signed proof. No human in the loop.</span></div>
                    </>
                  )}
                </>
              )}
            </section>
          )}

          <section className="section">
            <h2>Sales <span className="count">{sales.payments.length ? `${usdt(sales.totalUnits)} received` : 'no payments yet'}</span></h2>
            {sales.payments.length === 0 && <div className="empty">When a buyer agent pays for a proof, it appears here within seconds.</div>}
            {sales.payments.slice(0, 6).map((p) => (
              <div key={p.txHash} className={`sale ${flash === p.txHash ? 'flash' : ''}`}>
                <div className="amt">+{usdt(p.amount)}</div>
                <div><div className="l1">{p.label || short(p.attestationHash, 8)}</div><div className="l2">from {short(p.payer, 5)} · {new Date(p.at).toLocaleTimeString()}</div></div>
                {p.txUrl && !p.txUrl.startsWith('0x') ? <a className="l2" href={p.txUrl} target="_blank" rel="noreferrer">tx ↗</a> : <span className="l2 mono">{short(p.txHash, 4)}</span>}
              </div>
            ))}
          </section>

          <section className="section">
            <h2>Attestations <span className="count">{list.length}</span></h2>
            {list.length === 0 && <div className="empty">None yet. Draw a field or pick a registered property above.</div>}
            {[...list].reverse().map((a) => (
              <div key={a.hash} role="button" tabIndex={0} aria-selected={selected === a.hash} className={`att ${a.compliant ? 'ok' : 'bad'}`} onClick={() => openExisting(a)} onKeyDown={(e) => e.key === 'Enter' && openExisting(a)}>
                <span className="pip" />
                <div><div className="l1">{a.label || short(a.hash, 8)}</div><div className="l2">{new Date(a.createdAt).toLocaleString()} · {a.txHash ? 'anchored' : 'not anchored'}</div></div>
                <div className="right"><b>{a.compliant ? 'Compliant' : `${a.report.deforestedHa.toFixed(1)} ha`}</b>{fmtHa(a.report.areaHa)}</div>
              </div>
            ))}
          </section>
        </div>
      </aside>

      <main className="map-wrap">
        <MapView prodes={prodes} field={field} intersections={intersections} drawing={drawing} showProdes={showProdes} onDrawn={onDrawn} />
        {drawing && <div className="map-ui tl"><div className="hint">Click to place vertices · click the first point to close · <kbd>Esc</kbd> cancels</div></div>}
        <div className="map-ui bl">
          <div className="legend">
            <div><i style={{ background: 'rgba(59,63,182,.2)', border: '1.5px solid #3b3fb6' }} />Your field (private)</div>
            <div><i style={{ background: '#ff3b2f' }} />Deforestation after 2020 inside your field</div>
            <label className="toggle"><input type="checkbox" checked={showProdes} onChange={(e) => setShowProdes(e.target.checked)} /> Show PRODES around this field{prodes ? ` (${prodes.features.length.toLocaleString()} of ${coverage?.polygons.toLocaleString() ?? '…'})` : ''}</label>
            {coverage && coverage.regions.length > 0 && <div className="cov">Coverage: {coverage.regions.join(' · ')}</div>}
          </div>
        </div>
      </main>
      {toast && <div className="toast" role="status">{toast}</div>}
    </div>
  );
}

function Verdict({ report, label }: { report: Report; label: string }) {
  const ok = report.compliant ?? report.deforestedHa <= 0;
  if (report.coverage && !report.coverage.covered) {
    return (
      <div className="verdict bad">
        <div className="mark" aria-hidden><svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2"><path d="M8 3v6M8 12v.5" /></svg></div>
        <div>
          <div className="title">Outside data coverage</div>
          <div className="sub">{label} · {fmtHa(report.areaHa)} · this extract of PRODES covers only the Abunã region. No attestation can be issued: absence of data is not absence of deforestation.</div>
        </div>
      </div>
    );
  }
  const years = ['2021', '2022', '2023', '2024', '2025'];
  const max = Math.max(0.01, ...years.map((y) => report.byYear[y] || 0));
  return (
    <>
      <div className={`verdict ${ok ? 'ok' : 'bad'}`}>
        <div className="mark" aria-hidden>
          {ok ? <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2"><path d="M3 8.5 6.5 12 13 4.5" /></svg>
              : <svg width="18" height="18" viewBox="0 0 16 16" fill="none" stroke="#fff" strokeWidth="2"><path d="M8 3v6M8 12v.5" /></svg>}
        </div>
        <div>
          <div className="title">{ok ? 'Deforestation-free since 2020' : `${report.deforestedHa.toFixed(2)} ha deforested since 2020`}</div>
          <div className="sub">{label} · {fmtHa(report.areaHa)} · {report.hits} PRODES polygon{report.hits === 1 ? '' : 's'} intersected · {report.ms} ms</div>
        </div>
      </div>
      <div className="years" aria-label="Deforestation by year">
        {years.map((y) => { const v = report.byYear[y] || 0; return (
          <div key={y} className={`bar ${v ? '' : 'zero'}`} title={`${y}: ${v.toFixed(2)} ha`}><i style={{ height: `${Math.max(2, (v / max) * 30)}px` }} />{y}</div>
        ); })}
      </div>
    </>
  );
}
