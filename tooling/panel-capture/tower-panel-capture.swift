// tower-panel-capture.swift
//
// Screenshots the game's window on a timer, reads the Wave Info panel out of each screenshot with
// the system text recogniser, and writes what it read to a CSV and a JSONL file. It keeps the
// screenshots that matter (the ones either side of any change) and deletes the rest.
//
// Run from this folder:
//
//   caffeinate -dim swift -swift-version 5 tower-panel-capture.swift
//
// Options:
//   --interval <seconds>   Time between captures (default 45).
//   --out <dir>            Where to write (default ./out/<start time>).
//   --app <name>           Window owner to capture (default "The Tower").
//   --keep-every <n>       Also keep every nth screenshot as an audit sample (default 20, 0 = off).
//   --keep-all             Keep every screenshot.
//   --hours <n>            Stop after this many hours (default: run until Ctrl-C).
//   --once                 One capture, then exit.
//   --ocr-file <image>     Read one existing image, print what was parsed, and exit. No capture.
//   --where                Print the mouse position as window fractions once a second, to find
//                          the two points --reopen needs. No capture.
//   --reopen cx,cy,ox,oy   Before each capture, click the panel's close button at (cx,cy) and
//                          then whatever opens the panel at (ox,oy). Fractions of the window,
//                          from --where. OFF unless given: it sends real mouse clicks to the game.
//
// The Wave Info panel has to be open for a capture to be useful. If the panel does not update
// by itself while open, the CSV's `stale` column will read `yes` (panel wave far behind the wave
// in the header bar) and you need --reopen.
//
// Permissions (System Settings > Privacy & Security), for the app you run this from:
//   Screen & System Audio Recording — always.
//   Accessibility — only for --reopen.

import AppKit
import CoreGraphics
import Foundation
import ImageIO
import Vision

// MARK: - Arguments

struct Options {
    var interval: Double = 45
    var outDir: String? = nil
    var app = "The Tower"
    var keepEvery = 20
    var keepAll = false
    var hours: Double? = nil
    var once = false
    var ocrFile: String? = nil
    var whereMode = false
    var reopen: [Double]? = nil
}

func fail(_ message: String) -> Never {
    FileHandle.standardError.write((message + "\n").data(using: .utf8)!)
    exit(1)
}

func parseOptions() -> Options {
    var options = Options()
    var args = Array(CommandLine.arguments.dropFirst())
    func value(_ flag: String) -> String {
        guard !args.isEmpty else { fail("\(flag) needs a value") }
        return args.removeFirst()
    }
    while !args.isEmpty {
        let flag = args.removeFirst()
        switch flag {
        case "--interval":
            guard let v = Double(value(flag)), v >= 2 else { fail("--interval needs a number of seconds, 2 or more") }
            options.interval = v
        case "--out": options.outDir = value(flag)
        case "--app": options.app = value(flag)
        case "--keep-every":
            guard let v = Int(value(flag)), v >= 0 else { fail("--keep-every needs a whole number") }
            options.keepEvery = v
        case "--keep-all": options.keepAll = true
        case "--hours":
            guard let v = Double(value(flag)), v > 0 else { fail("--hours needs a positive number") }
            options.hours = v
        case "--once": options.once = true
        case "--ocr-file": options.ocrFile = value(flag)
        case "--where": options.whereMode = true
        case "--reopen":
            let parts = value(flag).split(separator: ",").compactMap { Double($0) }
            guard parts.count == 4, parts.allSatisfy({ $0 >= 0 && $0 <= 1 }) else {
                fail("--reopen needs four fractions between 0 and 1: closeX,closeY,openX,openY")
            }
            options.reopen = parts
        default: fail("unknown option: \(flag)")
        }
    }
    return options
}

// MARK: - Finding and capturing the window

struct GameWindow {
    let id: CGWindowID
    let bounds: CGRect
}

