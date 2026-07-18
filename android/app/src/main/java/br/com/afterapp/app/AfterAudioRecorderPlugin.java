package br.com.afterapp.app;

import android.Manifest;
import android.media.MediaRecorder;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;

@CapacitorPlugin(
    name = "AfterAudioRecorder",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
public class AfterAudioRecorderPlugin extends Plugin {
    private MediaRecorder recorder;
    private File outputFile;
    private long startedAt = 0L;

    @PluginMethod
    public void hasPermission(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("microphone") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            JSObject result = new JSObject();
            result.put("granted", true);
            call.resolve(result);
            return;
        }

        requestPermissionForAlias("microphone", call, "microphonePermissionCallback");
    }

    @PermissionCallback
    private void microphonePermissionCallback(PluginCall call) {
        JSObject result = new JSObject();
        result.put("granted", getPermissionState("microphone") == PermissionState.GRANTED);
        call.resolve(result);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("microphone-permission-denied");
            return;
        }

        try {
            stopRecorderSilently();
            outputFile = File.createTempFile("after-audio-", ".m4a", getContext().getCacheDir());
            recorder = new MediaRecorder();
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioEncodingBitRate(96000);
            recorder.setAudioSamplingRate(44100);
            recorder.setOutputFile(outputFile.getAbsolutePath());
            recorder.prepare();
            recorder.start();
            startedAt = System.currentTimeMillis();

            JSObject result = new JSObject();
            result.put("started", true);
            call.resolve(result);
        } catch (Exception error) {
            stopRecorderSilently();
            call.reject("audio-start-failed", error);
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (recorder == null || outputFile == null) {
            call.reject("audio-not-recording");
            return;
        }

        try {
            recorder.stop();
            recorder.release();
            recorder = null;

            long durationMs = Math.max(0L, System.currentTimeMillis() - startedAt);
            byte[] bytes = readAllBytes(outputFile);
            String base64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
            outputFile.delete();
            outputFile = null;
            startedAt = 0L;

            JSObject result = new JSObject();
            result.put("recordDataBase64", base64);
            result.put("mimeType", "audio/mp4");
            result.put("durationMs", durationMs);
            call.resolve(result);
        } catch (Exception error) {
            stopRecorderSilently();
            call.reject("audio-stop-failed", error);
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        stopRecorderSilently();
        JSObject result = new JSObject();
        result.put("cancelled", true);
        call.resolve(result);
    }

    private void stopRecorderSilently() {
        try {
            if (recorder != null) {
                try {
                    recorder.stop();
                } catch (Exception ignored) {
                }
                recorder.release();
            }
        } catch (Exception ignored) {
        }

        recorder = null;
        if (outputFile != null) {
            try {
                outputFile.delete();
            } catch (Exception ignored) {
            }
        }
        outputFile = null;
        startedAt = 0L;
    }

    private byte[] readAllBytes(File file) throws IOException {
        FileInputStream input = new FileInputStream(file);
        try {
            long length = file.length();
            byte[] bytes = new byte[(int) length];
            int offset = 0;
            int count;
            while (offset < bytes.length && (count = input.read(bytes, offset, bytes.length - offset)) >= 0) {
                offset += count;
            }
            return bytes;
        } finally {
            input.close();
        }
    }
}
