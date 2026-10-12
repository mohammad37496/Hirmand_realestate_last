import { Eye, X } from "lucide-react";
import { useState } from "react";
import { getPropertyFallbackImage } from "@/lib/property-fallback-images";
import type { PropertyType, PropertyTransaction } from "@/lib/properties";
import "@/admin-property-preview.css";

export type AdminPropertyPreviewData = {
  title:string; transactionType:PropertyTransaction; propertyType:PropertyType; neighborhood:string;
  areaM2:string; bedrooms:string; bathrooms:string; floor:string; parking:boolean; elevator:boolean; storage:boolean;
  price:string; deposit:string; rent:string; description:string; images:string; contactName:string; contactPhone:string;
  featured:boolean; status:string;
};
const TX:Record<PropertyTransaction,string>={sell:"فروش",buy:"خرید",rent:"اجاره",mortgage:"رهن"};
const PT:Record<PropertyType,string>={apartment:"آپارتمان",villa:"ویلا و باغ",office:"اداری",heritage:"خانه اصیل",land:"زمین",commercial:"تجاری"};
function money(v:string){const d=v.replace(/[۰-۹]/g,x=>String("۰۱۲۳۴۵۶۷۸۹".indexOf(x))).replace(/[٬،,\s]/g,"");return /^\d+$/.test(d)?Number(d).toLocaleString("fa-IR"):"—";}
export function AdminPropertyPreview({data}:{data:AdminPropertyPreviewData}){
  const [open,setOpen]=useState(false);
  const image=data.images.split(/[\n,]+/).map(x=>x.trim()).find(Boolean)||getPropertyFallbackImage(data.propertyType,"admin-preview");
  const price=data.transactionType==="rent"?[data.deposit&&"رهن "+money(data.deposit),data.rent&&"اجاره "+money(data.rent)].filter(Boolean).join(" · ")+" تومان":data.transactionType==="mortgage"?(data.deposit?money(data.deposit)+" تومان":"رهن مشخص نشده"):(data.price?money(data.price)+" تومان":"قیمت مشخص نشده");
  return <><button type="button" className="admin-preview-trigger" onClick={()=>setOpen(true)}><Eye size={16}/> پیش‌نمایش قبل از انتشار</button>
  {open?<div className="admin-preview-backdrop" role="dialog" aria-modal="true" onMouseDown={e=>{if(e.currentTarget===e.target)setOpen(false)}}><section className="admin-preview-dialog">
    <button type="button" className="admin-preview-close" aria-label="بستن" onClick={()=>setOpen(false)}><X size={18}/></button>
    <header className="admin-preview-head"><div><span>پیش‌نمایش فایل</span><h2>{data.title.trim()||"عنوان فایل هنوز وارد نشده است"}</h2><small>{TX[data.transactionType]} · {PT[data.propertyType]} · {data.neighborhood.trim()||"محله مشخص نشده"}</small></div><b>{data.status==="published"?"نسخه انتشار":"نسخه پیش‌نویس"}</b></header>
    <div className="admin-preview-property"><div className="admin-preview-image-wrap"><img src={image} alt="" className="admin-preview-image"/>{data.featured?<span className="admin-preview-badge">ویژه</span>:null}</div>
      <div className="admin-preview-info"><div className="admin-preview-price">{price}</div><div className="admin-preview-specs">
        {data.areaM2?<span><b>{data.areaM2}</b> متر</span>:null}{data.bedrooms?<span><b>{data.bedrooms}</b> خواب</span>:null}{data.bathrooms?<span><b>{data.bathrooms}</b> سرویس</span>:null}{data.floor?<span><b>{data.floor}</b> طبقه</span>:null}{data.parking?<span>پارکینگ</span>:null}{data.elevator?<span>آسانسور</span>:null}{data.storage?<span>انباری</span>:null}
      </div><p>{data.description.trim()||"توضیحات فایل هنوز تکمیل نشده است."}</p><div className="admin-preview-contact"><strong>{data.contactName.trim()||"مشاور هیرمند"}</strong><span dir="ltr">{data.contactPhone.trim()||"شماره تماس ثبت نشده"}</span></div></div></div>
    <footer className="admin-preview-foot"><span>این پیش‌نمایش فقط از اطلاعات فعلی فرم استفاده می‌کند و چیزی منتشر نمی‌کند.</span><button type="button" className="btn-ghost" onClick={()=>setOpen(false)}>بستن</button></footer>
  </section></div>:null}</>;
}