func findWindow(owner: String) -> GameWindow? {
    let listOptions: CGWindowListOption = [.optionOnScreenOnly, .excludeDesktopElements]
    guard let list = CGWindowListCopyWindowInfo(listOptions, kCGNullWindowID) as? [[String: Any]] else { return nil }
    var best: GameWindow? = nil
    for entry in list {
        guard (entry[kCGWindowOwnerName as String] as? String) == owner,
              (entry[kCGWindowLayer as String] as? Int) == 0,
              let number = entry[kCGWindowNumber as String] as? Int,
              let boundsDict = entry[kCGWindowBounds as String] as? NSDictionary,
              let bounds = CGRect(dictionaryRepresentation: boundsDict) else { continue }
        if best == nil || bounds.width * bounds.height > best!.bounds.width * best!.bounds.height {
            best = GameWindow(id: CGWindowID(number), bounds: bounds)
        }
    }
    return best
}

func capture(_ window: GameWindow, to path: String) -> Bool {
    let process = Process()
    process.executableURL = URL(fileURLWithPath: "/usr/sbin/screencapture")
    // -x no sound, -o no window shadow, -l capture this window id.
    process.arguments = ["-x", "-o", "-l\(window.id)", path]
    do { try process.run() } catch { return false }
    process.waitUntilExit()
    return process.terminationStatus == 0 && FileManager.default.fileExists(atPath: path)
}

func click(at point: CGPoint) {
    let source = CGEventSource(stateID: .hidSystemState)
    for type in [CGEventType.leftMouseDown, CGEventType.leftMouseUp] {
        let event = CGEvent(mouseEventSource: source, mouseType: type, mouseCursorPosition: point, mouseButton: .left)
        event?.post(tap: .cghidEventTap)
        Thread.sleep(forTimeInterval: 0.08)
    }
}

func pointIn(_ window: GameWindow, fx: Double, fy: Double) -> CGPoint {
    CGPoint(x: window.bounds.minX + window.bounds.width * fx, y: window.bounds.minY + window.bounds.height * fy)
}

// MARK: - Reading the panel

struct Word {
    let text: String
    let box: CGRect // Vision's normalised box: origin bottom-left, 0...1.
}

func recognise(imageAt path: String) -> [Word]? {
    guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil),
          let image = CGImageSourceCreateImageAtIndex(source, 0, nil) else { return nil }
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = .accurate
    request.usesLanguageCorrection = false
    let handler = VNImageRequestHandler(cgImage: image, options: [:])
    do { try handler.perform([request]) } catch { return nil }
    return (request.results ?? []).compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        return Word(text: candidate.string, box: observation.boundingBox)
    }
}

/// Words that sit on one line of the image, left to right.
func groupIntoRows(_ words: [Word]) -> [[Word]] {
    var rows: [[Word]] = []
    for word in words.sorted(by: { $0.box.midY > $1.box.midY }) {
        if let last = rows.last, let anchor = last.first, abs(anchor.box.midY - word.box.midY) < max(anchor.box.height, word.box.height) * 0.6 {
            rows[rows.count - 1].append(word)
        } else {
            rows.append([word])
        }
    }
    return rows.map { $0.sorted(by: { $0.box.minX < $1.box.minX }) }
}

func firstMatch(_ pattern: String, in text: String) -> [String]? {
    guard let regex = try? NSRegularExpression(pattern: pattern, options: [.caseInsensitive]) else { return nil }
    let range = NSRange(text.startIndex..., in: text)
    guard let match = regex.firstMatch(in: text, options: [], range: range) else { return nil }
    return (0..<match.numberOfRanges).map { index in
        guard let r = Range(match.range(at: index), in: text) else { return "" }
        return String(text[r])
    }
}

let enemyNames = ["Basic", "Fast", "Tank", "Ranged", "Boss", "Protector", "Vampire", "Scatter", "Ray", "Saboteur", "Commander", "Overcharge"]
let columnNames = ["chance", "health", "attack", "speed", "mass"]

struct Reading {
    var tier: Int? = nil
    var panelWave: Int? = nil
    var headerWave: Int? = nil
    var enemies: [String: [String]] = [:] // name -> the five column values, as written
    var activeEnemies: Int? = nil
    var spawnRate: Int? = nil
    var attackSkips: Int? = nil
    var healthSkips: Int? = nil
    var rowsFoundByPosition: [String] = []

