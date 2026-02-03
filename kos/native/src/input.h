#pragma once

#import <Foundation/Foundation.h>
#import <ApplicationServices/ApplicationServices.h>
#import <AppKit/AppKit.h>
#include <string>

namespace kos {

class InputInjector {
public:
  // Inject a tap at window-relative coordinates
  static void injectTap(uint32_t windowId, float x, float y);

  // Inject a swipe gesture
  static void injectSwipe(uint32_t windowId, float startX, float startY,
                          float endX, float endY, int durationMs);

  // Inject text input
  static void injectText(uint32_t windowId, const std::string& text);

  // Permission checks
  static bool hasAccessibilityPermission();
  static void requestAccessibilityPermission();

private:
  // Get window bounds for coordinate translation
  static CGRect getWindowBounds(uint32_t windowId);

  // Get the PID for a window
  static pid_t getWindowPid(uint32_t windowId);
};

} // namespace kos
