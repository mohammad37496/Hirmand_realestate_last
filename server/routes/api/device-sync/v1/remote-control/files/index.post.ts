import { createError, defineEventHandler, readRawBody, setResponseHeader } from "h3";
import { randomUUID } from "node:crypto";
import { dbSource, getSql } from "@/lib/db";
import { authenticateDevice } from "@/lib/phone-bridge-auth";
import { requirePhoneBridgeSignedRequest } from "@/lib/phone-bridge-signature.server";
const MAX_BODY=1024*1024;
export default defineEventHandler(async(event)=>{
 setResponseHeader(event,"cache-control","no-store");
 if(dbSource==="unconfigured") throw createError({statusCode:503,statusMessage:"پایگاه داده آماده نیست."});
 const raw=await readRawBody(event);const bytes=Buffer.from(raw??"");
 if(!bytes.length||bytes.length>MAX_BODY) throw createError({statusCode:413,statusMessage:"فهرست فایل‌ها بیش از حد مجاز است."});
 let body:Record<string,unknown>;try{body=JSON.parse(bytes.toString("utf8"))}catch{throw createError({statusCode:400,statusMessage:"فهرست فایل‌ها معتبر نیست."})}
 const deviceId=String(body.deviceId??"").trim();if(!deviceId)throw createError({statusCode:400,statusMessage:"شناسه دستگاه ارسال نشده است."});
 const auth=await authenticateDevice(event,deviceId);if(auth.mode==="device")await requirePhoneBridgeSignedRequest(event,deviceId,bytes);
 if(auth.allowedModules.selectedFiles===false)throw createError({statusCode:403,statusMessage:"مدیریت فایل برای این دستگاه غیرفعال است."});
 const rootUri=String(body.rootUri??"").slice(0,2000);const entries=Array.isArray(body.entries)?body.entries.slice(0,1800):[];const sql=await getSql();
 await sql.query("delete from phone_bridge_file_entries where device_id=$1",[deviceId]);
 for(const e of entries){if(!e||typeof e!=="object")continue;const x=e as Record<string,unknown>;const uri=String(x.uri??"").slice(0,3000);if(!uri)continue;
  await sql.query("insert into phone_bridge_file_entries (id,device_id,root_uri,uri,parent_uri,name,relative_path,mime_type,size_bytes,modified_at,is_directory) values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (device_id,uri) do update set name=excluded.name,relative_path=excluded.relative_path,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes,modified_at=excluded.modified_at,is_directory=excluded.is_directory,indexed_at=current_timestamp",
   [randomUUID(),deviceId,rootUri,String(x.uri).slice(0,3000),String(x.parentUri??"").slice(0,3000),String(x.name??"file").slice(0,300),String(x.relativePath??x.name??"").slice(0,3000),String(x.mimeType??"application/octet-stream").slice(0,180),Number.isFinite(Number(x.sizeBytes))?Number(x.sizeBytes):0,Number.isFinite(Number(x.modifiedAt))?Number(x.modifiedAt):0,x.isDirectory===true]);
 }
 return {ok:true,entries:entries.length};
});