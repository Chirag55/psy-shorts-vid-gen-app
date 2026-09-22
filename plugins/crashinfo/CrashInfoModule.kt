package com.mindfiles.studio

import android.app.ActivityManager
import android.app.ApplicationExitInfo
import android.content.Context
import android.os.Build
import java.io.File
import java.io.PrintWriter
import java.io.StringWriter
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.WritableArray
import com.facebook.react.bridge.WritableMap

/**
 * Reads Android's own record of why this app's previous processes ended.
 *
 * A native crash or an out-of-memory kill leaves nothing behind in JavaScript —
 * the process is simply gone. Guessing from what the app was doing at the time
 * cannot distinguish "Skia segfaulted" from "the system reclaimed us for
 * memory", and those need opposite fixes. `ActivityManager` has kept the real
 * answer since API 30; this exposes it.
 *
 * Deliberately a plain promise-returning module with no event emitter: a module
 * that constructs a NativeEventEmitter at class-initialisation time crashes the
 * app on startup under the New Architecture.
 */
class CrashInfoModule(reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  override fun getName() = "CrashInfo"

  init {
    installGlobalHandler(reactContext.applicationContext)
  }

  /**
   * Captures the stack trace of an uncaught Java/Kotlin exception.
   *
   * `ApplicationExitInfo` reports *that* the process died of a Java crash but
   * carries no trace for one — `traceInputStream` is populated for ANRs and
   * native tombstones only. Without a trace, a Java crash on a background
   * thread is as opaque as a segfault: the process is gone and nothing in
   * JavaScript ran. Writing the trace to a file before letting the app die is
   * the only way to see it on the next launch.
   *
   * The previous handler is always invoked afterwards, so the process still
   * terminates exactly as Android expects.
   */
  /** Returns the last captured Java/Kotlin stack trace, or an empty string. */
  @ReactMethod
  fun getLastJavaCrash(promise: Promise) {
    try {
      val file = File(File(reactApplicationContext.filesDir, "diagnostics"), JAVA_CRASH_FILE)
      promise.resolve(if (file.exists()) file.readText() else "")
    } catch (e: Throwable) {
      promise.resolve("")
    }
  }

  @ReactMethod
  fun clearLastJavaCrash(promise: Promise) {
    try {
      File(File(reactApplicationContext.filesDir, "diagnostics"), JAVA_CRASH_FILE).delete()
    } catch (ignored: Throwable) {
      // Nothing to do.
    }
    promise.resolve(true)
  }

  companion object {
    private const val JAVA_CRASH_FILE = "java-crash.log"

    @Volatile
    private var handlerInstalled = false

    /**
     * Installs the handler as early as possible.
     *
     * Called from `MainApplication.onCreate` rather than only from this
     * module's constructor: under the New Architecture a legacy module is
     * built lazily, on first access, so a crash before anything touched this
     * module would go uncaptured.
     */
    @JvmStatic
    @Synchronized
    fun installGlobalHandler(context: Context) {
      if (handlerInstalled) return
      handlerInstalled = true

      val previous = Thread.getDefaultUncaughtExceptionHandler()
      val appContext = context.applicationContext

      Thread.setDefaultUncaughtExceptionHandler { thread, throwable ->
        try {
          val writer = StringWriter()
          throwable.printStackTrace(PrintWriter(writer))

          val report = buildString {
            append("thread: ").append(thread.name).append('\n')
            append("when: ").append(System.currentTimeMillis()).append('\n')
            append("type: ").append(throwable.javaClass.name).append('\n')
            append("message: ").append(throwable.message ?: "(none)").append('\n')
            append('\n')
            append(writer.toString())
          }

          val dir = File(appContext.filesDir, "diagnostics")
          dir.mkdirs()
          File(dir, JAVA_CRASH_FILE).writeText(report.take(16000))
        } catch (ignored: Throwable) {
          // Never let diagnostics interfere with the crash itself.
        }

        previous?.uncaughtException(thread, throwable)
      }
    }
  }

  private fun reasonName(reason: Int): String = when (reason) {
    ApplicationExitInfo.REASON_ANR -> "ANR (the app stopped responding)"
    ApplicationExitInfo.REASON_CRASH -> "Java/Kotlin crash"
    ApplicationExitInfo.REASON_CRASH_NATIVE -> "Native crash (segfault in C++)"
    ApplicationExitInfo.REASON_DEPENDENCY_DIED -> "A dependency process died"
    ApplicationExitInfo.REASON_EXCESSIVE_RESOURCE_USAGE -> "Killed for excessive resource use"
    ApplicationExitInfo.REASON_EXIT_SELF -> "Exited normally"
    ApplicationExitInfo.REASON_INITIALIZATION_FAILURE -> "Failed to initialise"
    ApplicationExitInfo.REASON_LOW_MEMORY -> "Killed: the device ran out of memory"
    ApplicationExitInfo.REASON_OTHER -> "Other"
    ApplicationExitInfo.REASON_PERMISSION_CHANGE -> "Killed after a permission change"
    ApplicationExitInfo.REASON_SIGNALED -> "Killed by a signal"
    ApplicationExitInfo.REASON_USER_REQUESTED -> "Closed by you"
    ApplicationExitInfo.REASON_USER_STOPPED -> "Stopped by the system"
    else -> "Unknown ($reason)"
  }

  /**
   * Returns the most recent process exits, newest first.
   *
   * `trace` is present only when Android captured one — typically for ANRs and
   * some native crashes. It is truncated, because this ends up in a dialog.
   */
  @ReactMethod
  fun getExitReasons(limit: Int, promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.R) {
        promise.resolve(Arguments.createArray())
        return
      }

      val manager =
        reactApplicationContext.getSystemService(Context.ACTIVITY_SERVICE) as ActivityManager
      val records =
        manager.getHistoricalProcessExitReasons(reactApplicationContext.packageName, 0, limit)

      val out: WritableArray = Arguments.createArray()
      for (record in records) {
        val entry: WritableMap = Arguments.createMap()
        entry.putInt("reasonCode", record.reason)
        entry.putString("reason", reasonName(record.reason))
        entry.putString("description", record.description ?: "")
        entry.putDouble("timestamp", record.timestamp.toDouble())
        entry.putInt("status", record.status)
        entry.putDouble("pssKb", record.pss.toDouble())
        entry.putDouble("rssKb", record.rss.toDouble())
        entry.putInt("importance", record.importance)

        var trace: String? = null
        try {
          record.traceInputStream?.use { stream ->
            trace = stream.readBytes().toString(Charsets.UTF_8).take(4000)
          }
        } catch (e: Throwable) {
          trace = null
        }
        entry.putString("trace", trace ?: "")

        out.pushMap(entry)
      }
      promise.resolve(out)
    } catch (e: Throwable) {
      // Diagnostics must never be the reason something fails.
      promise.resolve(Arguments.createArray())
    }
  }
}
