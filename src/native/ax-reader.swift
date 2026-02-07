import Cocoa
import ApplicationServices

// MARK: - Data Types

struct Message: Codable {
    let role: String
    let text: String
    let timestamp: String?
    let index: Int
}

struct ConversationResult: Codable {
    let type: String
    let app: String
    let pid: Int32
    let title: String
    let messages: [Message]
}

struct AppInfo: Codable {
    let name: String
    let pid: Int32
    let bundleIdentifier: String
}

struct AppsResult: Codable {
    let type: String
    let apps: [AppInfo]
}

struct ErrorResult: Codable {
    let type: String
    let code: String
    let message: String
}

struct Command: Codable {
    let command: String
    let pid: Int32?
}

// MARK: - JSON Helpers

func emit<T: Encodable>(_ value: T) {
    let encoder = JSONEncoder()
    encoder.outputFormatting = []
    if let data = try? encoder.encode(value),
       let json = String(data: data, encoding: .utf8) {
        print(json)
        fflush(stdout)
    }
}

func emitError(code: String, message: String) {
    emit(ErrorResult(type: "error", code: code, message: message))
}

// MARK: - Accessibility Helpers

func getAXAttribute(_ element: AXUIElement, _ attribute: String) -> AnyObject? {
    var value: AnyObject?
    let result = AXUIElementCopyAttributeValue(element, attribute as CFString, &value)
    return result == .success ? value : nil
}

func getAXChildren(_ element: AXUIElement) -> [AXUIElement] {
    guard let children = getAXAttribute(element, kAXChildrenAttribute) as? [AXUIElement] else {
        return []
    }
    return children
}

func getAXRole(_ element: AXUIElement) -> String? {
    return getAXAttribute(element, kAXRoleAttribute) as? String
}

func getAXTitle(_ element: AXUIElement) -> String? {
    return getAXAttribute(element, kAXTitleAttribute) as? String
}

func getAXValue(_ element: AXUIElement) -> String? {
    return getAXAttribute(element, kAXValueAttribute) as? String
}

func getAXDescription(_ element: AXUIElement) -> String? {
    return getAXAttribute(element, kAXDescriptionAttribute) as? String
}

func getDOMIdentifier(_ element: AXUIElement) -> String? {
    return getAXAttribute(element, "AXDOMIdentifier") as? String
}

func getDOMClassList(_ element: AXUIElement) -> [String] {
    guard let classList = getAXAttribute(element, "AXDOMClassList") as? [String] else {
        return []
    }
    return classList
}

func hasClass(_ element: AXUIElement, _ className: String) -> Bool {
    return getDOMClassList(element).contains(className)
}

func hasClassContaining(_ element: AXUIElement, _ substring: String) -> Bool {
    return getDOMClassList(element).contains { $0.contains(substring) }
}

// MARK: - ConversationParser Protocol

protocol ConversationParser {
    static var bundleIdentifier: String { get }
    static var appName: String { get }
    func parseConversation(from element: AXUIElement, pid: Int32) -> ConversationResult?
}

// MARK: - Claude Desktop Parser

struct ClaudeDesktopParser: ConversationParser {
    static let bundleIdentifier = "com.anthropic.claudefordesktop"
    static let appName = "Claude"

    func parseConversation(from appElement: AXUIElement, pid: Int32) -> ConversationResult? {
        // Step 1: Find AXWindow
        guard let windows = getAXAttribute(appElement, kAXWindowsAttribute) as? [AXUIElement],
              let mainWindow = windows.first else {
            emitError(code: "no_window", message: "No windows found for Claude Desktop")
            return nil
        }

        // Step 2: Find AXWebArea with non-empty title (the conversation web area)
        guard let webArea = findConversationWebArea(in: mainWindow) else {
            emitError(code: "no_webarea", message: "Could not find conversation WebArea in Claude Desktop")
            return nil
        }

        // Extract title
        let rawTitle = getAXTitle(webArea) ?? ""
        let title = rawTitle.hasSuffix(" - Claude")
            ? String(rawTitle.dropLast(" - Claude".count))
            : rawTitle

        // Step 3: Find #main-content
        guard let mainContent = findElementByDOMId(in: webArea, id: "main-content") else {
            emitError(code: "no_main_content", message: "Could not find #main-content element")
            return nil
        }

        // Step 4: Find .overflow-y-scroll (the scrollable message list)
        guard let scrollArea = findElementWithClassContaining(in: mainContent, substring: "overflow-y-scroll") else {
            emitError(code: "no_scroll_area", message: "Could not find scrollable message area (.overflow-y-scroll)")
            return nil
        }

        // Step 5: Parse messages by recursively finding elements with message classes
        var messages: [Message] = []
        var index = 0
        collectMessages(from: scrollArea, messages: &messages, index: &index)

        return ConversationResult(
            type: "conversation",
            app: ClaudeDesktopParser.appName,
            pid: pid,
            title: title,
            messages: messages
        )
    }

    // MARK: - Tree Navigation

    private func findConversationWebArea(in element: AXUIElement) -> AXUIElement? {
        let role = getAXRole(element)
        if role == "AXWebArea" {
            let title = getAXTitle(element) ?? ""
            if !title.isEmpty {
                return element
            }
        }
        for child in getAXChildren(element) {
            if let found = findConversationWebArea(in: child) {
                return found
            }
        }
        return nil
    }

