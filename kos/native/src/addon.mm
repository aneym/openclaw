#include <napi.h>
#import "capture.h"
#import "input.h"
#include <memory>
#include <unordered_map>

namespace {

// Global capture instances (keyed by window ID)
std::unordered_map<uint32_t, std::unique_ptr<kos::SimulatorCapture>> g_captures;

// Convert WindowInfo to JS object
Napi::Object WindowInfoToJS(Napi::Env env, const kos::WindowInfo& info) {
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("windowId", Napi::Number::New(env, info.windowId));
  obj.Set("pid", Napi::Number::New(env, info.pid));
  obj.Set("title", Napi::String::New(env, info.title));
  obj.Set("bundleId", Napi::String::New(env, info.bundleId));

  Napi::Object bounds = Napi::Object::New(env);
  bounds.Set("x", Napi::Number::New(env, info.bounds.origin.x));
  bounds.Set("y", Napi::Number::New(env, info.bounds.origin.y));
  bounds.Set("width", Napi::Number::New(env, info.bounds.size.width));
  bounds.Set("height", Napi::Number::New(env, info.bounds.size.height));
  obj.Set("bounds", bounds);

  return obj;
}

// listSimulatorWindows() -> Promise<SimulatorWindow[]>
Napi::Value ListSimulatorWindows(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  auto deferred = Napi::Promise::Deferred::New(env);

  // macOS dispatch handles threading internally via dispatch_semaphore
  std::vector<kos::WindowInfo> windows = kos::SimulatorCapture::listSimulatorWindows();

  Napi::Array result = Napi::Array::New(env, windows.size());
  for (size_t i = 0; i < windows.size(); i++) {
    result.Set(i, WindowInfoToJS(env, windows[i]));
  }

  deferred.Resolve(result);
  return deferred.Promise();
}

// startCapture(windowId, config, onFrame, onError) -> Promise<stopFn>
Napi::Value StartCapture(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 4) {
    Napi::TypeError::New(env, "Expected 4 arguments: windowId, config, onFrame, onError")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  uint32_t windowId = info[0].As<Napi::Number>().Uint32Value();
  Napi::Object config = info[1].As<Napi::Object>();
  Napi::Function onFrameJs = info[2].As<Napi::Function>();
  Napi::Function onErrorJs = info[3].As<Napi::Function>();

  // Parse config
  int fps = config.Has("fps") ? config.Get("fps").As<Napi::Number>().Int32Value() : 60;
  float scaleFactor = config.Has("scaleFactor")
    ? config.Get("scaleFactor").As<Napi::Number>().FloatValue() : 1.0f;
  bool showCursor = config.Has("showCursor")
    ? config.Get("showCursor").As<Napi::Boolean>().Value() : false;

  // Create thread-safe callbacks
  auto tsfnFrame = Napi::ThreadSafeFunction::New(
    env, onFrameJs, "FrameCallback", 0, 1);
  auto tsfnError = Napi::ThreadSafeFunction::New(
    env, onErrorJs, "ErrorCallback", 0, 1);

  // Create capture instance
  auto capture = std::make_unique<kos::SimulatorCapture>();

  // Frame callback - called from capture thread
  kos::FrameCallback frameCallback = [tsfnFrame](const kos::FrameData& frame) mutable {
    // Copy frame data for transfer
    auto frameCopy = std::make_shared<kos::FrameData>(frame);

    tsfnFrame.NonBlockingCall([frameCopy](Napi::Env env, Napi::Function jsCallback) {
      Napi::Object frameObj = Napi::Object::New(env);

      // Create buffer from frame data
      Napi::Buffer<uint8_t> buffer = Napi::Buffer<uint8_t>::Copy(
        env, frameCopy->buffer.data(), frameCopy->buffer.size());

      frameObj.Set("buffer", buffer);
      frameObj.Set("width", Napi::Number::New(env, frameCopy->width));
      frameObj.Set("height", Napi::Number::New(env, frameCopy->height));
      frameObj.Set("bytesPerRow", Napi::Number::New(env, frameCopy->bytesPerRow));
      frameObj.Set("timestamp", Napi::Number::New(env, frameCopy->timestamp));

      jsCallback.Call({frameObj});
    });
  };

  // Error callback
  kos::ErrorCallback errorCallback = [tsfnError](const std::string& error) mutable {
    auto errorCopy = std::make_shared<std::string>(error);

    tsfnError.NonBlockingCall([errorCopy](Napi::Env env, Napi::Function jsCallback) {
      Napi::Error err = Napi::Error::New(env, *errorCopy);
      jsCallback.Call({err.Value()});
    });
  };

  auto deferred = Napi::Promise::Deferred::New(env);

  // Start capture
  bool started = capture->start(windowId, fps, scaleFactor, showCursor, frameCallback, errorCallback);

  if (!started) {
    deferred.Reject(Napi::Error::New(env, "Failed to start capture").Value());
    return deferred.Promise();
  }

  // Store capture instance
  g_captures[windowId] = std::move(capture);

  // Create stop function
  Napi::Function stopFn = Napi::Function::New(env, [windowId, tsfnFrame, tsfnError](const Napi::CallbackInfo& info) mutable {
    auto it = g_captures.find(windowId);
    if (it != g_captures.end()) {
      it->second->stop();
      g_captures.erase(it);
    }

    // Release thread-safe functions
    tsfnFrame.Release();
    tsfnError.Release();

    return info.Env().Undefined();
  });

  deferred.Resolve(stopFn);
  return deferred.Promise();
}

// injectTap(windowId, x, y)
Napi::Value InjectTap(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 3) {
    Napi::TypeError::New(env, "Expected 3 arguments: windowId, x, y")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  uint32_t windowId = info[0].As<Napi::Number>().Uint32Value();
  float x = info[1].As<Napi::Number>().FloatValue();
  float y = info[2].As<Napi::Number>().FloatValue();

  kos::InputInjector::injectTap(windowId, x, y);

  return env.Undefined();
}

// injectSwipe(windowId, startX, startY, endX, endY, durationMs)
Napi::Value InjectSwipe(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 6) {
    Napi::TypeError::New(env, "Expected 6 arguments: windowId, startX, startY, endX, endY, durationMs")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  uint32_t windowId = info[0].As<Napi::Number>().Uint32Value();
  float startX = info[1].As<Napi::Number>().FloatValue();
  float startY = info[2].As<Napi::Number>().FloatValue();
  float endX = info[3].As<Napi::Number>().FloatValue();
  float endY = info[4].As<Napi::Number>().FloatValue();
  int durationMs = info[5].As<Napi::Number>().Int32Value();

  kos::InputInjector::injectSwipe(windowId, startX, startY, endX, endY, durationMs);

  return env.Undefined();
}

// injectText(windowId, text)
Napi::Value InjectText(const Napi::CallbackInfo& info) {
  Napi::Env env = info.Env();

  if (info.Length() < 2) {
    Napi::TypeError::New(env, "Expected 2 arguments: windowId, text")
      .ThrowAsJavaScriptException();
    return env.Undefined();
  }

  uint32_t windowId = info[0].As<Napi::Number>().Uint32Value();
  std::string text = info[1].As<Napi::String>().Utf8Value();

  kos::InputInjector::injectText(windowId, text);

  return env.Undefined();
}

// hasScreenRecordingPermission() -> boolean
Napi::Value HasScreenRecordingPermission(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), kos::SimulatorCapture::hasScreenRecordingPermission());
}

