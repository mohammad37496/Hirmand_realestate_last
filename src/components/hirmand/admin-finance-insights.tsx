import { useEffect,useState } from "react";
import { BarChart3,RefreshCw,TrendingDown,TrendingUp,WalletCards } from "lucide-react";
import { toast } from "sonner";
const fa=(n:number)=>Number(n||0).toLocaleString("fa-IR"); const money=(n:number)=>fa(n)+" تومان";
type Data={months:Array<{month:string;income:number;expense:number;balance:number}>;categories:Array<{category:string;income:number;expense:number}>;consultants:Array<{name:string;due:number;paid:number}>;outstanding:number};
export function AdminFinanceInsights(){
 const [data,setData]=useState<Data>({months:[],categories:[],consultants:[],outstanding:0}); const [loading,setLoading]=useState(true);
 const load=async()=>{setLoading(true);try{const r=await fetch("/api/admin-finance-insights");const x=await r.json();if(!r.ok)throw new Error(x?.statusMessage||"گزارش مالی دریافت نشد.");setData(x);}catch(e){toast.error(e instanceof Error?e.message:"گزارش مالی دریافت نشد.");}finally{setLoading(false);}};
 useEffect(()=>{void load()},[]);
 const totalIncome=data.months.reduce((s,x)=>s+x.income,0),totalExpense=data.months.reduce((s,x)=>s+x.expense,0),profit=totalIncome-totalExpense;
 return <section className="admin-panel admin-finance-insights" dir="rtl">
  <div className="admin-panel-head"><div><span className="kicker">گزارش مدیریتی</span><h2>روند سود، هزینه و تعهدات</h2><p>جمع‌بندی ۱۲ ماه اخیر بر اساس دفتر مالی و تسویه کمیسیون.</p></div><button className="btn-ghost" type="button" onClick={()=>void load()} disabled={loading}><RefreshCw size={14}/> بروزرسانی</button></div>
  <div className="admin-dashboard-mini-grid"><div><span>درآمد ۱۲ ماه</span><strong>{money(totalIncome)}</strong></div><div><span>هزینه ۱۲ ماه</span><strong>{money(totalExpense)}</strong></div><div><span>خالص</span><strong>{money(profit)}</strong></div><div><span>تسویه باز</span><strong>{fa(data.outstanding)}</strong></div></div>
  <div className="admin-finance-insights-grid">
   <div className="admin-finance-chart"><h3><BarChart3 size={16}/> روند ماهانه</h3>{data.months.length?data.months.map(m=>{const max=Math.max(m.income,m.expense,1);return <div className="admin-finance-month" key={m.month}><span>{m.month}</span><div><i style={{width:(m.income/max*100)+"%"}}/><b>{money(m.income)}</b></div><div><i className="expense" style={{width:(m.expense/max*100)+"%"}}/><b>{money(m.expense)}</b></div></div>}):<div className="admin-empty">داده‌ای برای نمودار وجود ندارد.</div>}</div>
   <div className="admin-finance-chart"><h3><WalletCards size={16}/> تسویه مشاوران</h3>{data.consultants.length?data.consultants.map(c=><div className="admin-finance-consultant" key={c.name}><div><strong>{c.name}</strong><small>پرداخت: {money(c.paid)}</small></div><b>{money(c.due)}</b></div>):<div className="admin-empty">هنوز تسویه‌ای ثبت نشده.</div>}</div>
  </div>
  <div className="admin-finance-category"><h3><TrendingUp size={16}/> دسته‌بندی‌های اصلی</h3>{data.categories.slice(0,8).map(c=><div key={c.category}><span>{c.category}</span><small><TrendingUp size={12}/> {money(c.income)} · <TrendingDown size={12}/> {money(c.expense)}</small></div>)}</div>
 </section>;
}
