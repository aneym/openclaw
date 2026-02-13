import Foundation
import OpenClawProtocol

extension AgentSummary {
    var identityName: String? {
        let raw = (self.identity?["name"]?.value as? String) ?? ""
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    var identityEmoji: String? {
        let raw = (self.identity?["emoji"]?.value as? String) ?? ""
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }

    var identityAvatarUrl: String? {
        let raw = (self.identity?["avatarUrl"]?.value as? String) ?? ""
        let trimmed = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        return trimmed.isEmpty ? nil : trimmed
    }
}

