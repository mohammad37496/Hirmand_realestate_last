import { createHash, randomUUID } from "node:crypto";
import { createError, defineEventHandler, getHeader, readRawBody, setResponseHeader } from "h3";
import { dbSource, getSql } from "@/lib/db";
import { authenticateDevice } from "@/lib/phone-bridge-auth";
import { requirePhoneBridgeSignedRequest } from "@/lib/phone-bridge-signature.server";
import { enforcePhoneBridgeRateLimit } from "@/lib/phone-bridge-rate-limit.server";
import { recordPhoneBridgeEvent } from "@/lib/phone-bridge-events.server";

const MAX_BYTES = 128 * 1024 * 1024;
const FORMATS = new Map([["wav","audio/wav"],["amr","audio/amr"]]);

function safeName(value:string){return value.replace(/[\\/\\x00-\\x1f]+/g,"-").trim().slice(-180)||"remote-audio";}
function decodeName(value:string|undefined){try{return safeName(Buffer.from(value||"","base64").toString("utf8"))}catch{return "remote-audio"}}

export default defineEventHandler(async event=>{
 setResponseHeader(event,"cache-control","no-store");
 if(dbSource==="unconfigured") throw createError({statusCode:503,statusMessage:"پایگاه داده آماده نیست."});
 const deviceId=getHeader(event,"x-hirmand-device-id")?.trim().slice(0,120)||"";
 const commandId=getHeader(event,"x-hirmand-command-id")?.trim().slice(0,120)||"";
 const sha=getHeader(event,"x-hirmand-file-sha256")?.trim().toLowerCase()||"";
 const size=Number(getHeader(event,"x-hirmand-file-size")||"");
 const mime=getHeader(event,"x-hirmand-file-mime")?.trim().toLowerCase()||"";
 const name=decodeName(getHeader(event,"x-hirmand-file-name"));
 if(!deviceId||!commandId) throw createError({statusCode:400,statusMessage:"شناسهٔ دستگاه یا فرمان ارسال نشده است."});
 await enforcePhoneBridgeRateLimit(event,"remote-audio-upload",deviceId,{windowMs:10*60*1000,maxHits:10,blockMs:10*60*1000});
 const auth=await authenticateDevice(event,deviceId);
 if(auth.mode!=="device") throw createError({statusCode:401,statusMessage:"احراز هویت دستگاه معتبر نیست."});
 if(auth.allowedModules.microphone===false) throw createError({statusCode:403,statusMessage:"ماژول میکروفون برای این دستگاه غیرفعال است."});
 const raw=await readRawBody(event); const content=Buffer.isBuffer(raw)?raw:Buffer.from(raw||"");
 if(content.length<1||content.length>MAX_BYTES) throw createError({statusCode:413,statusMessage:"حجم فایل صوتی نامعتبر است."});
 await requirePhoneBridgeSignedRequest(event,deviceId,content);
 if(!/^[a-f0-9]{64}$/i.test(sha)||!Number.isInteger(size)||size!==content.length) throw createError({statusCode:400,statusMessage:"اطلاعات صحت فایل صوتی معتبر نیست."});
 const actual=createHash("sha256").update(content).digest("hex"); if(actual!==sha) throw createError({statusCode:400,statusMessage:"صحت فایل صوتی تأیید نشد."});
 if(![...FORMATS.values()].includes(mime)) throw createError({statusCode:415,statusMessage:"فرمت صوتی معتبر نیست."});
 const sql=await getSql();
 const rows=await sql.query<{action:string;status:string;payload:unknown;expires_at:string}>("select action,status,payload,expires_at from phone_bridge_remote_commands where id=$1 and device_id=$2 limit 1",[commandId,deviceId]);
 const command=rows[0]; if(!command||command.status!=="running"||command.action!=="record_audio"||new Date(String(command.expires_at)).getTime()<Date.now()) throw createError({statusCode:409,statusMessage:"فرمان ضبط دیگر فعال نیست."});
 const payload=command.payload&&typeof command.payload==="object"?command.payload as Record<string,unknown>:{};
 const format=String(payload.audioFormat||""); const duration=Number(payload.durationSeconds||0);
 if(!FORMATS.has(format)||!Number.isInteger(duration)||duration<60||duration>3600) throw createError({statusCode:409,statusMessage:"پارامترهای ضبط معتبر نیستند."});
 const fileId=randomUUID();
 await sql.query("insert into phone_bridge_files (id,device_id,name,mime_type,size_bytes,sha256,content) values ($1,$2,$3,$4,$5,$6,$7)",[fileId,deviceId,name,mime,size,actual,content]);
 await recordPhoneBridgeEvent({deviceId,eventType:"remote.audio_uploaded",severity:"info",message:"فایل صوتی ریموت دریافت و ذخیره شد.",metadata:{commandId,format,duration,fileId}}).catch(()=>undefined);
 return {ok:true,fileId,name,sizeBytes:size,sha256:actual};
});