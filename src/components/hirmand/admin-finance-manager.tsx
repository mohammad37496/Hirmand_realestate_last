import { useEffect,useMemo,useState } from "react";
import { ArrowDownCircle,ArrowUpCircle,Plus,RefreshCw,Trash2 } from "lucide-react";
import { toast } from "sonner";
import { formatToman } from "@/lib/money";

type Kind="income"|"expense";
type Tx={id:number;kind:Kind;title:string;amount:number;transactionDate:string;propertyId:string|null;leadId:string|null;consultant:string;category:string;note:string;createdAt:string};

export function AdminFinanceManager(){
  const [items,setItems]=useState<Tx[]>([]);
  const [summary,setSummary]=useState({income:0,expense:0,balance:0});
  const [loading,setLoading]=useState(true);
  const [saving,setSaving]=useState(false);
  const [kind,setKind]=useState<Kind>("income");
  const [title,setTitle]=useState("");
  const [amount,setAmount]=useState("");
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [consultant,setConsultant]=useState("");
  const [category,setCategory]=useState("");
  const [note,setNote]=useState("");

  async function load(){
    setLoading(true);
    try{
      const res=await fetch("/api/admin-finance",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"list"})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(data?.statusMessage||"بارگذاری دفتر مالی انجام نشد.");
      setItems(Array.isArray(data.transactions)?data.transactions:[]);
      setSummary(data.summary??{income:0,expense:0,balance:0});
    }catch(e){toast.error(e instanceof Error?e.message:"بارگذاری دفتر مالی انجام نشد.");}
    finally{setLoading(false);}
  }
  useEffect(()=>{void load()},[]);

  async function create(){
    if(saving)return;
    setSaving(true);
    try{
      const res=await fetch("/api/admin-finance",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"create",kind,title,amount,transactionDate:date,consultant,category,note})});
      const data=await res.json().catch(()=>({}));
      if(!res.ok) throw new Error(data?.statusMessage||"ثبت تراکنش انجام نشد.");
      setTitle("");setAmount("");setNote("");
      toast.success("تراکنش ثبت شد.");await load();
    }catch(e){toast.error(e instanceof Error?e.message:"ثبت تراکنش انجام نشد.");}
    finally{setSaving(false);}
  }
  async function remove(id:number){
    if(!window.confirm("این تراکنش حذف شود؟"))return;
    const res=await fetch("/api/admin-finance",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({action:"delete",id})});
    if(res.ok){toast.success("تراکنش حذف شد.");void load()}else toast.error("حذف تراکنش انجام نشد.");
  }

  const balanceTone=summary.balance>=0?"positive":"negative";
  return <div className="admin-finance-page">
    <section className="admin-panel">
      <div className="admin-panel-head">
        <div><span className="kicker">حسابداری دفتر</span><h2>درآمد، هزینه و تسویه</h2></div>
        <button className="btn-ghost" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={15}/>به‌روزرسانی</button>
      </div>
      <div className="admin-finance-summary">
        <div><small>درآمد</small><strong>{formatToman(summary.income)}</strong></div>
        <div><small>هزینه</small><strong>{formatToman(summary.expense)}</strong></div>
        <div className={balanceTone}><small>مانده</small><strong>{formatToman(Math.abs(summary.balance))}{summary.balance<0?" · بدهکار":""}</strong></div>
      </div>
      <div className="admin-finance-form">
        <label className="field"><span>نوع</span><select value={kind} onChange={e=>setKind(e.target.value as Kind)}><option value="income">درآمد</option><option value="expense">هزینه</option></select></label>
        <label className="field"><span>عنوان</span><input value={title} onChange={e=>setTitle(e.target.value)} placeholder="مثلاً کمیسیون قرارداد..." /></label>
        <label className="field"><span>مبلغ (تومان)</span><input inputMode="numeric" value={amount} onChange={e=>setAmount(e.target.value)} placeholder="0" /></label>
        <label className="field"><span>تاریخ</span><input type="date" value={date} onChange={e=>setDate(e.target.value)} /></label>
        <label className="field"><span>مشاور</span><input value={consultant} onChange={e=>setConsultant(e.target.value)} placeholder="اختیاری" /></label>
        <label className="field"><span>دسته‌بندی</span><input value={category} onChange={e=>setCategory(e.target.value)} placeholder="کمیسیون، تبلیغات، اجاره دفتر..." /></label>
        <label className="field admin-span-2"><span>یادداشت</span><textarea rows={2} value={note} onChange={e=>setNote(e.target.value)} /></label>
        <button className="btn-gold" type="button" onClick={()=>void create()} disabled={saving||!title.trim()||!amount}><Plus size={16}/>{saving?"در حال ثبت…":"ثبت تراکنش"}</button>
      </div>
    </section>
    <section className="admin-panel">
      <div className="admin-panel-head"><div><span className="kicker">دفتر ثبت</span><h2>{items.length.toLocaleString("fa-IR")} تراکنش</h2></div></div>
      {items.length===0&&!loading?<div className="admin-empty"><strong>هنوز تراکنشی ثبت نشده</strong><p>درآمد کمیسیون و هزینه‌های دفتر را از بالا ثبت کنید.</p></div>:
      <div className="admin-finance-list">{items.map(item=><article key={item.id} className="admin-finance-row">
        <span className={"admin-finance-icon "+item.kind}>{item.kind==="income"?<ArrowUpCircle size={19}/>:<ArrowDownCircle size={19}/>}</span>
        <div><strong>{item.title}</strong><small>{item.category||"بدون دسته"}{item.consultant?" · "+item.consultant:""}{item.note?" · "+item.note:""}</small></div>
        <span className={"admin-finance-amount "+item.kind}>{item.kind==="income"?"+":"−"} {formatToman(item.amount)}</span>
        <time>{new Date(item.transactionDate+"T12:00:00").toLocaleDateString("fa-IR")}</time>
        <button className="admin-icon-btn" type="button" title="حذف" onClick={()=>void remove(item.id)}><Trash2 size={15}/></button>
      </article>)}</div>}
    </section>
  </div>
}
