import OpenClawChatUI
import OpenClawKit
import Observation
import SwiftUI
import UIKit

@MainActor
@Observable
final class ChatInboxModel {
    var isLoading = false
    var errorText: String?
    var sessions: [OpenClawChatSessionEntry] = []

    private let transport: IOSGatewayChatTransport

    init(gateway: GatewayNodeSession) {
        self.transport = IOSGatewayChatTransport(gateway: gateway)
    }

    func refresh(limit: Int? = 250) {
        Task { await self.performRefresh(limit: limit) }
    }

    private func performRefresh(limit: Int?) async {
        guard !self.isLoading else { return }
        self.isLoading = true
        defer { self.isLoading = false }

        do {
            let res = try await self.transport.listSessions(limit: limit)
            self.sessions = res.sessions
            self.errorText = nil
        } catch {
            self.errorText = error.localizedDescription
        }
    }
}

private struct ChatInboxListContent: View {
    let activeAgentName: String
    let threads: [OpenClawChatSessionEntry]
    let titleForSession: (OpenClawChatSessionEntry) -> String
    let previewForSession: (OpenClawChatSessionEntry) -> String?
    let badgeForSession: (OpenClawChatSessionEntry) -> String?

    let onOpenMain: () -> Void
    let onOpenThreadKey: (String) -> Void
    let onRenameThread: (OpenClawChatSessionEntry) -> Void

    let errorText: String?
    let onCopyError: (String) -> Void

    var body: some View {
        List {
            Section {
                Button(action: self.onOpenMain) {
                    ThreadRow(
                        title: "Main",
                        preview: "Your default chat surface for \(self.activeAgentName).",
                        updatedAt: nil,
                        badge: self.activeAgentName)
                }
            }

            Section("Threads") {
                ForEach(self.threads) { session in
                    Button {
                        self.onOpenThreadKey(session.key)
                    } label: {
                        ThreadRow(
                            title: self.titleForSession(session),
                            preview: self.previewForSession(session),
                            updatedAt: session.updatedAt,
                            badge: self.badgeForSession(session))
                    }
                    .contextMenu {
                        Button("Rename") { self.onRenameThread(session) }
                    }
                }

                if self.threads.isEmpty {
                    Text("No threads yet.")
                        .foregroundStyle(.secondary)
                }
            }

            if let err = self.errorText, !err.isEmpty {
                Section {
                    Text(err)
                        .font(.footnote)
                        .foregroundStyle(.secondary)
                        .textSelection(.enabled)
                        .frame(maxWidth: .infinity, alignment: .leading)
                        .contentShape(Rectangle())
                        .onTapGesture { self.onCopyError(err) }
                        .contextMenu {
                            Button("Copy") { self.onCopyError(err) }
                        }
                } header: {
                    Text("Error")
                } footer: {
                    Text("Tap to copy.")
                }
            }
        }
    }
}

