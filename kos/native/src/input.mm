#import "input.h"
#import <AppKit/AppKit.h>
#import <unistd.h>

namespace kos {

CGRect InputInjector::getWindowBounds(uint32_t windowId) {
  CFArrayRef windowList = CGWindowListCopyWindowInfo(
    kCGWindowListOptionIncludingWindow, windowId);

  if (!windowList) return CGRectZero;

  CGRect bounds = CGRectZero;

  if (CFArrayGetCount(windowList) > 0) {
    CFDictionaryRef windowInfo = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, 0);
    CFDictionaryRef boundsDict = (CFDictionaryRef)CFDictionaryGetValue(windowInfo, kCGWindowBounds);

    if (boundsDict) {
      CGRectMakeWithDictionaryRepresentation(boundsDict, &bounds);
    }
  }

  CFRelease(windowList);
  return bounds;
}

pid_t InputInjector::getWindowPid(uint32_t windowId) {
  CFArrayRef windowList = CGWindowListCopyWindowInfo(
    kCGWindowListOptionIncludingWindow, windowId);

  if (!windowList) return 0;

  pid_t pid = 0;

  if (CFArrayGetCount(windowList) > 0) {
    CFDictionaryRef windowInfo = (CFDictionaryRef)CFArrayGetValueAtIndex(windowList, 0);
    CFNumberRef pidRef = (CFNumberRef)CFDictionaryGetValue(windowInfo, kCGWindowOwnerPID);

    if (pidRef) {
      CFNumberGetValue(pidRef, kCFNumberIntType, &pid);
    }
  }

  CFRelease(windowList);
  return pid;
}

void InputInjector::injectTap(uint32_t windowId, float x, float y) {
  CGRect bounds = getWindowBounds(windowId);
  if (CGRectIsEmpty(bounds)) return;

  // Translate window-relative coords to screen coords
  // Note: macOS screen origin is bottom-left, but CGWindowListCopyWindowInfo
  // returns bounds with origin at top-left of screen
  CGFloat screenX = bounds.origin.x + x;
  CGFloat screenY = bounds.origin.y + y;

  CGPoint point = CGPointMake(screenX, screenY);

  // Create mouse down event
  CGEventRef mouseDown = CGEventCreateMouseEvent(
    NULL, kCGEventLeftMouseDown, point, kCGMouseButtonLeft);

  // Create mouse up event
  CGEventRef mouseUp = CGEventCreateMouseEvent(
    NULL, kCGEventLeftMouseUp, point, kCGMouseButtonLeft);

  if (mouseDown && mouseUp) {
    // Post events to the system
    CGEventPost(kCGHIDEventTap, mouseDown);
    usleep(50000); // 50ms hold for tap
    CGEventPost(kCGHIDEventTap, mouseUp);
  }

  if (mouseDown) CFRelease(mouseDown);
  if (mouseUp) CFRelease(mouseUp);
}

void InputInjector::injectSwipe(uint32_t windowId, float startX, float startY,
                                 float endX, float endY, int durationMs) {
  CGRect bounds = getWindowBounds(windowId);
  if (CGRectIsEmpty(bounds)) return;

  // Calculate screen coordinates
  CGFloat screenStartX = bounds.origin.x + startX;
  CGFloat screenStartY = bounds.origin.y + startY;
  CGFloat screenEndX = bounds.origin.x + endX;
  CGFloat screenEndY = bounds.origin.y + endY;

  // Number of steps for smooth swipe
  int steps = std::max(10, durationMs / 16); // ~60fps
  int stepDelayUs = (durationMs * 1000) / steps;

  CGFloat deltaX = (screenEndX - screenStartX) / steps;
  CGFloat deltaY = (screenEndY - screenStartY) / steps;

  CGPoint currentPoint = CGPointMake(screenStartX, screenStartY);

  // Mouse down at start
  CGEventRef mouseDown = CGEventCreateMouseEvent(
    NULL, kCGEventLeftMouseDown, currentPoint, kCGMouseButtonLeft);
  if (mouseDown) {
    CGEventPost(kCGHIDEventTap, mouseDown);
    CFRelease(mouseDown);
  }

  // Drag through points
  for (int i = 1; i <= steps; i++) {
    currentPoint.x = screenStartX + (deltaX * i);
    currentPoint.y = screenStartY + (deltaY * i);

    CGEventRef mouseDrag = CGEventCreateMouseEvent(
      NULL, kCGEventLeftMouseDragged, currentPoint, kCGMouseButtonLeft);
    if (mouseDrag) {
      CGEventPost(kCGHIDEventTap, mouseDrag);
      CFRelease(mouseDrag);
    }

    usleep(stepDelayUs);
  }

  // Mouse up at end
  CGPoint endPoint = CGPointMake(screenEndX, screenEndY);
  CGEventRef mouseUp = CGEventCreateMouseEvent(
    NULL, kCGEventLeftMouseUp, endPoint, kCGMouseButtonLeft);
  if (mouseUp) {
    CGEventPost(kCGHIDEventTap, mouseUp);
    CFRelease(mouseUp);
  }
}

void InputInjector::injectText(uint32_t windowId, const std::string& text) {
  // Convert string to NSString for easier character iteration
  NSString *nsText = [NSString stringWithUTF8String:text.c_str()];

  for (NSUInteger i = 0; i < nsText.length; i++) {
    unichar ch = [nsText characterAtIndex:i];

    // Create key down event
    CGEventRef keyDown = CGEventCreateKeyboardEvent(NULL, 0, true);
    CGEventRef keyUp = CGEventCreateKeyboardEvent(NULL, 0, false);

    if (keyDown && keyUp) {
      // Set the unicode character
      UniChar chars[1] = { ch };
      CGEventKeyboardSetUnicodeString(keyDown, 1, chars);
      CGEventKeyboardSetUnicodeString(keyUp, 1, chars);

      CGEventPost(kCGHIDEventTap, keyDown);
      usleep(10000); // 10ms between key down/up
      CGEventPost(kCGHIDEventTap, keyUp);
      usleep(20000); // 20ms between characters
    }

    if (keyDown) CFRelease(keyDown);
    if (keyUp) CFRelease(keyUp);
  }
}

bool InputInjector::hasAccessibilityPermission() {
  // Check if we have accessibility permission
  return AXIsProcessTrusted();
}

void InputInjector::requestAccessibilityPermission() {
  // Prompt for accessibility permission
  NSDictionary *options = @{(__bridge NSString *)kAXTrustedCheckOptionPrompt: @YES};
  AXIsProcessTrustedWithOptions((__bridge CFDictionaryRef)options);
}

} // namespace kos
