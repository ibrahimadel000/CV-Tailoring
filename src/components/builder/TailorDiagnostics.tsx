import { useState } from 'react';
import { diagnosticReport, type CompositionDiagnostics } from '@/services/composer/diagnostics';
export function TailorDiagnostics({diagnostics:d}:{diagnostics?:CompositionDiagnostics}) {
  const [copied,setCopied]=useState(false);
  if(!d)return null;
  const report=diagnosticReport(d);
  return <details className="tailor-review" data-testid="response-diagnostics"><summary>Response diagnostics · {d.omitted.length} omitted item(s)</summary>
    <p>Received from the model → forwarded to further validation. Forwarded does not mean factually verified, selected or saved. Blocked proposals and job coverage show later validation results.</p>
    <ul>{Object.entries(d.received).map(([key,count])=><li key={key}>{key}: {count} received → {d.forwarded[key as keyof typeof d.forwarded]} forwarded</li>)}</ul>
    {d.omitted.map((item,i)=><div className="tailor-change" key={i}><strong>{item.section} · row {item.row} · not applied</strong><ul>{item.issues.map((issue,n)=><li key={n}>{issue}</li>)}</ul>
      {!!Object.keys(item.content).length&&<details><summary>Omitted content — may include resume text</summary><p>Allowlisted display snapshot only; long text may be shortened. Cannot be selected or saved. Known key patterns are masked, but this is not a comprehensive secret scan. Review before sharing.</p>{Object.entries(item.content).map(([key,value])=><div key={key}><span>{key}</span><p dir="auto" style={{whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{value}</p></div>)}</details>}
    </div>)}
    <p>Diagnostics and omitted-content snapshots are temporary, not saved in a CV or usage log. Discarding or leaving the review removes them. The report below excludes those snapshots and includes only counts and validation issues.</p>
    <button type="button" className="secondary-button" onClick={()=>{void navigator.clipboard?.writeText(report).then(()=>setCopied(true)).catch(()=>setCopied(false));}}>Copy diagnostic report</button>
    {copied&&<span role="status"> Diagnostic report copied.</span>}
    <textarea readOnly aria-label="Diagnostic report — counts and issues only" value={report} rows={8}/>
  </details>;
}
