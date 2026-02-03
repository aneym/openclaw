#pragma once

#import <Foundation/Foundation.h>
#import <ScreenCaptureKit/ScreenCaptureKit.h>
#import <CoreMedia/CoreMedia.h>
#import <CoreVideo/CoreVideo.h>
#include <napi.h>
#include <functional>
#include <memory>

// Forward declaration of Objective-C class (must be at global scope)
@class SimulatorCaptureDelegate;

namespace kos {

struct WindowInfo {
  uint32_t windowId;
  pid_t pid;
  std::string title;
  std::string bundleId;
  CGRect bounds;
};

struct FrameData {
  std::vector<uint8_t> buffer;
  size_t width;
  size_t height;
  size_t bytesPerRow;
  uint64_t timestamp;
};

using FrameCallback = std::function<void(const FrameData&)>;
using ErrorCallback = std::function<void(const std::string&)>;

class SimulatorCapture {
public:
  SimulatorCapture();
  ~SimulatorCapture();

  // List all Simulator windows
  static std::vector<WindowInfo> listSimulatorWindows();

  // Start capture for a specific window
  bool start(uint32_t windowId, int fps, float scaleFactor, bool showCursor,
             FrameCallback onFrame, ErrorCallback onError);

  // Stop capture
  void stop();

  // Permission checks
  static bool hasScreenRecordingPermission();
  static void requestScreenRecordingPermission();

private:
  SCStream* stream_;
  SCContentFilter* filter_;
  SimulatorCaptureDelegate* delegate_;
  bool running_;
};

} // namespace kos