    private func findElementByDOMId(in element: AXUIElement, id: String) -> AXUIElement? {
        if getDOMIdentifier(element) == id {
            return element
        }
        for child in getAXChildren(element) {
            if let found = findElementByDOMId(in: child, id: id) {
                return found
            }
        }
        return nil
    }

    private func findElementWithClassContaining(in element: AXUIElement, substring: String) -> AXUIElement? {
        if hasClassContaining(element, substring) {
            return element
        }
        for child in getAXChildren(element) {
            if let found = findElementWithClassContaining(in: child, substring: substring) {
                return found
            }
        }
        return nil
    }

    // MARK: - Message Parsing

    /// Recursively walk the tree from the scroll area to find message elements.
    /// Only match elements whose OWN classes contain the message identifiers.
    /// This avoids matching high-level wrapper divs that merely contain messages.
    private func collectMessages(from element: AXUIElement, messages: inout [Message], index: inout Int) {
        let classes = getDOMClassList(element)

        // Check own classes for user message
        if classes.contains(where: { $0.contains("font-user-message") }) {
            let text = collectStaticText(from: element).trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty {
                messages.append(Message(role: "user", text: text, timestamp: nil, index: index))
                index += 1
            }
            return // don't recurse into matched message
        }

        // Check own classes for assistant response — use exact match to avoid
        // matching "font-claude-response-body" (which is a child element)
        if classes.contains("font-claude-response") || classes.contains("!font-claude-response") {
            var text = ""
            if let responseSection = findElementWithClassContaining(in: element, substring: "row-start-2") {
                text = extractResponseText(from: responseSection)
            }
            if text.isEmpty {
                text = collectStaticText(from: element)
            }
            text = text.trimmingCharacters(in: .whitespacesAndNewlines)
            if !text.isEmpty {
                messages.append(Message(role: "assistant", text: text, timestamp: nil, index: index))
                index += 1
            }
            return // don't recurse into matched message
        }

        // Not a message element — recurse into children
        for child in getAXChildren(element) {
            collectMessages(from: child, messages: &messages, index: &index)
        }
    }

    private func extractResponseText(from section: AXUIElement) -> String {
        var parts: [String] = []
        collectResponseBodyText(from: section, into: &parts)
        return parts.joined(separator: "\n")
    }

    private func collectResponseBodyText(from element: AXUIElement, into parts: inout [String]) {
        if hasClassContaining(element, "font-claude-response-body") {
            let text = collectStaticText(from: element)
            if !text.isEmpty {
                parts.append(text)
            }
            return
        }
        for child in getAXChildren(element) {
            collectResponseBodyText(from: child, into: &parts)
        }
    }

    private func collectStaticText(from element: AXUIElement) -> String {
        let role = getAXRole(element)
        if role == "AXStaticText" {
            return getAXValue(element) ?? ""
        }
        var parts: [String] = []
        for child in getAXChildren(element) {
            let childText = collectStaticText(from: child)
            if !childText.isEmpty {
                parts.append(childText)
            }
        }
        return parts.joined(separator: "")
    }
}

// MARK: - App Discovery

func listApps() -> AppsResult {
    let workspace = NSWorkspace.shared
    let apps = workspace.runningApplications
        .filter { $0.activationPolicy == .regular }
        .compactMap { app -> AppInfo? in
            guard let name = app.localizedName,
                  let bundleId = app.bundleIdentifier else { return nil }
            return AppInfo(
                name: name,
                pid: app.processIdentifier,
                bundleIdentifier: bundleId
            )
        }
    return AppsResult(type: "apps", apps: apps)
}

// MARK: - Main

func main() {
    let parsers: [String: ConversationParser] = [
        ClaudeDesktopParser.bundleIdentifier: ClaudeDesktopParser()
    ]

    // Read commands from stdin
    while let line = readLine() {
        guard let data = line.data(using: .utf8),
              let command = try? JSONDecoder().decode(Command.self, from: data) else {
            emitError(code: "invalid_command", message: "Could not parse command: \(line)")
            continue
        }

        switch command.command {
        case "list-apps":
            emit(listApps())

        case "read-conversation":
            guard let pid = command.pid else {
                emitError(code: "missing_pid", message: "read-conversation requires a pid field")
                continue
            }

            let appElement = AXUIElementCreateApplication(pid)

            // Find which parser to use by matching bundle identifier
            let workspace = NSWorkspace.shared
            let runningApp = workspace.runningApplications.first { $0.processIdentifier == pid }
            let bundleId = runningApp?.bundleIdentifier ?? ""

            if let parser = parsers[bundleId] {
                if let conversation = parser.parseConversation(from: appElement, pid: pid) {
                    emit(conversation)
                }
            } else {
                emitError(
                    code: "unsupported_app",
                    message: "No parser available for \(runningApp?.localizedName ?? "unknown") (\(bundleId))"
                )
            }

        case "stop":
            break

        default:
            emitError(code: "unknown_command", message: "Unknown command: \(command.command)")
        }
    }
}

main()
