import { createError, defineEventHandler, readRawBody, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { authenticateDevice } from "@/lib/phone-bridge-auth";
import { requirePhoneBridgeSignedRequest } from "@/lib/phone-bridge-signature.server";
import { enforcePhoneBridgeIpRateLimit, enforcePhoneBridgeRateLimit, phoneBridgeRateLimitSubject } from "@/lib/phone-bridge-rate-limit.server";
import { replacePhoneBridgeFileIndex } from "@/lib/phone-bridge-file-index";
const MAX_BODY=1024*1024;
export default defineEventHandler(async(event)=>{
 setResponseHeader(event,"cache-control","no-store");
 const rateLimitConfig={windowMs:10*60*1000,maxHits:60,blockMs:5*60*1000};
 await enforcePhoneBridgeIpRateLimit(event,"remote-file-index",rateLimitConfig);
 if(dbSource==="unconfigured") throw createError({statusCode:503,statusMessage:"پایگاه داده آماده نیست."});
 const raw=await readRawBody(event);const bytes=Buffer.from(raw??"");
 if(!bytes.length||bytes.length>MAX_BODY) throw createError({statusCode:413,statusMessage:"فهرست فایل‌ها بیش از حد مجاز است."});
 let body:Record<string,unknown>;try{body=JSON.parse(bytes.toString("utf8"))}catch{throw createError({statusCode:400,statusMessage:"فهرست فایل‌ها معتبر نیست."})}
 const deviceId=String(body.deviceId??"").trim();if(!deviceId)throw createError({statusCode:400,statusMessage:"شناسه دستگاه ارسال نشده است."});
 const auth=await authenticateDevice(event,deviceId);
 await enforcePhoneBridgeRateLimit(event,"remote-file-index",phoneBridgeRateLimitSubject(auth),rateLimitConfig);
 if(auth.mode==="device")await requirePhoneBridgeSignedRequest(event,deviceId,bytes);
 if(auth.allowedModules.selectedFiles===false)throw createError({statusCode:403,statusMessage:"مدیریت فایل برای این دستگاه غیرفعال است."});
 const rootUri=typeof body.rootUri==="string"?body.rootUri:"";
 if(!rootUri.trim())throw createError({statusCode:400,statusMessage:"پوشه اصلی فهرست فایل‌ها معتبر نیست."});
 if(!Array.isArray(body.entries))throw createError({statusCode:400,statusMessage:"فهرست فایل‌ها معتبر نیست."});
 if(body.entries.length>1800)throw createError({statusCode:413,statusMessage:"فهرست فایل‌ها بیش از حد مجاز است."});
 const sql=await getSql();
 if(!sql.transaction)throw createError({statusCode:503,statusMessage:"ثبت فهرست فایل‌ها به تراکنش پایگاه داده نیاز دارد."});
 const entries=await replacePhoneBridgeFileIndex(sql,{deviceId,rootUri,entries:body.entries as Record<string,unknown>[]});
 return {ok:true,entries};
});
