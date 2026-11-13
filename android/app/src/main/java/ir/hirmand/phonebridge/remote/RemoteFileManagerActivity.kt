package ir.hirmand.phonebridge.remote

import android.app.Activity
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.provider.DocumentsContract
import android.provider.OpenableColumns
import android.view.Gravity
import android.widget.Button
import android.widget.LinearLayout
import android.widget.TextView
import ir.hirmand.phonebridge.data.AppPrefs
import ir.hirmand.phonebridge.data.EndpointPolicy
import ir.hirmand.phonebridge.sync.SignedRequest
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.util.concurrent.TimeUnit
import kotlin.concurrent.thread

class RemoteFileManagerActivity : Activity() {
    companion object { private const val PICK_TREE=4101; private const val MAX_ENTRIES=1800; private const val MAX_UPLOAD_BYTES=8L*1024*1024 }
    private lateinit var prefs:AppPrefs; private lateinit var status:TextView; private lateinit var commandId:String; private lateinit var operation:String; private lateinit var requestedUri:String; private lateinit var requestedRootUri:String
    private val client by lazy { OkHttpClient.Builder().connectTimeout(10,TimeUnit.SECONDS).readTimeout(30,TimeUnit.SECONDS).writeTimeout(60,TimeUnit.SECONDS).callTimeout(90,TimeUnit.SECONDS).build() }

