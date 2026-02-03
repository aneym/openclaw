#import "capture.h"
#import <AppKit/AppKit.h>
#import <dispatch/dispatch.h>

// Objective-C delegate must be at global scope
@interface SimulatorCaptureDelegate : NSObject <SCStreamDelegate, SCStreamOutput>
@property (nonatomic, assign) kos::FrameCallback frameCallback;
@property (nonatomic, assign) kos::ErrorCallback errorCallback;
@property (nonatomic, assign) size_t targetWidth;
@property (nonatomic, assign) size_t targetHeight;
@end

@implementation SimulatorCaptureDelegate

- (void)stream:(SCStream *)stream didOutputSampleBuffer:(CMSampleBufferRef)sampleBuffer ofType:(SCStreamOutputType)type {
  if (type != SCStreamOutputTypeScreen) return;

  CVImageBufferRef imageBuffer = CMSampleBufferGetImageBuffer(sampleBuffer);
  if (!imageBuffer) return;

  CVPixelBufferLockBaseAddress(imageBuffer, kCVPixelBufferLock_ReadOnly);

  size_t width = CVPixelBufferGetWidth(imageBuffer);
  size_t height = CVPixelBufferGetHeight(imageBuffer);
  size_t bytesPerRow = CVPixelBufferGetBytesPerRow(imageBuffer);
  void* baseAddress = CVPixelBufferGetBaseAddress(imageBuffer);

  if (baseAddress && self.frameCallback) {
    kos::FrameData frame;
    frame.width = width;
    frame.height = height;
    frame.bytesPerRow = bytesPerRow;
    frame.timestamp = CMTimeGetSeconds(CMSampleBufferGetPresentationTimeStamp(sampleBuffer)) * 1000;

    // Copy pixel data
    size_t dataSize = bytesPerRow * height;
    frame.buffer.resize(dataSize);
    memcpy(frame.buffer.data(), baseAddress, dataSize);

    self.frameCallback(frame);
  }

  CVPixelBufferUnlockBaseAddress(imageBuffer, kCVPixelBufferLock_ReadOnly);
}

- (void)stream:(SCStream *)stream didStopWithError:(NSError *)error {
  if (self.errorCallback && error) {
    self.errorCallback([error.localizedDescription UTF8String]);
  }
}

@end

// C++ implementation in namespace
namespace kos {

SimulatorCapture::SimulatorCapture()
    : stream_(nil), filter_(nil), delegate_(nil), running_(false) {}

SimulatorCapture::~SimulatorCapture() {
  stop();
}

std::vector<WindowInfo> SimulatorCapture::listSimulatorWindows() {
  __block std::vector<WindowInfo> result;

  dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);

  [SCShareableContent getShareableContentWithCompletionHandler:^(SCShareableContent * _Nullable content, NSError * _Nullable error) {
    if (error || !content) {
      dispatch_semaphore_signal(semaphore);
      return;
    }

    for (SCWindow *window in content.windows) {
      // Filter for Simulator windows
      NSString *bundleId = window.owningApplication.bundleIdentifier;
      if (![bundleId isEqualToString:@"com.apple.iphonesimulator"]) continue;

      // Skip windows without titles or with empty titles
      if (!window.title || window.title.length == 0) continue;

      WindowInfo info;
      info.windowId = (uint32_t)window.windowID;
      info.pid = window.owningApplication.processID;
      info.title = window.title ? [window.title UTF8String] : "";
      info.bundleId = bundleId ? [bundleId UTF8String] : "";
      info.bounds = window.frame;

      result.push_back(info);
    }

    dispatch_semaphore_signal(semaphore);
  }];

  dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC));

  return result;
}

