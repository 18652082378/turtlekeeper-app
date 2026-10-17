package com.turtlekeeper.app;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.util.Base64;
import androidx.activity.result.ActivityResult;
import androidx.core.content.FileProvider;
import com.getcapacitor.*;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.*;
import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicBoolean;

/** User-chosen document destinations and native image sharing, without storage permission. */
@CapacitorPlugin(name = "TurtleAndroidFiles")
public class TurtleAndroidFilesPlugin extends Plugin {
    private final AtomicBoolean exporting = new AtomicBoolean(false);

    @PluginMethod public void exportText(PluginCall call) { prepare(call, false, false); }
    @PluginMethod public void exportImage(PluginCall call) { prepare(call, true, false); }
    @PluginMethod public void shareImage(PluginCall call) { prepare(call, true, true); }

    static String safeName(String input, String fallback) {
        if (input == null) return fallback;
        String name = input.replaceAll("[\\\\/\\p{Cntrl}:*?\"<>|]", "_").trim();
        if (name.isEmpty() || name.equals(".") || name.equals("..")) return fallback;
        return name.length() > 120 ? name.substring(0, 100) + (name.endsWith(".png") ? ".png" : name.endsWith(".csv") ? ".csv" : ".txt") : name;
    }

    private void prepare(PluginCall call, boolean image, boolean share) {
        if (!exporting.compareAndSet(false, true)) { call.reject("请先完成当前保存或分享操作"); return; }
        getBridge().execute(() -> {
            File file = null;
            try {
                String name = safeName(call.getString("filename"), image ? "龟友手账.png" : "龟友手账.txt");
                String mime;
                byte[] bytes;
                if (image) {
                    String data = call.getString("dataUrl", "");
                    if (data.length() > 16 * 1024 * 1024 || !data.startsWith("data:image/png;base64,")) throw new IOException("图片格式无效或过大");
                    bytes = Base64.decode(data.substring(data.indexOf(',') + 1), Base64.DEFAULT);
                    BitmapFactory.Options bounds = new BitmapFactory.Options(); bounds.inJustDecodeBounds = true;
                    try (InputStream input = new ByteArrayInputStream(bytes)) { BitmapFactory.decodeStream(input, null, bounds); }
                    if (bounds.outWidth <= 0 || bounds.outHeight <= 0 || !"image/png".equals(bounds.outMimeType)) throw new IOException("图片读取失败");
                    mime = "image/png";
                } else {
                    String content = call.getString("content", "");
                    if (content.length() > 16 * 1024 * 1024) throw new IOException("导出文件过大，请缩小范围");
                    bytes = content.getBytes(StandardCharsets.UTF_8);
                    if (bytes.length > 16 * 1024 * 1024) throw new IOException("导出文件过大，请缩小范围");
                    mime = name.endsWith(".csv") ? "text/csv" : name.endsWith(".json") ? "application/json" : "text/plain";
                }
                File directory = new File(getContext().getCacheDir(), "turtle_exports");
                if (!directory.exists() && !directory.mkdirs()) throw new IOException("无法创建导出文件");
                // Shares must remain available to the receiving app. Expire them after one day.
                File[] previous = directory.listFiles();
                if (previous != null) for (File old : previous) if (System.currentTimeMillis() - old.lastModified() > 86400000L) old.delete();
                file = new File(directory, UUID.randomUUID().toString() + (image ? ".png" : ".txt"));
                try (OutputStream out = new FileOutputStream(file)) { out.write(bytes); }
                // Activity state must contain only metadata, never a multi-MB bridge payload.
                call.getData().remove("content"); call.getData().remove("dataUrl");
                call.getData().put("_exportFile", file.getName()); call.getData().put("filename", name);
                final File ready = file;
                final String type = mime;
                getActivity().runOnUiThread(() -> launch(call, ready, name, type, share));
            } catch (Exception error) {
                if (file != null) file.delete(); exporting.set(false); call.reject("导出失败：" + error.getMessage());
            }
        });
    }

    private void launch(PluginCall call, File file, String name, String mime, boolean share) {
        try {
            if (share) {
                Uri uri = shareUri(file, name);
                Intent send = new Intent(Intent.ACTION_SEND).setType(mime).putExtra(Intent.EXTRA_STREAM, uri)
                        .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                send.setClipData(ClipData.newRawUri(name, uri));
                getActivity().startActivity(Intent.createChooser(send, "分享图片"));
                JSObject result = new JSObject(); result.put("opened", true); call.resolve(result); exporting.set(false);
            } else {
                Intent create = new Intent(Intent.ACTION_CREATE_DOCUMENT).addCategory(Intent.CATEGORY_OPENABLE)
                        .setType(mime).putExtra(Intent.EXTRA_TITLE, name);
                startActivityForResult(call, create, "documentResult");
            }
        } catch (Exception error) { file.delete(); exporting.set(false); call.reject("无法打开系统保存或分享窗口，请重试", "FILE_UI_UNAVAILABLE", error); }
    }

    Uri shareUri(File file, String displayName) {
        return FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file, displayName);
    }

    @ActivityCallback
    void documentResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) { exporting.set(false); return; }
        getBridge().execute(() -> {
            File file = null;
            try {
                String cached = call.getString("_exportFile", "");
                if (!cached.matches("[a-f0-9-]{36}\\.(txt|png)")) throw new IOException("导出文件已失效，请重试");
                file = new File(new File(getContext().getCacheDir(), "turtle_exports"), cached);
                JSObject result = new JSObject();
                if (activityResult.getResultCode() != Activity.RESULT_OK) { result.put("cancelled", true); call.resolve(result); return; }
                Uri destination = activityResult.getData() == null ? null : activityResult.getData().getData();
                if (destination == null || !"content".equals(destination.getScheme())) throw new IOException("未选择有效保存位置");
                try (InputStream in = new FileInputStream(file); OutputStream out = getContext().getContentResolver().openOutputStream(destination, "wt")) {
                    if (out == null) throw new IOException("保存位置不可写");
                    byte[] buffer = new byte[16384]; int count;
                    while ((count = in.read(buffer)) != -1) out.write(buffer, 0, count);
                }
                result.put("saved", true); result.put("filename", call.getString("filename")); call.resolve(result);
            } catch (Exception error) { call.reject("文件未保存成功：" + error.getMessage()); }
            finally { if (file != null) file.delete(); exporting.set(false); }
        });
    }
}
