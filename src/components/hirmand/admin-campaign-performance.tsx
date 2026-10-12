import { useCallback, useEffect, useMemo, useState } from "react";
import { BarChart3, CalendarRange, CheckCircle2, ClipboardCheck, PhoneCall, RefreshCw, Target, UsersRound } from "lucide-react";

type Row = { source:string; medium:string; campaign:string; leads:number; contacted:number; visits:number; contracts:number; contactRate:number; contractRate:number };
type Data = {
  days:7|30|90;
  rows:Row[];
  daily:Array<{day:string;leads:number;contracts:number}>;
  quality:{leads:number;source:number;medium:number;campaign:number};
  totals:{campaigns:number;leads:number;contacted:number;visits:number;contracts:number};
};
const fa=(value:number)=>value.toLocaleString("fa-IR");
const pct=(value:number)=>value.toLocaleString("fa-IR",{maximumFractionDigits:1})+"٪";

export function AdminCampaignPerformance(){
  const [days,setDays]=useState<7|30|90>(30);
  const [data,setData]=useState<Data|null>(null);
  const [loading,setLoading]=useState(true);

  const load=useCallback(async(range:7|30|90)=>{
    setLoading(true);
    try{
      const response=await fetch("/api/admin-campaign-performance",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({days:range})});
      const result=await response.json().catch(()=>null) as Data|{statusMessage?:string}|null;
      if(!response.ok)throw new Error(result&&"statusMessage" in result?result.statusMessage:"گزارش کمپین‌ها در دسترس نیست.");
      setData(result as Data);
    }catch{
      setData({days:range,rows:[],daily:[],quality:{leads:0,source:0,medium:0,campaign:0},totals:{campaigns:0,leads:0,contacted:0,visits:0,contracts:0}});
    }finally{setLoading(false);}
  },[]);

  useEffect(()=>{void load(days);},[days,load]);
  const maxDaily=useMemo(()=>Math.max(1,...(data?.daily.map((item)=>item.leads)??[1])),[data]);

  return <section className="admin-panel admin-campaign-performance" style={{marginTop:18}} aria-label="عملکرد کمپین‌های بازاریابی">
    <style>{`
      .admin-campaign-performance{overflow:hidden}.admin-campaign-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap}.admin-campaign-title{display:grid;gap:4px}.admin-campaign-title h2{margin:4px 0 0;color:var(--navy-900);font-size:1.06rem}.admin-campaign-title p{margin:0;color:var(--muted);font-size:.72rem;line-height:1.8}
      .admin-campaign-toolbar{display:flex;gap:6px;align-items:center;flex-wrap:wrap}.admin-campaign-range{display:inline-flex;padding:3px;border:1px solid var(--line);border-radius:10px;background:var(--surface-2,#f7f5f0)}.admin-campaign-range button{border:0;background:transparent;color:var(--muted);font:inherit;font-size:.65rem;font-weight:800;padding:6px 8px;min-height:34px;border-radius:8px;cursor:pointer}.admin-campaign-range button.is-active{background:var(--card,#fff);color:var(--navy-900)}
      .admin-campaign-grid{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;margin:13px 0}.admin-campaign-stat{display:grid;gap:4px;padding:10px 11px;border:1px solid var(--line);border-radius:11px;background:var(--card,#fff)}.admin-campaign-stat span{display:flex;align-items:center;gap:5px;color:var(--muted);font-size:.63rem}.admin-campaign-stat strong{color:var(--navy-900);font-size:1rem}
      .admin-campaign-table-wrap{overflow:auto;border:1px solid var(--line);border-radius:13px}.admin-campaign-table{width:100%;min-width:780px;border-collapse:collapse}.admin-campaign-table th,.admin-campaign-table td{padding:9px 10px;border-bottom:1px solid var(--line);text-align:right}.admin-campaign-table th{background:var(--surface-2,#f7f5f0);color:var(--subtle);font-size:.62rem;white-space:nowrap}.admin-campaign-table td{color:var(--muted);font-size:.67rem}.admin-campaign-table tr:last-child td{border-bottom:0}.admin-campaign-name strong{display:block;color:var(--navy-900);font-size:.7rem}.admin-campaign-name small{display:block;color:var(--subtle);font-size:.6rem;margin-top:2px}.admin-campaign-number{font-weight:800;color:var(--navy-900)!important}.admin-campaign-rate{display:inline-flex;padding:3px 6px;border-radius:8px;background:var(--surface-2,#f7f5f0);color:var(--navy-900);font-weight:800}
      .admin-campaign-empty{padding:24px;text-align:center;color:var(--subtle)}.admin-campaign-note{margin:8px 0 0;color:var(--subtle);font-size:.61rem;line-height:1.8}.admin-campaign-extra{display:grid;grid-template-columns:1.25fr 1fr;gap:10px;margin:10px 0}.admin-campaign-subpanel{border:1px solid var(--line);border-radius:13px;padding:12px;background:var(--card,#fff)}.admin-campaign-subpanel h3{margin:0 0 10px;color:var(--navy-900);font-size:.76rem}.admin-campaign-trend{display:grid;grid-template-columns:repeat(auto-fit,minmax(22px,1fr));align-items:end;gap:5px;height:130px}.admin-campaign-trend-col{min-width:0;height:100%;display:grid;grid-template-rows:1fr auto;gap:5px}.admin-campaign-trend-track{height:100%;display:flex;align-items:end;border-radius:7px;background:var(--surface-2,#f7f5f0);overflow:hidden}.admin-campaign-trend-bar{width:100%;min-height:3px;background:var(--navy-900,#253744);opacity:.88;border-radius:7px 7px 0 0}.admin-campaign-trend-col small{color:var(--subtle);font-size:.52rem;text-align:center;white-space:nowrap;overflow:hidden}.admin-campaign-quality{display:grid;gap:8px}.admin-campaign-quality-row{display:grid;gap:5px}.admin-campaign-quality-meta{display:flex;justify-content:space-between;gap:8px;color:var(--muted);font-size:.63rem}.admin-campaign-quality-track{height:8px;border-radius:99px;background:var(--surface-2,#f1efea);overflow:hidden}.admin-campaign-quality-track span{display:block;height:100%;background:var(--navy-900,#253744);border-radius:inherit}
      @media(max-width:900px){.admin-campaign-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.admin-campaign-extra{grid-template-columns:1fr}}@media(max-width:560px){.admin-campaign-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.admin-campaign-trend{gap:3px}}
    `}</style>
    <div className="admin-campaign-head"><div className="admin-campaign-title"><span className="kicker">بازاریابی</span><h2>عملکرد کمپین‌ها و منابع جذب</h2><p>تعداد لید، تماس واقعی، بازدید و قرارداد را به تفکیک منبع، رسانه و کمپین ببینید.</p></div><div className="admin-campaign-toolbar"><div className="admin-campaign-range" aria-label="بازه گزارش">{[7,30,90].map((value)=><button key={value} type="button" className={days===value?"is-active":""} onClick={()=>setDays(value as 7|30|90)}>{value===7?"۷ روز":value===30?"۳۰ روز":"۹۰ روز"}</button>)}</div><button type="button" className="btn-ghost" onClick={()=>void load(days)} disabled={loading}><RefreshCw size={14} className={loading?"admin-spin":""}/>بروزرسانی</button></div></div>
    <div className="admin-campaign-grid">
      <div className="admin-campaign-stat"><span><Target size={12}/>گروه‌های جذب</span><strong>{fa(data?.totals.campaigns??0)}</strong></div>
      <div className="admin-campaign-stat"><span><UsersRound size={12}/>لید</span><strong>{fa(data?.totals.leads??0)}</strong></div>
      <div className="admin-campaign-stat"><span><PhoneCall size={12}/>تماس واقعی</span><strong>{fa(data?.totals.contacted??0)}</strong></div>
      <div className="admin-campaign-stat"><span><CalendarRange size={12}/>بازدید</span><strong>{fa(data?.totals.visits??0)}</strong></div>
      <div className="admin-campaign-stat"><span><CheckCircle2 size={12}/>قرارداد</span><strong>{fa(data?.totals.contracts??0)}</strong></div>
    </div>
    <div className="admin-campaign-extra">
      <section className="admin-campaign-subpanel"><h3>روند ورود لید</h3>{data?.daily.length?<div className="admin-campaign-trend" aria-label={`روند ورود لید در ${days} روز`}>{data.daily.map((item)=><div className="admin-campaign-trend-col" key={item.day} title={item.leads.toLocaleString("fa-IR")+" لید · "+item.contracts.toLocaleString("fa-IR")+" قرارداد"}><div className="admin-campaign-trend-track"><span className="admin-campaign-trend-bar" style={{height:Math.max(item.leads?8:2,item.leads/maxDaily*100)+"%"}}/></div><small>{item.day.slice(5)}</small></div>)}</div>:<div className="admin-campaign-empty">داده روزانه برای این بازه موجود نیست.</div>}</section>
      <section className="admin-campaign-subpanel"><h3><ClipboardCheck size={13} style={{verticalAlign:"middle",marginInlineEnd:4}}/>کامل بودن داده جذب</h3><div className="admin-campaign-quality">
        <div className="admin-campaign-quality-row"><div className="admin-campaign-quality-meta"><span>منبع جذب</span><strong>{pct(data?.quality.source??0)}</strong></div><div className="admin-campaign-quality-track"><span style={{width:(data?.quality.source??0)+"%"}}/></div></div>
        <div className="admin-campaign-quality-row"><div className="admin-campaign-quality-meta"><span>رسانه</span><strong>{pct(data?.quality.medium??0)}</strong></div><div className="admin-campaign-quality-track"><span style={{width:(data?.quality.medium??0)+"%"}}/></div></div>
        <div className="admin-campaign-quality-row"><div className="admin-campaign-quality-meta"><span>نام کمپین</span><strong>{pct(data?.quality.campaign??0)}</strong></div><div className="admin-campaign-quality-track"><span style={{width:(data?.quality.campaign??0)+"%"}}/></div></div>
      </div><p className="admin-campaign-note">{fa(data?.quality.leads??0)} لید در محاسبه کیفیت UTM این بازه بررسی شده‌اند.</p></section>
    </div>
    <div className="admin-campaign-table-wrap">{loading&&!data?<div className="admin-campaign-empty"><RefreshCw size={22} className="admin-spin"/>در حال جمع‌آوری داده‌ها…</div>:data?.rows.length?<table className="admin-campaign-table"><thead><tr><th>منبع / کمپین</th><th>لید</th><th>تماس</th><th>بازدید</th><th>قرارداد</th><th>نرخ تماس</th><th>نرخ قرارداد</th></tr></thead><tbody>{data.rows.map((row)=><tr key={row.source+"|"+row.medium+"|"+row.campaign}><td className="admin-campaign-name"><strong>{row.campaign}</strong><small>{row.source} · {row.medium}</small></td><td className="admin-campaign-number">{fa(row.leads)}</td><td className="admin-campaign-number">{fa(row.contacted)}</td><td className="admin-campaign-number">{fa(row.visits)}</td><td className="admin-campaign-number">{fa(row.contracts)}</td><td><span className="admin-campaign-rate">{pct(row.contactRate)}</span></td><td><span className="admin-campaign-rate">{pct(row.contractRate)}</span></td></tr>)}</tbody></table>:<div className="admin-campaign-empty"><BarChart3 size={24}/>برای این بازه داده کمپین ثبت نشده است.</div>}</div>
    <p className="admin-campaign-note">این گزارش «بازده قیف جذب» است؛ چون مبلغ قرارداد به کمپین متصل نیست، ROI مالی محاسبه نمی‌شود.</p>
  </section>;
}