bool SimulatorCapture::start(uint32_t windowId, int fps, float scaleFactor, bool showCursor,
                              FrameCallback onFrame, ErrorCallback onError) {
  if (running_) {
    if (onError) onError("Capture already running");
    return false;
  }

  __block SCWindow *targetWindow = nil;
  __block SCContentFilter *captureFilter = nil;
  __block bool success = false;

  dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);

  [SCShareableContent getShareableContentWithCompletionHandler:^(SCShareableContent * _Nullable content, NSError * _Nullable error) {
    if (error || !content) {
      dispatch_semaphore_signal(semaphore);
      return;
    }

    // Find the target window
    for (SCWindow *window in content.windows) {
      if (window.windowID == windowId) {
        targetWindow = window;
        break;
      }
    }

    if (!targetWindow) {
      dispatch_semaphore_signal(semaphore);
      return;
    }

    // Create content filter for just this window
    captureFilter = [[SCContentFilter alloc] initWithDesktopIndependentWindow:targetWindow];
    success = true;

    dispatch_semaphore_signal(semaphore);
  }];

  dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC));

  if (!success || !captureFilter) {
    if (onError) onError("Failed to find window or create filter");
    return false;
  }

  filter_ = captureFilter;

  // Configure stream
  SCStreamConfiguration *config = [[SCStreamConfiguration alloc] init];
  config.minimumFrameInterval = CMTimeMake(1, fps);
  config.queueDepth = 3;
  config.showsCursor = showCursor;
  config.pixelFormat = kCVPixelFormatType_32BGRA;
  config.colorSpaceName = kCGColorSpaceSRGB;

  // Set capture size based on window bounds
  CGRect bounds = targetWindow.frame;
  config.width = (size_t)(bounds.size.width * scaleFactor);
  config.height = (size_t)(bounds.size.height * scaleFactor);
  config.scalesToFit = YES;

  // Create delegate
  delegate_ = [[SimulatorCaptureDelegate alloc] init];
  delegate_.frameCallback = onFrame;
  delegate_.errorCallback = onError;
  delegate_.targetWidth = config.width;
  delegate_.targetHeight = config.height;

  // Create and start stream
  NSError *streamError = nil;
  stream_ = [[SCStream alloc] initWithFilter:filter_ configuration:config delegate:delegate_];

  // Add stream output
  dispatch_queue_t captureQueue = dispatch_queue_create("com.kos.simulatorcapture", DISPATCH_QUEUE_SERIAL);
  [stream_ addStreamOutput:delegate_ type:SCStreamOutputTypeScreen sampleHandlerQueue:captureQueue error:&streamError];

  if (streamError) {
    if (onError) onError([[streamError localizedDescription] UTF8String]);
    return false;
  }

  // Start capture
  dispatch_semaphore_t startSem = dispatch_semaphore_create(0);
  __block NSError *startError = nil;

  [stream_ startCaptureWithCompletionHandler:^(NSError * _Nullable error) {
    startError = error;
    dispatch_semaphore_signal(startSem);
  }];

  dispatch_semaphore_wait(startSem, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC));

  if (startError) {
    if (onError) onError([[startError localizedDescription] UTF8String]);
    return false;
  }

  running_ = true;
  return true;
}

void SimulatorCapture::stop() {
  if (!running_ || !stream_) return;

  dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);

  [stream_ stopCaptureWithCompletionHandler:^(NSError * _Nullable error) {
    dispatch_semaphore_signal(semaphore);
  }];

  dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC));

  stream_ = nil;
  filter_ = nil;
  delegate_ = nil;
  running_ = false;
}

bool SimulatorCapture::hasScreenRecordingPermission() {
  // Check by attempting to get shareable content
  // If permission is denied, the windows array will be empty
  __block bool hasPermission = false;
  dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);

  [SCShareableContent getShareableContentWithCompletionHandler:^(SCShareableContent * _Nullable content, NSError * _Nullable error) {
    // If we can enumerate windows, we have permission
    hasPermission = (content != nil && content.windows.count > 0);
    dispatch_semaphore_signal(semaphore);
  }];

  dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 2 * NSEC_PER_SEC));

  return hasPermission;
}

void SimulatorCapture::requestScreenRecordingPermission() {
  // Open System Preferences to Screen Recording
  NSURL *url = [NSURL URLWithString:@"x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture"];
  [[NSWorkspace sharedWorkspace] openURL:url];
}

} // namespace kos