struct ChatInboxSheet: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(NodeAppModel.self) private var appModel

    @State private var model: ChatInboxModel
    @State private var navPath: [String] = []
    @State private var showAllAgents: Bool = false

    @State private var renamingKey: String?
    @State private var renameText: String = ""

    @State private var copiedToastText: String?
    @State private var copiedToastDismissTask: Task<Void, Never>?

    private let gateway: GatewayNodeSession

    init(gateway: GatewayNodeSession) {
        self.gateway = gateway
        self._model = State(initialValue: ChatInboxModel(gateway: gateway))
    }

    var body: some View {
        NavigationStack(path: self.$navPath) {
            ChatInboxListContent(
                activeAgentName: self.appModel.activeAgentName,
                threads: self.filteredThreads,
                titleForSession: self.sessionTitle,
                previewForSession: self.sessionPreview,
                badgeForSession: self.sessionBadge,
                onOpenMain: { self.navPath.append(self.parentSessionKey()) },
                onOpenThreadKey: { self.navPath.append($0) },
                onRenameThread: { session in
                    self.renamingKey = session.key
                    self.renameText = self.sessionTitle(session)
                },
                errorText: self.model.errorText,
                onCopyError: { self.copyTextToPasteboard($0, toast: "Copied error") })
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(self.backgroundSurface)
            .navigationTitle("Chat")
            .navigationBarTitleDisplayMode(.inline)
            .overlay(alignment: .top) { self.copyToastOverlay }
            .toolbar { self.inboxToolbar }
            .navigationDestination(for: String.self) { sessionKey in
                ChatThreadView(
                    gateway: self.gateway,
                    sessionKey: sessionKey,
                    userAccent: self.appModel.seamColor)
            }
            .refreshable {
                self.model.refresh()
            }
            .onAppear {
                self.model.refresh()
            }
            .onDisappear {
                self.copiedToastDismissTask?.cancel()
                self.copiedToastDismissTask = nil
            }
            .alert("Rename thread", isPresented: self.renameAlertPresented) {
                TextField("Name", text: self.$renameText)
                Button("Save") { self.applyRename() }
                Button("Cancel", role: .cancel) { self.renamingKey = nil }
            } message: {
                Text("Set a custom name for this thread.")
            }
        }
    }

    @ViewBuilder
    private var copyToastOverlay: some View {
        if let copiedToastText, !copiedToastText.isEmpty {
            Text(copiedToastText)
                .font(.footnote.weight(.semibold))
                .foregroundStyle(.primary)
                .padding(.horizontal, 12)
                .padding(.vertical, 8)
                .background(.ultraThinMaterial)
                .clipShape(Capsule())
                .padding(.top, 10)
                .transition(.move(edge: .top).combined(with: .opacity))
        }
    }

    private var renameAlertPresented: Binding<Bool> {
        Binding(
            get: { self.renamingKey != nil },
            set: { if !$0 { self.renamingKey = nil } })
    }

    private var backgroundSurface: some View {
        ZStack {
            LinearGradient(
                colors: [
                    self.appModel.seamColor.opacity(0.18),
                    Color.black.opacity(0.92),
                    Color.black,
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing)
            Rectangle()
                .fill(.ultraThinMaterial)
                .opacity(0.35)
        }
        .ignoresSafeArea()
    }

    @ToolbarContentBuilder
    private var inboxToolbar: some ToolbarContent {
                ToolbarItem(placement: .topBarLeading) {
                    Menu {
                        Toggle("Show all agents", isOn: self.$showAllAgents)

                        if !self.appModel.gatewayAgents.isEmpty {
                            Divider()
                            ForEach(self.appModel.gatewayAgents, id: \.id) { agent in
                                let agentName = (agent.name ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
                                Button(agentName.isEmpty ? agent.id : agentName) {
                                    self.appModel.setSelectedAgentId(agent.id)
                                    self.model.refresh()
                                }
                            }
                    Button("Default agent") {
                        self.appModel.setSelectedAgentId(nil)
                        self.model.refresh()
                    }
                }
                } label: {
                    HStack(spacing: 6) {
                        let active = self.appModel.gatewayAgents.first(where: { $0.id == self.resolvedAgentId() })
                        AgentIconView(emoji: active?.identityEmoji, avatarUrl: active?.identityAvatarUrl, size: 18)
                        Text(self.appModel.activeAgentName)
                            .lineLimit(1)
                        Image(systemName: "chevron.down")
                            .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                }
            }
        }

        ToolbarItem(placement: .topBarTrailing) {
            Button(action: self.createThreadAndOpen) {
                Image(systemName: "plus")
            }
            .accessibilityLabel("New thread")
        }

        ToolbarItem(placement: .topBarTrailing) {
            Button(action: self.dismiss.callAsFunction) {
                Image(systemName: "xmark")
            }
            .accessibilityLabel("Close")
        }
    }

    private func copyTextToPasteboard(_ text: String, toast: String) {
        UIPasteboard.general.string = text
        self.copiedToastDismissTask?.cancel()
        withAnimation(.spring(response: 0.25, dampingFraction: 0.86)) {
            self.copiedToastText = toast
        }
        self.copiedToastDismissTask = Task {
            try? await Task.sleep(nanoseconds: 1_200_000_000)
            await MainActor.run {
                withAnimation(.easeOut(duration: 0.25)) {
                    self.copiedToastText = nil
                }
            }
        }
    }

    private var filteredThreads: [OpenClawChatSessionEntry] {
        let sessions = self.model.sessions
        let filteredByAgent: [OpenClawChatSessionEntry]
        if self.showAllAgents {
            filteredByAgent = sessions
        } else {
            let agentId = self.resolvedAgentId()
            filteredByAgent = sessions.filter { self.agentIdFromSessionKey($0.key) == agentId }
        }
        return filteredByAgent
            .filter { $0.key.contains(":thread:") }
            .sorted { ($0.updatedAt ?? 0) > ($1.updatedAt ?? 0) }
    }

    private func createThreadAndOpen() {
        let id = UUID().uuidString.lowercased()
        let sessionKey = "\(self.parentSessionKey()):thread:\(id)"
        Task {
            // Best-effort: set a friendly label immediately so the inbox doesn't show an ugly auto-derived name.
            try? await self.sessionsPatchLabel(key: sessionKey, label: "New thread")
            await MainActor.run {
                self.model.refresh()
                self.navPath.append(sessionKey)
            }
        }
    }

    private func applyRename() {
        guard let key = self.renamingKey else { return }
        let trimmed = self.renameText.trimmingCharacters(in: .whitespacesAndNewlines)
        self.renamingKey = nil
        guard !trimmed.isEmpty else { return }

        Task {
            try? await self.sessionsPatchLabel(key: key, label: trimmed)
            await MainActor.run { self.model.refresh() }
        }
    }

    private func sessionsPatchLabel(key: String, label: String) async throws {
        struct Params: Codable {
            var key: String
            var label: String?
        }
        let data = try JSONEncoder().encode(Params(key: key, label: label))
        let json = String(data: data, encoding: .utf8)
        _ = try await self.gateway.request(method: "sessions.patch", paramsJSON: json, timeoutSeconds: 12)
    }

    private func resolvedAgentId() -> String {
        let selected = (self.appModel.selectedAgentId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !selected.isEmpty { return selected }
        let def = (self.appModel.gatewayDefaultAgentId ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        if !def.isEmpty { return def }
        return "main"
    }

    private func parentSessionKey() -> String {
        // For web/kOS parity, default iOS threads to the `webchat` surface.
        SessionKey.makeAgentSessionKey(agentId: self.resolvedAgentId(), baseKey: "webchat")
    }

    private func agentIdFromSessionKey(_ key: String) -> String? {
        let parts = key.split(separator: ":").map(String.init)
        guard parts.count >= 3 else { return nil }
        guard parts[0] == "agent" else { return nil }
        return parts[1].trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private func sessionTitle(_ session: OpenClawChatSessionEntry) -> String {
        let candidates = [
            session.displayName,
            session.derivedTitle,
            session.label,
        ]
        for raw in candidates {
            let trimmed = (raw ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty { return trimmed }
        }
        return self.humanizeSessionKey(session.key)
    }

    private func sessionPreview(_ session: OpenClawChatSessionEntry) -> String? {
        let trimmed = (session.lastMessagePreview ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    private func sessionBadge(_ session: OpenClawChatSessionEntry) -> String? {
        let channel = (session.channel ?? session.surface ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
        return channel.isEmpty ? nil : channel
    }

    private func humanizeSessionKey(_ key: String) -> String {
        let parts = key.split(separator: ":").map(String.init)
        if parts.first == "agent", parts.count >= 3 {
            let surface = parts[2]
            if let threadIdx = parts.firstIndex(of: "thread"), threadIdx + 1 < parts.count {
                let id = parts[threadIdx + 1]
                return "Thread \(id.prefix(6))"
            }
            return surface.isEmpty ? String(key.prefix(30)) : surface
        }
        return String(key.prefix(30))
    }
}

private struct ThreadRow: View {
    let title: String
    let preview: String?
    let updatedAt: Double?
    let badge: String?

    var body: some View {
        HStack(alignment: .firstTextBaseline, spacing: 12) {
            VStack(alignment: .leading, spacing: 4) {
                HStack(spacing: 8) {
                    Text(self.title)
                        .font(.headline)
                        .lineLimit(1)
                    if let badge = self.badge, !badge.isEmpty {
                        Text(badge)
                            .font(.caption.weight(.semibold))
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(.thinMaterial, in: Capsule())
                            .foregroundStyle(.secondary)
                            .lineLimit(1)
                    }
                }
                if let preview = self.preview, !preview.isEmpty {
                    Text(preview)
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
            }
            Spacer(minLength: 8)
            if let updatedAt = self.updatedAt {
                Text(Self.relativeTime(ms: updatedAt))
                    .font(.caption)
                    .foregroundStyle(.secondary)
                    .lineLimit(1)
            }
        }
        .padding(.vertical, 6)
    }

    private static func relativeTime(ms: Double) -> String {
        let date = Date(timeIntervalSince1970: ms / 1000.0)
        let f = RelativeDateTimeFormatter()
        f.unitsStyle = .abbreviated
        return f.localizedString(for: date, relativeTo: Date())
    }
}

private struct ChatThreadView: View {
    @State private var viewModel: OpenClawChatViewModel
    private let userAccent: Color?
    private let sessionKey: String

    init(gateway: GatewayNodeSession, sessionKey: String, userAccent: Color?) {
        let transport = IOSGatewayChatTransport(gateway: gateway)
        self._viewModel = State(initialValue: OpenClawChatViewModel(sessionKey: sessionKey, transport: transport))
        self.sessionKey = sessionKey
        self.userAccent = userAccent
    }

    var body: some View {
        OpenClawChatView(
            viewModel: self.viewModel,
            showsSessionSwitcher: false,
            userAccent: self.userAccent)
            .navigationTitle("Thread")
            .navigationBarTitleDisplayMode(.inline)
    }
}
