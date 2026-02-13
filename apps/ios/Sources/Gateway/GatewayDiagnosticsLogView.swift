import SwiftUI
import UIKit

struct GatewayDiagnosticsLogView: View {
    @State private var logText: String = ""
    @State private var lastUpdated: Date?

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 10) {
                if let lastUpdated {
                    Text("Updated \(lastUpdated.formatted(date: .abbreviated, time: .standard))")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }

                if self.logText.isEmpty {
                    Text("No diagnostics yet.")
                        .foregroundStyle(.secondary)
                        .frame(maxWidth: .infinity, alignment: .leading)
                } else {
                    Text(self.logText)
                        .font(.system(size: 12, weight: .regular, design: .monospaced))
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .padding(12)
                        .background(.thinMaterial, in: RoundedRectangle(cornerRadius: 14, style: .continuous))
                        .contentShape(Rectangle())
                        .onTapGesture { self.copyLog() }
                        .contextMenu {
                            Button("Copy") { self.copyLog() }
                        }
                }
            }
            .padding()
        }
        .navigationTitle("Gateway Diagnostics")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Refresh") { self.load() }
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Copy") { self.copyLog() }
                    .disabled(self.logText.isEmpty)
            }
            ToolbarItem(placement: .topBarTrailing) {
                Button("Clear", role: .destructive) {
                    GatewayDiagnostics.reset()
                    self.load()
                }
            }
        }
        .onAppear {
            self.load()
        }
    }

    private func load() {
        self.logText = GatewayDiagnostics.read() ?? ""
        self.lastUpdated = Date()
    }

    private func copyLog() {
        guard !self.logText.isEmpty else { return }
        UIPasteboard.general.string = self.logText
    }
}