    override fun onCreate(state:Bundle?){
        super.onCreate(state); prefs=AppPrefs(this); commandId=intent.getStringExtra("command_id").orEmpty(); operation=intent.getStringExtra("operation").orEmpty(); requestedUri=intent.getStringExtra("uri").orEmpty(); requestedRootUri=intent.getStringExtra("root_uri").orEmpty()
        val root=LinearLayout(this).apply{orientation=LinearLayout.VERTICAL;setPadding(40,50,40,40);gravity=Gravity.CENTER_HORIZONTAL}
        root.addView(TextView(this).apply{text="مدیریت فایل‌های Phone Bridge";textSize=22f;gravity=Gravity.CENTER})
        status=TextView(this).apply{text=if(operation=="download")"فایل برای ارسال به پنل آماده است؛ برای ادامه تأیید کنید." else "برای نمایش فایل‌ها باید یک پوشه را خودتان انتخاب و اجازه دسترسی بدهید.";textSize=17f;setPadding(0,30,0,30);gravity=Gravity.CENTER};root.addView(status)
        if(operation=="download"){
            root.addView(Button(this).apply{text="تأیید و ارسال فایل به پنل";setOnClickListener{thread{uploadRequestedFile()}}})
            root.addView(Button(this).apply{text="لغو";setOnClickListener{postResult(false,JSONObject(),"ارسال فایل لغو شد");finish()}})
        }else{
            root.addView(Button(this).apply{text="انتخاب پوشه";setOnClickListener{openTreePicker()}})
            root.addView(Button(this).apply{text="بستن";setOnClickListener{postResult(true,JSONObject().put("entries",0),null);finish()}})
        };setContentView(root)
    }
    private fun openTreePicker(){startActivityForResult(Intent(Intent.ACTION_OPEN_DOCUMENT_TREE).addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION or Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION),PICK_TREE)}
    @Deprecated("legacy result API")
    override fun onActivityResult(requestCode:Int,resultCode:Int,data:Intent?){
        super.onActivityResult(requestCode,resultCode,data);if(requestCode!=PICK_TREE)return
        if(resultCode!=RESULT_OK||data?.data==null){postResult(false,JSONObject(),"انتخاب پوشه لغو شد");finish();return}
        val tree=data.data!!
        val persistable=runCatching{
            var takeFlags=0
            if(data.flags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0)takeFlags=takeFlags or Intent.FLAG_GRANT_READ_URI_PERMISSION
            if(data.flags and Intent.FLAG_GRANT_WRITE_URI_PERMISSION != 0)takeFlags=takeFlags or Intent.FLAG_GRANT_WRITE_URI_PERMISSION
            check(takeFlags and Intent.FLAG_GRANT_READ_URI_PERMISSION != 0) { "اجازه خواندن پوشه صادر نشد." }
            contentResolver.takePersistableUriPermission(tree,takeFlags)
        }
        if(persistable.isFailure){
            postResult(false,JSONObject(),"اجازه پایدار خواندن پوشه ذخیره نشد.")
            status.text="اجازه پایدار خواندن پوشه ذخیره نشد؛ پوشه دوباره انتخاب شود."
            window.decorView.postDelayed({finish()},1200)
            return
        }
        status.text="پوشه انتخاب شد؛ در حال خواندن فهرست فایل‌ها…"
        thread{
            val enumeration=runCatching{enumerateTree(tree)}
            if(enumeration.isFailure){
                val message=enumeration.exceptionOrNull()?.message?:"خواندن ساختار پوشه ناموفق بود."
                postResult(false,JSONObject(),message)
                runOnUiThread{status.text="خواندن ساختار پوشه ناموفق بود؛ فهرست قبلی حفظ شد.";window.decorView.postDelayed({finish()},1200)}
                return@thread
            }
            val result=enumeration.getOrThrow()
            val ok=postIndex(tree,result)
            runOnUiThread{
                status.text=if(ok){
                    "فهرست "+result.entries.size+" مورد به پنل ارسال شد."+(if(result.truncated)" سقف ۱۸۰۰ مورد پر شد؛ پوشه‌های باقی‌مانده ثبت نشدند." else "")
                }else "ارسال فهرست ناموفق بود؛ فهرست قبلی حفظ شد."
                postResult(ok,JSONObject().put("rootUri",tree.toString()).put("entries",result.entries.size).put("truncated",result.truncated),if(ok)null else "ارسال فهرست ناموفق بود")
                window.decorView.postDelayed({finish()},1200)
            }
        }
    }
    private fun enumerateTree(root:Uri):RemoteTreeResult{
        val rootDocumentId=DocumentsContract.getTreeDocumentId(root)
        var providerTruncated = false
        val result = RemoteFileTreeTraversal.enumerate(
            rootDocumentId=rootDocumentId,
            maxEntries=MAX_ENTRIES,
            childrenOf={parentDocumentId, maxDocuments->
            val children=DocumentsContract.buildChildDocumentsUriUsingTree(root,parentDocumentId)
            val cursor=contentResolver.query(children,arrayOf(DocumentsContract.Document.COLUMN_DOCUMENT_ID,DocumentsContract.Document.COLUMN_DISPLAY_NAME,DocumentsContract.Document.COLUMN_MIME_TYPE,DocumentsContract.Document.COLUMN_SIZE,DocumentsContract.Document.COLUMN_LAST_MODIFIED),null,null,DocumentsContract.Document.COLUMN_DISPLAY_NAME+" ASC")
                ?:throw IllegalStateException("فهرست زیرپوشه از ارائه‌دهنده فایل دریافت نشد.")
            cursor.use{c->
                val id=c.getColumnIndex(DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                val name=c.getColumnIndex(DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                val mime=c.getColumnIndex(DocumentsContract.Document.COLUMN_MIME_TYPE)
                val sizeColumn=c.getColumnIndex(DocumentsContract.Document.COLUMN_SIZE)
                val modified=c.getColumnIndex(DocumentsContract.Document.COLUMN_LAST_MODIFIED)
                check(id>=0) { "شناسه سند در فهرست پوشه وجود ندارد." }
                val bounded = RemoteFileTreeTraversal.readAtMost(maxDocuments, c::moveToNext) {
                    val documentId = c.getString(id).orEmpty()
                    RemoteTreeDocument(
                        documentId = documentId,
                        name = if (name >= 0) c.getString(name).orEmpty() else "",
                        mimeType = if (mime >= 0) c.getString(mime) ?: "application/octet-stream" else "application/octet-stream",
                        sizeBytes = if (sizeColumn >= 0 && !c.isNull(sizeColumn)) c.getLong(sizeColumn).coerceAtLeast(0) else 0L,
                        modifiedAt = if (modified >= 0 && !c.isNull(modified)) c.getLong(modified).coerceAtLeast(0) else 0L,
                    )
                }
                if (bounded.hasMore) providerTruncated = true
                bounded.values
            }
        })
        return result.copy(truncated = result.truncated || providerTruncated)
    }
    private fun postIndex(root:Uri,result:RemoteTreeResult):Boolean{
        val endpoint=prefs.endpoint.trim();val token=prefs.token.trim();val device=prefs.installId.trim();if(!EndpointPolicy.isAllowed(endpoint)||token.isBlank()||device.isBlank())return false
        val entries=JSONArray()
        result.entries.forEach{entry->
            val child=DocumentsContract.buildDocumentUriUsingTree(root,entry.document.documentId)
            val parent=DocumentsContract.buildDocumentUriUsingTree(root,entry.parentDocumentId)
            entries.put(JSONObject().put("uri",child.toString()).put("parentUri",parent.toString()).put("name",entry.document.name).put("relativePath",entry.relativePath).put("mimeType",entry.document.mimeType).put("sizeBytes",entry.document.sizeBytes).put("modifiedAt",entry.document.modifiedAt).put("isDirectory",entry.isDirectory))
        }
        val body=JSONObject().put("deviceId",device).put("rootUri",root.toString()).put("entries",entries).toString().toByteArray()
        return runCatching{val req=Request.Builder().url(endpoint.trimEnd('/')+"/remote-control/files/index").post(body.toRequestBody("application/json; charset=utf-8".toMediaType())).header("Authorization","Bearer "+token).header("X-Hirmand-Device-Id",device);SignedRequest.addHeaders(req,token,device,body);client.newCall(req.build()).execute().use{it.isSuccessful}}.getOrDefault(false)
    }
    private fun uploadRequestedFile(){
        try {
            val endpoint=prefs.endpoint.trim();val token=prefs.token.trim();val device=prefs.installId.trim()
            if(!EndpointPolicy.isAllowed(endpoint)||token.isBlank()||device.isBlank()){
                reportUploadFailure("تنظیمات ارتباطی معتبر نیست.")
                return
            }
            val uri=Uri.parse(requestedUri)
            val rootTreeUri=Uri.parse(requestedRootUri)
            val rootDocumentId=runCatching{DocumentsContract.getTreeDocumentId(rootTreeUri)}.getOrNull()
            val requestedDocumentId=runCatching{DocumentsContract.getDocumentId(uri)}.getOrNull()
            val documentPath=runCatching{DocumentsContract.findDocumentPath(contentResolver,uri)}.getOrNull()
            val persistedReadTreeUris=contentResolver.persistedUriPermissions
                .filter{it.isReadPermission}
                .map{it.uri.toString()}
                .toSet()
            val allowedRootFile=rootDocumentId!=null && requestedDocumentId!=null && RemoteFileUriGuard.isAllowed(
                requestedRootUri,
                rootDocumentId,
                requestedUri,
                persistedReadTreeUris,
                requestedDocumentId,
                documentPath?.path
            )
            if(!allowedRootFile){
                reportUploadFailure("مسیر فایل خارج از پوشهٔ انتخاب‌شده است یا مجوز خواندن آن معتبر نیست.")
                return
            }
            val name=queryName(uri)
            val bytes=runCatching{contentResolver.openInputStream(uri)?.use{RemoteFileReader.readLimited(it,MAX_UPLOAD_BYTES)}}.getOrNull()
            if(bytes==null){
                reportUploadFailure("فایل وجود ندارد، قابل خواندن نیست یا بیش از ۸ مگابایت است.")
                return
            }
            val sha=sha256(bytes);val mime=contentResolver.getType(uri)?:"application/octet-stream";val nameB64=android.util.Base64.encodeToString(name.toByteArray(),android.util.Base64.NO_WRAP)
            val req=Request.Builder().url(endpoint.trimEnd('/')+"/files").post(bytes.toRequestBody(mime.toMediaType())).header("Authorization","Bearer "+token).header("X-Hirmand-Device-Id",device).header("X-Hirmand-File-Sha256",sha).header("X-Hirmand-File-Size",bytes.size.toString()).header("X-Hirmand-File-Mime",mime).header("X-Hirmand-File-Name",nameB64)
            SignedRequest.addHeaders(req,token,device,bytes)
            client.newCall(req.build()).execute().use{response->
                if(!response.isSuccessful){
                    reportUploadFailure("آپلود فایل ناموفق بود.")
                    return
                }
                val id=JSONObject(response.body?.string().orEmpty()).optString("fileId")
                if(id.isBlank()){
                    reportUploadFailure("پاسخ سرور برای آپلود فایل معتبر نبود.")
                    return
                }
                runOnUiThread{status.text="فایل ارسال شد: "+name}
                postResult(true,JSONObject().put("fileId",id).put("fileName",name).put("mimeType",mime).put("sizeBytes",bytes.size).put("sha256",sha),null)
                runOnUiThread{window.decorView.postDelayed({finish()},1200)}
            }
        } catch (_: Exception) {
            reportUploadFailure("ارتباط برای ارسال فایل برقرار نشد.")
        }
    }
    private fun reportUploadFailure(message:String){
        postResult(false,JSONObject(),message)
        runOnUiThread{
            status.text=message
            window.decorView.postDelayed({finish()},1200)
        }
    }
    private fun queryName(uri:Uri):String{contentResolver.query(uri,arrayOf(OpenableColumns.DISPLAY_NAME),null,null,null)?.use{if(it.moveToFirst())return it.getString(0).orEmpty()};return uri.lastPathSegment?.substringAfterLast('/')?:"file"}
    private fun sha256(bytes:ByteArray):String=MessageDigest.getInstance("SHA-256").digest(bytes).joinToString(""){"%02x".format(it.toInt() and 0xff)}
    private fun postResult(success:Boolean,result:JSONObject,error:String?){
        val endpoint=prefs.endpoint.trim();val token=prefs.token.trim();val device=prefs.installId.trim();if(!EndpointPolicy.isAllowed(endpoint)||token.isBlank()||device.isBlank()||commandId.isBlank())return
        val body=JSONObject().put("deviceId",device).put("commandId",commandId).put("action","manage_files").put("success",success).put("error",error?:JSONObject.NULL).put("result",result).toString().toByteArray()
        thread{runCatching{val req=Request.Builder().url(endpoint.trimEnd('/')+"/remote-control/result").post(body.toRequestBody("application/json; charset=utf-8".toMediaType())).header("Authorization","Bearer "+token).header("X-Hirmand-Device-Id",device);SignedRequest.addHeaders(req,token,device,body);client.newCall(req.build()).execute().close()}}
    }
}
