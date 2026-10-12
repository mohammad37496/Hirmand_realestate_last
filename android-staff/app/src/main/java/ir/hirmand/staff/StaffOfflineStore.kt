package ir.hirmand.staff

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec
import kotlin.math.min

data class StaffPendingSync(
    val eventId:String,
    val payload:String,
    val retries:Int,
    val nextRetryAt:Long,
)

class StaffOfflineStore private constructor(context:Context):SQLiteOpenHelper(
    context.applicationContext,
    "hirmand_staff_offline.db",
    null,
    1,
){
    companion object{
        private const val KEY_ALIAS="hirmand_staff_offline_v1"
        private const val STORE="AndroidKeyStore"
        private const val SNAPSHOT_KEY="operations_snapshot"
        private const val SNAPSHOT_TIME_KEY="operations_snapshot_time"
        @Volatile private var instance:StaffOfflineStore?=null

        fun get(context:Context):StaffOfflineStore=
            instance ?: synchronized(this){instance ?: StaffOfflineStore(context).also{instance=it}}

        private fun key():SecretKey{
            val store=KeyStore.getInstance(STORE).apply{load(null)}
            val existing=store.getKey(KEY_ALIAS,null)
            if(existing is SecretKey)return existing
            val generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,STORE)
            generator.init(
                KeyGenParameterSpec.Builder(
                    KEY_ALIAS,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                ).setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setRandomizedEncryptionRequired(true)
                    .build()
            )
            return generator.generateKey()
        }

        private fun encrypt(value:String):String{
            val cipher=Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.ENCRYPT_MODE,key())
            val iv=cipher.iv
            val encrypted=cipher.doFinal(value.toByteArray(StandardCharsets.UTF_8))
            return Base64.encodeToString(iv,Base64.NO_WRAP)+"."+Base64.encodeToString(encrypted,Base64.NO_WRAP)
        }

        private fun decrypt(value:String):String?{
            return runCatching{
                val parts=value.split('.',limit=2)
                if(parts.size!=2) return@runCatching null
                val iv=Base64.decode(parts[0],Base64.NO_WRAP)
                val encrypted=Base64.decode(parts[1],Base64.NO_WRAP)
                val cipher=Cipher.getInstance("AES/GCM/NoPadding")
                cipher.init(Cipher.DECRYPT_MODE,key(),GCMParameterSpec(128,iv))
                String(cipher.doFinal(encrypted),StandardCharsets.UTF_8)
            }.getOrNull()
        }
    }

    override fun onCreate(db:SQLiteDatabase){
        db.execSQL(
            "create table operations_snapshot(key text primary key, value text not null, updated_at integer not null)"
        )
        db.execSQL(
            "create table sync_queue(event_id text primary key, payload text not null, created_at integer not null, retries integer not null default 0, next_retry_at integer not null)"
        )
        db.execSQL("create index sync_queue_retry_idx on sync_queue(next_retry_at asc)")
    }

    override fun onUpgrade(db:SQLiteDatabase,oldVersion:Int,newVersion:Int){}

    fun cacheSnapshot(json:String){
        val values=ContentValues().apply{
            put("key",SNAPSHOT_KEY)
            put("value",encrypt(json))
            put("updated_at",System.currentTimeMillis())
        }
        writableDatabase.insertWithOnConflict("operations_snapshot",null,values,SQLiteDatabase.CONFLICT_REPLACE)
        putMeta(SNAPSHOT_TIME_KEY,System.currentTimeMillis().toString())
    }

    fun cachedSnapshot():Pair<String?,Long?>{
        val cursor=readableDatabase.query(
            "operations_snapshot",
            arrayOf("value","updated_at"),
            "key=?",
            arrayOf(SNAPSHOT_KEY),
            null,null,null,"1"
        )
        cursor.use{
            if(!it.moveToFirst())return null to null
            val value=decrypt(it.getString(0))
            return value to it.getLong(1)
        }
    }

    fun enqueue(eventId:String,payload:String){
        val now=System.currentTimeMillis()
        val values=ContentValues().apply{
            put("event_id",eventId)
            put("payload",encrypt(payload))
            put("created_at",now)
            put("retries",0)
            put("next_retry_at",now)
        }
        writableDatabase.insertWithOnConflict("sync_queue",null,values,SQLiteDatabase.CONFLICT_REPLACE)
    }

    fun dueQueue(limit:Int=12):List<StaffPendingSync>{
        val result=mutableListOf<StaffPendingSync>()
        val cursor=readableDatabase.query(
            "sync_queue",
            arrayOf("event_id","payload","retries","next_retry_at"),
            "next_retry_at<=?",
            arrayOf(System.currentTimeMillis().toString()),
            null,null,"created_at asc",
            limit.coerceIn(1,50).toString()
        )
        cursor.use{
            while(it.moveToNext()){
                val payload=decrypt(it.getString(1)) ?: continue
                result += StaffPendingSync(it.getString(0),payload,it.getInt(2),it.getLong(3))
            }
        }
        return result
    }

    fun pendingCount():Int=
        readableDatabase.rawQuery("select count(*) from sync_queue",null).use{
            if(it.moveToFirst())it.getInt(0) else 0
        }

    fun remove(eventId:String){
        writableDatabase.delete("sync_queue","event_id=?",arrayOf(eventId))
    }

    fun markFailed(eventId:String,retries:Int){
        val next=System.currentTimeMillis()+min(6*60*60*1000L,15000L*(1L shl retries.coerceIn(0,8)))
        val values=ContentValues().apply{
            put("retries",retries+1)
            put("next_retry_at",next)
        }
        writableDatabase.update("sync_queue",values,"event_id=?",arrayOf(eventId))
    }

    fun prune(){
        writableDatabase.delete(
            "sync_queue",
            "created_at<?",
            arrayOf((System.currentTimeMillis()-14*24*60*60*1000L).toString())
        )
    }

    private fun putMeta(key:String,value:String){
        val values=ContentValues().apply{put("key",key);put("value",encrypt(value));put("updated_at",System.currentTimeMillis())}
        writableDatabase.insertWithOnConflict("operations_snapshot",null,values,SQLiteDatabase.CONFLICT_REPLACE)
    }
}