// requestScreenRecordingPermission()
Napi::Value RequestScreenRecordingPermission(const Napi::CallbackInfo& info) {
  kos::SimulatorCapture::requestScreenRecordingPermission();
  return info.Env().Undefined();
}

// hasAccessibilityPermission() -> boolean
Napi::Value HasAccessibilityPermission(const Napi::CallbackInfo& info) {
  return Napi::Boolean::New(info.Env(), kos::InputInjector::hasAccessibilityPermission());
}

// requestAccessibilityPermission()
Napi::Value RequestAccessibilityPermission(const Napi::CallbackInfo& info) {
  kos::InputInjector::requestAccessibilityPermission();
  return info.Env().Undefined();
}

Napi::Object Init(Napi::Env env, Napi::Object exports) {
  exports.Set("listSimulatorWindows", Napi::Function::New(env, ListSimulatorWindows));
  exports.Set("startCapture", Napi::Function::New(env, StartCapture));
  exports.Set("injectTap", Napi::Function::New(env, InjectTap));
  exports.Set("injectSwipe", Napi::Function::New(env, InjectSwipe));
  exports.Set("injectText", Napi::Function::New(env, InjectText));
  exports.Set("hasScreenRecordingPermission", Napi::Function::New(env, HasScreenRecordingPermission));
  exports.Set("requestScreenRecordingPermission", Napi::Function::New(env, RequestScreenRecordingPermission));
  exports.Set("hasAccessibilityPermission", Napi::Function::New(env, HasAccessibilityPermission));
  exports.Set("requestAccessibilityPermission", Napi::Function::New(env, RequestAccessibilityPermission));

  return exports;
}

NODE_API_MODULE(kos_native, Init)

} // anonymous namespace
