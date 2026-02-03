{
  "targets": [
    {
      "target_name": "kos_native",
      "cflags!": ["-fno-exceptions"],
      "cflags_cc!": ["-fno-exceptions"],
      "sources": [
        "src/addon.mm",
        "src/capture.mm",
        "src/input.mm"
      ],
      "include_dirs": [
        "<!@(node -p \"require('node-addon-api').include\")",
        "src"
      ],
      "defines": ["NAPI_DISABLE_CPP_EXCEPTIONS"],
      "conditions": [
        ["OS=='mac'", {
          "xcode_settings": {
            "GCC_ENABLE_CPP_EXCEPTIONS": "YES",
            "CLANG_ENABLE_OBJC_ARC": "YES",
            "MACOSX_DEPLOYMENT_TARGET": "14.0",
            "OTHER_CFLAGS": [
              "-ObjC++",
              "-std=c++17"
            ]
          },
          "link_settings": {
            "libraries": [
              "-framework ScreenCaptureKit",
              "-framework CoreGraphics",
              "-framework CoreMedia",
              "-framework CoreVideo",
              "-framework ApplicationServices",
              "-framework AppKit",
              "-framework Foundation"
            ]
          }
        }]
      ]
    }
  ]
}