    var panelOpen: Bool { tier != nil && panelWave != nil }
    var stale: Bool {
        guard let panel = panelWave, let header = headerWave else { return false }
        return abs(header - panel) > 2
    }
    /// What must change for a screenshot to be worth keeping: every chance, and the spawn rate.
    var signature: String {
        let chances = enemyNames.map { enemies[$0]?.first ?? "?" }.joined(separator: "|")
        return "\(tier ?? -1)|\(chances)|\(spawnRate ?? -1)"
    }
    var complete: Bool {
        // Five values per row, and a chance that reads as a percentage ("%8" is a misread).
        panelOpen && enemyNames.allSatisfy { name in
            guard let values = enemies[name], values.count == 5 else { return false }
            return firstMatch(#"^\d+(\.\d+)?%$"#, in: values[0]) != nil
        } && spawnRate != nil && attackSkips != nil && healthSkips != nil
    }
}

/// The whole-number word nearest in height to `label`, to its right.
func numberBeside(_ label: Word, in words: [Word]) -> Int? {
    var best: (distance: CGFloat, value: Int)? = nil
    for word in words where word.box.minX > label.box.maxX {
        guard let value = Int(word.text.trimmingCharacters(in: .whitespaces)) else { continue }
        let distance = abs(word.box.midY - label.box.midY)
        if distance < 0.03, best == nil || distance < best!.distance { best = (distance, value) }
    }
    return best?.value
}

func parse(_ words: [Word]) -> Reading {
    var reading = Reading()
    for word in words {
        if reading.panelWave == nil, let m = firstMatch(#"Tier\s*(\d+)\s*[-–—]\s*Wave\s*(\d+)"#, in: word.text) {
            reading.tier = Int(m[1])
            reading.panelWave = Int(m[2])
        }
        // The battle header above the panel: "1602 / 1620".
        if reading.headerWave == nil, word.box.midY > 0.85, let m = firstMatch(#"^\s*(\d+)\s*/\s*(\d+)\s*$"#, in: word.text) {
            reading.headerWave = Int(m[1])
        }
        if reading.spawnRate == nil, let m = firstMatch(#"^\s*(\d+)\s*\((\d+)\)\s*$"#, in: word.text) {
            reading.activeEnemies = Int(m[1])
            reading.spawnRate = Int(m[2])
        }
        if word.text.range(of: "Attack Level", options: .caseInsensitive) != nil {
            reading.attackSkips = numberBeside(word, in: words)
        }
        if word.text.range(of: "Health Level", options: .caseInsensitive) != nil {
            reading.healthSkips = numberBeside(word, in: words)
        }
    }
    // The twelve enemy rows, top to bottom. A row is normally found by its label. The recogniser
    // sometimes drops a label, leaving five bare values; such a row is accepted only by position,
    // and only when all twelve rows are present and every label that WAS read is in its place.
    var table: [(name: String?, values: [String])] = []
    for row in groupIntoRows(words) {
        let tokens = row.flatMap { $0.text.split(separator: " ").map(String.init) }
        guard let first = tokens.first else { continue }
        if let name = enemyNames.first(where: { $0.caseInsensitiveCompare(first) == .orderedSame }) {
            if !table.contains(where: { $0.name == name }) { table.append((name, Array(tokens.dropFirst()))) }
        } else if !table.isEmpty, table.count < enemyNames.count, tokens.count == 5, first.contains("%") {
            table.append((nil, tokens))
        }
    }
    let inPlace = table.count == enemyNames.count
        && table.enumerated().allSatisfy { $0.element.name == nil || $0.element.name == enemyNames[$0.offset] }
    for (index, entry) in table.enumerated() {
        if let name = entry.name {
            reading.enemies[name] = entry.values
        } else if inPlace {
            reading.enemies[enemyNames[index]] = entry.values
            reading.rowsFoundByPosition.append(enemyNames[index])
        }
    }
    return reading
}

// MARK: - Output

func csvField(_ value: String) -> String {
    value.contains(",") || value.contains("\"") ? "\"" + value.replacingOccurrences(of: "\"", with: "\"\"") + "\"" : value
}

let csvHeader = (["capturedAt", "file", "tier", "panelWave", "headerWave", "stale", "complete"]
    + enemyNames.map { "\($0.lowercased())Chance" }
    + ["basicHealth", "basicAttack", "rangedAttack", "basicSpeed", "basicMass", "activeEnemies", "spawnRate", "attackSkips", "healthSkips"])
    .joined(separator: ",")

func csvLine(_ reading: Reading, capturedAt: String, file: String) -> String {
    func text(_ value: Int?) -> String { value.map(String.init) ?? "" }
    func cell(_ name: String, _ index: Int) -> String {
        guard let values = reading.enemies[name], values.count > index else { return "" }
        return values[index]
    }
    let fields = [capturedAt, file, text(reading.tier), text(reading.panelWave), text(reading.headerWave),
                  reading.stale ? "yes" : "no", reading.complete ? "yes" : "no"]
        + enemyNames.map { cell($0, 0) }
        + [cell("Basic", 1), cell("Basic", 2), cell("Ranged", 2), cell("Basic", 3), cell("Basic", 4),
           text(reading.activeEnemies), text(reading.spawnRate), text(reading.attackSkips), text(reading.healthSkips)]
    return fields.map(csvField).joined(separator: ",")
}

func jsonLine(_ reading: Reading, capturedAt: String, file: String) -> String {
    var enemies: [String: [String: String]] = [:]
    for (name, values) in reading.enemies {
        var row: [String: String] = [:]
        for (index, value) in values.enumerated() where index < columnNames.count { row[columnNames[index]] = value }
        enemies[name] = row
    }
    var object: [String: Any] = ["capturedAt": capturedAt, "file": file, "stale": reading.stale, "complete": reading.complete, "enemies": enemies,
                                 "rowsFoundByPosition": reading.rowsFoundByPosition]
    object["tier"] = reading.tier
    object["panelWave"] = reading.panelWave
    object["headerWave"] = reading.headerWave
    object["activeEnemies"] = reading.activeEnemies
    object["spawnRate"] = reading.spawnRate
    object["attackSkips"] = reading.attackSkips
    object["healthSkips"] = reading.healthSkips
    guard let data = try? JSONSerialization.data(withJSONObject: object, options: [.sortedKeys]),
          let text = String(data: data, encoding: .utf8) else { return "{}" }
    return text
}

func append(_ line: String, to path: String) {
    let data = (line + "\n").data(using: .utf8)!
    if let handle = FileHandle(forWritingAtPath: path) {
        handle.seekToEndOfFile()
        handle.write(data)
        handle.closeFile()
    } else {
        FileManager.default.createFile(atPath: path, contents: data)
    }
}

func describe(_ reading: Reading) -> String {
    guard reading.panelOpen else { return "Wave Info panel not found in the capture" }
    let chances = ["Basic", "Fast", "Tank", "Ranged", "Protector"].map { reading.enemies[$0]?.first ?? "?" }.joined(separator: " / ")
    let speed = reading.enemies["Basic"].flatMap { $0.count > 3 ? $0[3] : nil } ?? "?"
    return "T\(reading.tier!) W\(reading.panelWave!)  chances \(chances)  speed \(speed)  spawn rate \(reading.spawnRate.map(String.init) ?? "?")"
        + (reading.complete ? "" : "  [incomplete read]") + (reading.stale ? "  [panel is stale: header shows \(reading.headerWave!)]" : "")
}

// MARK: - Modes

let options = parseOptions()

if let file = options.ocrFile {
    guard let words = recognise(imageAt: file) else { fail("could not read \(file)") }
    let reading = parse(words)
    if ProcessInfo.processInfo.environment["TOWER_PANEL_DUMP"] != nil {
        for row in groupIntoRows(words) { print(row.map { $0.text }.joined(separator: " ¦ ")) }
    }
    print(describe(reading))
    print(csvHeader)
    print(csvLine(reading, capturedAt: "-", file: file))
    print(jsonLine(reading, capturedAt: "-", file: file))
    exit(reading.complete ? 0 : 2)
}

if options.whereMode {
    print("Move the mouse over a point in the game window. Ctrl-C to stop.")
    while true {
        guard let window = findWindow(owner: options.app) else {
            print("no window owned by \"\(options.app)\" is on screen")
            Thread.sleep(forTimeInterval: 1)
            continue
        }
        let mouse = CGEvent(source: nil)?.location ?? .zero
        let fx = (mouse.x - window.bounds.minX) / window.bounds.width
        let fy = (mouse.y - window.bounds.minY) / window.bounds.height
        print(String(format: "%.3f,%.3f%@", fx, fy, (0...1).contains(fx) && (0...1).contains(fy) ? "" : "   (outside the window)"))
        Thread.sleep(forTimeInterval: 1)
    }
}

let stamp: () -> String = {
    let formatter = DateFormatter()
    formatter.dateFormat = "yyyy-MM-dd'T'HH-mm-ss"
    return formatter.string(from: Date())
}

let outDir = options.outDir ?? "out/\(stamp())"
do { try FileManager.default.createDirectory(atPath: outDir, withIntermediateDirectories: true) } catch { fail("cannot create \(outDir): \(error)") }
let csvPath = "\(outDir)/readings.csv"
let jsonPath = "\(outDir)/readings.jsonl"
if !FileManager.default.fileExists(atPath: csvPath) { append(csvHeader, to: csvPath) }

print("Writing to \(outDir). Capturing every \(Int(options.interval))s. Ctrl-C to stop.")
if options.reopen != nil { print("--reopen is on: this will click in the game window before every capture.") }

let deadline = options.hours.map { Date().addingTimeInterval($0 * 3600) }
var lastSignature: String? = nil
var previousUnkept: String? = nil // the last screenshot, if nothing has made it worth keeping yet
var count = 0
var missing = 0

while deadline.map({ Date() < $0 }) ?? true {
    let started = Date()
    if let window = findWindow(owner: options.app) {
        if let r = options.reopen {
            click(at: pointIn(window, fx: r[0], fy: r[1]))
            Thread.sleep(forTimeInterval: 0.6)
            click(at: pointIn(window, fx: r[2], fy: r[3]))
            Thread.sleep(forTimeInterval: 0.8)
        }
        let capturedAt = stamp()
        let path = "\(outDir)/\(capturedAt).png"
        if capture(window, to: path), let words = recognise(imageAt: path) {
            count += 1
            let reading = parse(words)
            let changed = reading.panelOpen && reading.signature != lastSignature
            let sample = options.keepEvery > 0 && count % options.keepEvery == 1
            // Keep a changed reading and the one before it, so each step has a before and an after.
            // An incomplete read is kept too: the screenshot is then the only record.
            let keep = options.keepAll || changed || sample || (reading.panelOpen && !reading.complete)
            if changed, lastSignature != nil { previousUnkept = nil }
            if let stale = previousUnkept { try? FileManager.default.removeItem(atPath: stale) }
            previousUnkept = keep ? nil : path
            if reading.panelOpen { lastSignature = reading.signature }

            let name = (path as NSString).lastPathComponent
            append(csvLine(reading, capturedAt: capturedAt, file: name), to: csvPath)
            append(jsonLine(reading, capturedAt: capturedAt, file: name), to: jsonPath)
            print("\(capturedAt)  \(describe(reading))\(changed && count > 1 ? "  <- changed" : "")")
            missing = reading.panelOpen ? 0 : missing + 1
            if missing == 3 { print("The panel has been missing for three captures. Open Wave Info in the game.") }
        } else {
            print("\(capturedAt)  capture failed. Check Screen Recording permission for the app running this script.")
        }
    } else {
        print("\(stamp())  no window owned by \"\(options.app)\" is on screen")
    }
    if options.once { break }
    let remaining = options.interval - Date().timeIntervalSince(started)
    if remaining > 0 { Thread.sleep(forTimeInterval: remaining) }
}
print("Stopped. Readings are in \(csvPath).")
