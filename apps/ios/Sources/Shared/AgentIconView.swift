import SwiftUI

struct AgentIconView: View {
    let emoji: String?
    let avatarUrl: String?
    var size: CGFloat = 20

    var body: some View {
        if let image = self.decodeDataUriImage(self.avatarUrl) {
            Image(uiImage: image)
                .resizable()
                .scaledToFill()
                .frame(width: self.size, height: self.size)
                .clipShape(RoundedRectangle(cornerRadius: self.size * 0.28, style: .continuous))
        } else if let emoji = self.emoji?.trimmingCharacters(in: .whitespacesAndNewlines), !emoji.isEmpty {
            Text(emoji)
                .font(.system(size: self.size * 0.9))
                .frame(width: self.size, height: self.size)
        } else {
            Image(systemName: "sparkles")
                .font(.system(size: self.size * 0.75, weight: .semibold))
                .frame(width: self.size, height: self.size)
                .foregroundStyle(.secondary)
        }
    }

    private func decodeDataUriImage(_ uri: String?) -> UIImage? {
        guard let uri, !uri.isEmpty else { return nil }
        guard uri.hasPrefix("data:") else { return nil }
        guard let comma = uri.firstIndex(of: ",") else { return nil }
        let meta = uri[..<comma]
        guard meta.contains(";base64") else { return nil }
        let b64 = uri[uri.index(after: comma)...]
        guard let data = Data(base64Encoded: String(b64), options: [.ignoreUnknownCharacters]) else {
            return nil
        }
        return UIImage(data: data)
    }
}

