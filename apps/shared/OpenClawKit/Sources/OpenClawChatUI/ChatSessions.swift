import Foundation

public struct OpenClawChatSessionsDefaults: Codable, Sendable {
    public let model: String?
    public let contextTokens: Int?
}

public struct OpenClawChatSessionEntry: Codable, Identifiable, Sendable, Hashable {
    public var id: String { self.key }

    public let key: String
    public let kind: String?
    public let label: String?
    public let icon: String?
    public let displayName: String?
    public let derivedTitle: String?
    public let lastMessagePreview: String?
    public let channel: String?
    public let surface: String?
    public let subject: String?
    public let room: String?
    public let space: String?
    public let updatedAt: Double?
    public let sessionId: String?

    public let systemSent: Bool?
    public let abortedLastRun: Bool?
    public let thinkingLevel: String?
    public let verboseLevel: String?

    public let inputTokens: Int?
    public let outputTokens: Int?
    public let totalTokens: Int?

    public let model: String?
    public let contextTokens: Int?

    public let archivedAt: Double?

    public init(
        key: String,
        kind: String? = nil,
        label: String? = nil,
        icon: String? = nil,
        displayName: String? = nil,
        derivedTitle: String? = nil,
        lastMessagePreview: String? = nil,
        channel: String? = nil,
        surface: String? = nil,
        subject: String? = nil,
        room: String? = nil,
        space: String? = nil,
        updatedAt: Double? = nil,
        sessionId: String? = nil,
        systemSent: Bool? = nil,
        abortedLastRun: Bool? = nil,
        thinkingLevel: String? = nil,
        verboseLevel: String? = nil,
        inputTokens: Int? = nil,
        outputTokens: Int? = nil,
        totalTokens: Int? = nil,
        model: String? = nil,
        contextTokens: Int? = nil,
        archivedAt: Double? = nil)
    {
        self.key = key
        self.kind = kind
        self.label = label
        self.icon = icon
        self.displayName = displayName
        self.derivedTitle = derivedTitle
        self.lastMessagePreview = lastMessagePreview
        self.channel = channel
        self.surface = surface
        self.subject = subject
        self.room = room
        self.space = space
        self.updatedAt = updatedAt
        self.sessionId = sessionId
        self.systemSent = systemSent
        self.abortedLastRun = abortedLastRun
        self.thinkingLevel = thinkingLevel
        self.verboseLevel = verboseLevel
        self.inputTokens = inputTokens
        self.outputTokens = outputTokens
        self.totalTokens = totalTokens
        self.model = model
        self.contextTokens = contextTokens
        self.archivedAt = archivedAt
    }
}

public struct OpenClawChatSessionsListResponse: Codable, Sendable {
    public let ts: Double?
    public let path: String?
    public let count: Int?
    public let defaults: OpenClawChatSessionsDefaults?
    public let sessions: [OpenClawChatSessionEntry]
}
