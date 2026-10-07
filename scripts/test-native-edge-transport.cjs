// Exercise the actual Swift transport methods with a deliberately stalled
// WebView. macOS CI runs Swift; Windows generates the harness for that gate.
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'ios/App/App/TurtleEdgeBackPlugin.swift'), 'utf8');
const begin = source.indexOf('    private func enqueueBridgeEvent(');
const end = source.indexOf('\n    deinit', begin);
assert.ok(begin >= 0 && end > begin, 'Missing production bridge queue methods');
const methods = source.slice(begin, end);
const harness = `import Foundation

final class FakeWebView {
    var scripts: [String] = []
    var completions: [(Any?, Error?) -> Void] = []
    func evaluateJavaScript(_ script: String, completionHandler: @escaping (Any?, Error?) -> Void) {
        scripts.append(script)
        completions.append(completionHandler)
        precondition(completions.count == 1, "Only one bridge evaluation may be outstanding")
    }
    func complete(_ error: Error? = nil) { completions.removeFirst()(nil, error) }
    func lastEvent() -> [String: Any] {
        let script = scripts.last!
        let start = script.range(of: "{detail: ")!.upperBound
        let end = script.range(of: "}));", options: .backwards)!.lowerBound
        return try! JSONSerialization.jsonObject(with: Data(script[start..<end].utf8)) as! [String: Any]
    }
}
final class FakeBridge { var webView: FakeWebView? = FakeWebView() }
final class Transport {
    var bridge: FakeBridge? = FakeBridge()
    private var pendingBridgeEvents: [[String: Any]] = []
    private var bridgeEventInFlight = false
    var pendingCount: Int { pendingBridgeEvents.count }
    func send(_ phase: String, _ x: Int = 0, generation: Int = 1, sequence: Int = 1) {
        enqueueBridgeEvent(["phase": phase, "x": x, "generation": generation, "sequence": sequence])
    }
${methods}
}

let transport = Transport(), web = transport.bridge!.webView!
transport.send("begin")
for x in 1...500 { transport.send("move", x) }
precondition(web.scripts.count == 1 && transport.pendingCount == 1, "Busy WebView must keep only latest position")
web.complete()
precondition(web.lastEvent()["x"] as? Int == 500, "Must deliver newest position")
for x in 501...1000 { transport.send("move", x) }
transport.send("end", 1010)
precondition(transport.pendingCount == 1, "End supersedes obsolete pending move")
web.complete()
precondition(web.lastEvent()["phase"] as? String == "end" && web.lastEvent()["x"] as? Int == 1010)
web.complete()
precondition(transport.pendingCount == 0 && web.scripts.count == 3)

transport.send("begin", generation: 2, sequence: 2)
transport.send("move", 25, generation: 2, sequence: 2)
transport.send("cancel", 30, generation: 2, sequence: 2)
transport.send("begin", generation: 3, sequence: 3)
transport.send("move", 40, generation: 3, sequence: 3)
transport.send("end", 45, generation: 3, sequence: 3)
precondition(transport.pendingCount == 3, "Terminal and next begin must remain ordered")
web.complete()
precondition(web.lastEvent()["phase"] as? String == "cancel" && web.lastEvent()["sequence"] as? Int == 2)
web.complete(NSError(domain: "Test", code: 1))
precondition(web.lastEvent()["phase"] as? String == "begin" && web.lastEvent()["generation"] as? Int == 3, "Evaluation error must not block next gesture")
web.complete()
precondition(web.lastEvent()["phase"] as? String == "end" && web.lastEvent()["x"] as? Int == 45)
web.complete()
precondition(transport.pendingCount == 0)
transport.bridge!.webView = nil
transport.send("begin")
precondition(transport.pendingCount == 0, "Missing WebView cannot retain stale events")
print("PASS: actual Swift bridge transport coalesces moves, preserves terminal ordering, and recovers from evaluation errors.")
`;
const output = path.join(root, 'output', 'native-edge-transport.swift');
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output, harness);
if (process.platform !== 'darwin' && !process.env.SWIFT_EXECUTABLE) {
  console.log('GENERATED: Swift transport harness. Not executed; macOS CI or SWIFT_EXECUTABLE is required.');
} else {
  const result = spawnSync(process.env.SWIFT_EXECUTABLE || 'swift', [output], { encoding: 'utf8', timeout: 60000 });
  process.stdout.write(result.stdout || '');
  process.stderr.write(result.stderr || '');
  if (result.error) throw result.error;
  assert.equal(result.status, 0, 'Swift transport regression failed');
}
