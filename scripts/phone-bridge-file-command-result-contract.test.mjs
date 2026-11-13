import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";

const activity = readFileSync(
  resolve(process.cwd(), "android/app/src/main/java/ir/hirmand/phonebridge/remote/RemoteFileManagerActivity.kt"),
  "utf8",
);
const uploadStart = activity.indexOf("private fun uploadRequestedFile()");
const uploadEnd = activity.indexOf("private fun queryName(", uploadStart);
const upload = activity.slice(uploadStart, uploadEnd);

test("Phone Bridge file upload reports command failure for every unsuccessful exit", () => {
  assert.ok(uploadStart >= 0 && uploadEnd > uploadStart);
  assert.match(upload, /reportUploadFailure\("تنظیمات ارتباطی معتبر نیست\."\)/);
  assert.match(upload, /reportUploadFailure\("فایل وجود ندارد، قابل خواندن نیست یا بیش از ۸ مگابایت است\."\)/);
  assert.match(upload, /if\(!response\.isSuccessful\)[\s\S]*?reportUploadFailure\("آپلود فایل ناموفق بود\."\)/);
  assert.match(upload, /if\(id\.isBlank\(\)\)[\s\S]*?reportUploadFailure\("پاسخ سرور برای آپلود فایل معتبر نبود\."\)/);
  assert.match(upload, /catch \(_: Exception\)[\s\S]*?reportUploadFailure\("ارتباط برای ارسال فایل برقرار نشد\."\)/);
  assert.match(activity, /private fun reportUploadFailure\(message:String\)[\s\S]*?postResult\(false,JSONObject\(\),message\)/);
});