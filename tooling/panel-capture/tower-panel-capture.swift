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
//   --every-wave           Record one reading for every wave. Looks at the game every 2 seconds
//                          (change with --interval) and writes a row the first time each wave
//                          reads completely. A wave the Wave Skip card skips is never shown by
//                          the game, so it cannot be recorded.
//   --interval <seconds>   Time between captures (default 45, or 2 with --every-wave).
//   --out <dir>            Where to write (default ./out/<start time>).
//   --app <name>           Window owner to capture (default "The Tower").
//   --keep-every <n>       Also keep every nth screenshot as an audit sample (default 20, 0 = off).
//   --keep-all             Keep every screenshot.
//   --hours <n>            Stop after this many hours (default: run until Ctrl-C).
//   --once                 One capture, then exit.
//   --ocr-file <image>     Read one existing image, print what was parsed, and exit. No capture.
//   --reread <dir>         Read every .png in a folder of earlier captures again and write
//                          reread.csv and reread.jsonl beside them. No capture.
//   --no-cross-checks      Do not require cells the panel repeats to agree with each other. Use on
//                          a tier or account where an enemy-specific lab or battle condition makes
//                          them differ, or every reading will be marked incomplete.
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

/// Whether a reading must also pass the cross-checks between cells. Off with --no-cross-checks.
var crossChecksEnabled = true

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
    var reread: String? = nil
    var everyWave = false
    var intervalGiven = false
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
            guard let v = Double(value(flag)), v >= 0.5 else { fail("--interval needs a number of seconds, 0.5 or more") }
            options.interval = v
            options.intervalGiven = true
        case "--out": options.outDir = value(flag)
        case "--app": options.app = value(flag)
        case "--keep-every":
            guard let v = Int(value(flag)), v >= 0 else { fail("--keep-every needs a whole number") }
            options.keepEvery = v
        case "--keep-all": options.keepAll = true
        case "--every-wave": options.everyWave = true
        case "--no-cross-checks": crossChecksEnabled = false
        case "--hours":
            guard let v = Double(value(flag)), v > 0 else { fail("--hours needs a positive number") }
            options.hours = v
        case "--once": options.once = true
        case "--ocr-file": options.ocrFile = value(flag)
        case "--where": options.whereMode = true
        case "--reread": options.reread = value(flag)
        case "--reopen":
            let parts = value(flag).split(separator: ",").compactMap { Double($0) }
            guard parts.count == 4, parts.allSatisfy({ $0 >= 0 && $0 <= 1 }) else {
                fail("--reopen needs four fractions between 0 and 1: closeX,closeY,openX,openY")
            }
            options.reopen = parts
        default: fail("unknown option: \(flag)")
        }
    }
    // Looking every two seconds catches every wave at the game's fastest speed.
    if options.everyWave, !options.intervalGiven { options.interval = 2 }
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

func loadImage(_ path: String) -> CGImage? {
    guard let source = CGImageSourceCreateWithURL(URL(fileURLWithPath: path) as CFURL, nil) else { return nil }
    return CGImageSourceCreateImageAtIndex(source, 0, nil)
}

func recognise(_ image: CGImage, region: CGRect? = nil, level: VNRequestTextRecognitionLevel = .accurate) -> [Word] {
    let request = VNRecognizeTextRequest()
    request.recognitionLevel = level
    request.usesLanguageCorrection = false
    request.recognitionLanguages = ["en-US"]
    if let region = region { request.regionOfInterest = region }
    do { try VNImageRequestHandler(cgImage: image, options: [:]).perform([request]) } catch { return [] }
    return (request.results ?? []).compactMap { observation in
        guard let candidate = observation.topCandidates(1).first else { return nil }
        return Word(text: candidate.string, box: observation.boundingBox)
    }
}

/// The height of one line of panel text. The median over every word read, because the box around
/// any single word can come back a fifth taller than its neighbours'.
func lineHeight(of words: [Word]) -> CGFloat {
    let heights = words.map { $0.box.height }.sorted()
    return heights.isEmpty ? 0.016 : heights[heights.count / 2]
}

/// The footer's counters sit to the right of a two-line label, level with the gap between its
/// lines. This is the cell one of them occupies, given the label's first line.
func valueCell(beside label: Word, lineHeight height: CGFloat) -> CGRect {
    let minX = min(label.box.maxX + 0.01, 0.99)
    let cell = CGRect(x: minX, y: label.box.midY - 0.5 * height - 0.95 * height, width: min(0.16, 1 - minX), height: 1.9 * height)
    return cell.intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
}

/// A counter that the whole-image pass missed. A lone "0" is dropped when the recogniser reads
/// the full screenshot and comes back (as "o") only when it is shown that one cell.
func readCell(_ image: CGImage, beside label: Word, lineHeight: CGFloat) -> String? {
    let cell = valueCell(beside: label, lineHeight: lineHeight)
    guard cell.width > 0, cell.height > 0 else { return nil }
    for level in [VNRequestTextRecognitionLevel.accurate, .fast] {
        if let text = recognise(image, region: cell, level: level).first?.text { return text }
    }
    return nil
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

/// The game's characters are sometimes read as lookalikes: its 0 as "O", its 6 as the Cyrillic
/// "Б", and a K suffix as the Cyrillic "К".
/// A token is repaired only when the repair turns it into a number the panel could have written;
/// anything else (a label such as "Boss") is returned untouched.
func repairNumber(_ token: String) -> String {
    // Latin O and D and Cyrillic О for 0, Cyrillic Б for 6, and Cyrillic К М В Т for the K M B T
    // suffixes.
    let swaps: [Character: Character] = ["O": "0", "o": "0", "D": "0", "О": "0", "о": "0", "Б": "6", "б": "6",
                                         "К": "K", "М": "M", "В": "B", "Т": "T"]
    guard token.contains(where: { swaps[$0] != nil }) else { return token }
    let repaired = String(token.map { swaps[$0] ?? $0 })
    return firstMatch(#"^\(?\d+(\.\d+)?\)?(%|[KMBTqsm])?$"#, in: repaired) != nil ? repaired : token
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
    var rowsReadAgain: [String] = []

    var panelOpen: Bool { tier != nil && panelWave != nil }
    var stale: Bool {
        guard let panel = panelWave, let header = headerWave else { return false }
        return abs(header - panel) > 2
    }
    /// What must change for a screenshot to be worth keeping: every chance, and the spawn rate.
    /// Boss is left out: it reads 100% on every boss wave and 0% otherwise, which is not a step.
    var signature: String {
        let chances = enemyNames.filter { $0 != "Boss" }.map { enemies[$0]?.first ?? "?" }.joined(separator: "|")
        return "\(tier ?? -1)|\(chances)|\(spawnRate ?? -1)"
    }
    /// Basic, Fast, Tank, Ranged and Protector share one draw, so their chances total 100. A total
    /// that is off by one is a misread digit: the game's 6 has been read as a 5.
    var ordinaryChancesTotal: Double? {
        var total = 0.0
        for name in ["Basic", "Fast", "Tank", "Ranged", "Protector"] {
            guard let text = enemies[name]?.first, text.hasSuffix("%"), let value = Double(text.dropLast()) else { return nil }
            total += value
        }
        return total
    }
    var complete: Bool {
        // Every row has five cells and every cell reads as the panel writes it: a percentage for
        // the chance, and a number with an optional K M B T q suffix for the rest.
        guard panelOpen, spawnRate != nil, attackSkips != nil, healthSkips != nil else { return false }
        for name in enemyNames {
            guard let values = enemies[name], values.count == 5,
                  firstMatch(#"^\d+(\.\d+)?%$"#, in: values[0]) != nil else { return false }
            for value in values.dropFirst() where firstMatch(#"^\d+(\.\d+)?[KMBTq]?$"#, in: value) == nil { return false }
        }
        return ordinaryChancesTotal == 100 && (!crossChecksEnabled || cellsAgree)
    }

    /// The panel repeats itself: several rows always show the same health, attack, speed or mass,
    /// and Tank, Boss, Protector and Vampire health are fixed multiples of Basic. A misread digit
    /// in one cell ("13.00" read as "15.00") is well-formed, so only its disagreement with the
    /// cells that should match gives it away.
    ///
    /// These held in every reading on tiers 1 and 7. An enemy-specific lab or a battle condition
    /// could break one legitimately; --no-cross-checks turns them off.
    var cellsAgree: Bool {
        func cell(_ name: String, _ column: Int) -> String? {
            guard let values = enemies[name], values.count > column else { return nil }
            return values[column]
        }
        func same(_ names: [String], _ column: Int) -> Bool {
            let cells = names.map { cell($0, column) }
            return cells.allSatisfy { $0 != nil && $0 == cells[0] }
        }
        func amount(_ text: String?) -> Double? {
            guard let text = text, let m = firstMatch(#"^(\d+(?:\.\d+)?)([KMBTq]?)$"#, in: text), let number = Double(m[1]) else { return nil }
            let units: [String: Double] = ["": 1, "K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12, "q": 1e15]
            return number * (units[m[2]] ?? 1)
        }
        // Health 1, attack 2, speed 3, mass 4.
        guard same(["Basic", "Fast", "Ranged", "Ray"], 1), same(["Boss", "Saboteur", "Commander", "Overcharge"], 1), same(["Vampire", "Scatter"], 1),
              same(["Basic", "Fast", "Tank", "Boss", "Protector", "Vampire", "Ray"], 2),
              same(["Boss", "Protector", "Vampire", "Ray"], 3), same(["Tank", "Scatter"], 3), same(["Commander", "Overcharge"], 3),
              same(["Basic", "Fast", "Ranged"], 4), same(["Vampire", "Scatter"], 4), same(["Saboteur", "Commander", "Overcharge"], 4)
        else { return false }
        guard let basic = amount(cell("Basic", 1)), basic > 0 else { return false }
        for (name, multiple) in [("Tank", 5.0), ("Boss", 20.0), ("Protector", 0.6), ("Vampire", 2.0)] {
            // Two decimals of display rounding on each side: 1% covers it with room to spare.
            guard let health = amount(cell(name, 1)), abs(health / basic / multiple - 1) < 0.01 else { return false }
        }
        return true
    }
}

/// The whole number in the cell beside `label`: from the words already read, else from a second
/// look at just that cell. Never a number from a neighbouring row.
func numberBeside(_ label: Word, in words: [Word], image: CGImage) -> Int? {
    let height = lineHeight(of: words)
    let cell = valueCell(beside: label, lineHeight: height)
    for word in words where cell.contains(CGPoint(x: word.box.midX, y: word.box.midY)) {
        if let value = Int(repairNumber(word.text.trimmingCharacters(in: .whitespaces))) { return value }
    }
    guard let text = readCell(image, beside: label, lineHeight: height) else { return nil }
    return Int(repairNumber(text.trimmingCharacters(in: .whitespaces)))
}

func activeAndSpawnRate(in text: String) -> (active: Int, rate: Int)? {
    // "56 (34)": active enemies, then the spawn rate in brackets.
    let pieces = text.split(separator: " ").map { repairNumber(String($0)) }.joined(separator: " ")
    guard let m = firstMatch(#"^\s*(\d+)\s*\((\d+)\)\s*$"#, in: pieces), let active = Int(m[1]), let rate = Int(m[2]) else { return nil }
    return (active, rate)
}

func parse(_ words: [Word], image: CGImage) -> Reading {
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
        if reading.spawnRate == nil, let found = activeAndSpawnRate(in: word.text) {
            reading.activeEnemies = found.active
            reading.spawnRate = found.rate
        }
    }
    // The footer is only meaningful with the panel open: the battle screen behind it has its own
    // "Enemy Attack Level Skip" upgrade tile.
    if reading.panelOpen {
        for word in words {
            if word.text.range(of: "Attack Level", options: .caseInsensitive) != nil, reading.attackSkips == nil {
                reading.attackSkips = numberBeside(word, in: words, image: image)
            }
            if word.text.range(of: "Health Level", options: .caseInsensitive) != nil, reading.healthSkips == nil {
                reading.healthSkips = numberBeside(word, in: words, image: image)
            }
            if word.text.range(of: "Active Enemies", options: .caseInsensitive) != nil, reading.spawnRate == nil,
               let text = readCell(image, beside: word, lineHeight: lineHeight(of: words)), let found = activeAndSpawnRate(in: text) {
                reading.activeEnemies = found.active
                reading.spawnRate = found.rate
            }
        }
    }
    // The twelve enemy rows, top to bottom. A row is normally found by its label. The recogniser
    // sometimes drops a label, leaving five bare values; such a row is accepted only by position,
    // and only when all twelve rows are present and every label that WAS read is in its place.
    var table: [(name: String?, values: [String], band: CGRect)] = []
    let height = lineHeight(of: words)
    for row in groupIntoRows(words) {
        // The strip of the screenshot this row occupies, for a second look at it alone.
        let middle = row.map { $0.box.midY }.reduce(0, +) / CGFloat(row.count)
        let band = CGRect(x: 0.08, y: middle - 1.1 * height, width: 0.9, height: 2.2 * height)
            .intersection(CGRect(x: 0, y: 0, width: 1, height: 1))
        var tokens = row.flatMap { $0.text.split(separator: " ").map { repairNumber(String($0)) } }
        // The row's icon is occasionally read as a stray word ("0000") ahead of the label.
        if tokens.count == 7, enemyNames.contains(where: { $0.caseInsensitiveCompare(tokens[1]) == .orderedSame }) {
            tokens.removeFirst()
        }
        guard let first = tokens.first else { continue }
        if let name = enemyNames.first(where: { $0.caseInsensitiveCompare(first) == .orderedSame }) {
            if !table.contains(where: { $0.name == name }) { table.append((name, Array(tokens.dropFirst()), band)) }
        } else if !table.isEmpty, table.count < enemyNames.count, tokens.count == 5, first.contains("%") {
            table.append((nil, tokens, band))
        }
    }
    let inPlace = table.count == enemyNames.count
        && table.enumerated().allSatisfy { $0.element.name == nil || $0.element.name == enemyNames[$0.offset] }
    var bands: [String: CGRect] = [:]
    for (index, entry) in table.enumerated() {
        if let name = entry.name {
            reading.enemies[name] = entry.values
            bands[name] = entry.band
        } else if inPlace {
            reading.enemies[enemyNames[index]] = entry.values
            bands[enemyNames[index]] = entry.band
            reading.rowsFoundByPosition.append(enemyNames[index])
        }
    }

    // Second looks. Reading the whole screenshot at once sometimes garbles one cell (a lone "0"
    // as a bullet, a 6 as a 5). Reading that row's strip alone usually gets it right, and the
    // result is taken only if all five cells are well-formed.
    func lookAgain(_ name: String) {
        guard let band = bands[name], let values = rereadRow(image, band: band, name: name) else { return }
        if values != reading.enemies[name] {
            reading.enemies[name] = values
            if !reading.rowsReadAgain.contains(name) { reading.rowsReadAgain.append(name) }
        }
    }
    for name in enemyNames where !rowIsWellFormed(reading.enemies[name] ?? []) { lookAgain(name) }
    if let total = reading.ordinaryChancesTotal, total != 100 {
        for name in ["Basic", "Fast", "Tank", "Ranged", "Protector"] { lookAgain(name) }
    }
    if crossChecksEnabled, enemyNames.allSatisfy({ rowIsWellFormed(reading.enemies[$0] ?? []) }), !reading.cellsAgree {
        for name in enemyNames { lookAgain(name) }
    }
    return reading
}

/// Five cells, each as the panel writes it: a percentage, then four numbers with an optional
/// K M B T q suffix.
func rowIsWellFormed(_ values: [String]) -> Bool {
    guard values.count == 5, firstMatch(#"^\d+(\.\d+)?%$"#, in: values[0]) != nil else { return false }
    return values.dropFirst().allSatisfy { firstMatch(#"^\d+(\.\d+)?[KMBTq]?$"#, in: $0) != nil }
}

/// One enemy row read from its own strip of the screenshot, or nil if that does not give five
/// well-formed cells either.
func rereadRow(_ image: CGImage, band: CGRect, name: String) -> [String]? {
    guard band.width > 0, band.height > 0 else { return nil }
    for level in [VNRequestTextRecognitionLevel.accurate, .fast] {
        let words = recognise(image, region: band, level: level).sorted { $0.box.minX < $1.box.minX }
        var tokens = words.flatMap { $0.text.split(separator: " ").map { repairNumber(String($0)) } }
        if let label = tokens.firstIndex(where: { $0.caseInsensitiveCompare(name) == .orderedSame }) {
            tokens = Array(tokens[(label + 1)...])
        } else if tokens.count > 5 {
            tokens = Array(tokens.suffix(5))
        }
        if rowIsWellFormed(tokens) { return tokens }
    }
    return nil
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
                                 "rowsFoundByPosition": reading.rowsFoundByPosition, "rowsReadAgain": reading.rowsReadAgain]
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
    guard let image = loadImage(file) else { fail("could not read \(file)") }
    let words = recognise(image)
    let reading = parse(words, image: image)
    if ProcessInfo.processInfo.environment["TOWER_PANEL_DUMP"] != nil {
        for row in groupIntoRows(words) { print(row.map { $0.text }.joined(separator: " ¦ ")) }
    }
    print(describe(reading))
    print(csvHeader)
    print(csvLine(reading, capturedAt: "-", file: file))
    print(jsonLine(reading, capturedAt: "-", file: file))
    exit(reading.complete ? 0 : 2)
}

if let dir = options.reread {
    let files = ((try? FileManager.default.contentsOfDirectory(atPath: dir)) ?? []).filter { $0.hasSuffix(".png") }.sorted()
    guard !files.isEmpty else { fail("no .png files in \(dir)") }
    let csv = "\(dir)/reread.csv", json = "\(dir)/reread.jsonl"
    try? FileManager.default.removeItem(atPath: csv)
    try? FileManager.default.removeItem(atPath: json)
    append(csvHeader, to: csv)
    var incomplete = 0
    for file in files {
        guard let image = loadImage("\(dir)/\(file)") else { print("\(file)  could not be read"); continue }
        let words = recognise(image)
        let reading = parse(words, image: image)
        let capturedAt = (file as NSString).deletingPathExtension
        append(csvLine(reading, capturedAt: capturedAt, file: file), to: csv)
        append(jsonLine(reading, capturedAt: capturedAt, file: file), to: json)
        if reading.panelOpen, !reading.complete { incomplete += 1 }
        print("\(capturedAt)  \(describe(reading))")
    }
    print("Read \(files.count) screenshots, \(incomplete) incomplete. Wrote \(csv).")
    exit(0)
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

print(options.everyWave
    ? "Writing to \(outDir). One reading per wave, looking every \(options.interval)s. Ctrl-C to stop."
    : "Writing to \(outDir). Capturing every \(Int(options.interval))s. Ctrl-C to stop.")
if options.reopen != nil { print("--reopen is on: this will click in the game window before every capture.") }

let deadline = options.hours.map { Date().addingTimeInterval($0 * 3600) }
var lastSignature: String? = nil
var previousUnkept: String? = nil // the last screenshot, if nothing has made it worth keeping yet
var count = 0
var missing = 0

/// Writes one reading to the CSV and JSONL and decides whether its screenshot is kept.
func record(_ reading: Reading, capturedAt: String, path: String) {
    count += 1
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
}

// --every-wave state: the wave being watched, whether a complete reading of it is written, and
// the best incomplete reading of it so far, held back in case a later look reads it completely.
var watchedWave: (tier: Int, wave: Int)? = nil
var watchedWaveWritten = false
var heldIncomplete: (reading: Reading, capturedAt: String, path: String)? = nil

func flushHeld() {
    if let held = heldIncomplete { record(held.reading, capturedAt: held.capturedAt, path: held.path) }
    heldIncomplete = nil
}

/// One reading per wave: the first complete read of each wave is written, and every later look at
/// the same wave is discarded. A wave that never reads completely is written as incomplete.
func recordOncePerWave(_ reading: Reading, capturedAt: String, path: String) {
    guard reading.panelOpen, let tier = reading.tier, let wave = reading.panelWave else {
        try? FileManager.default.removeItem(atPath: path)
        return
    }
    if watchedWave == nil || watchedWave!.tier != tier || watchedWave!.wave != wave {
        flushHeld()
        watchedWave = (tier, wave)
        watchedWaveWritten = false
    }
    if watchedWaveWritten {
        try? FileManager.default.removeItem(atPath: path)
    } else if reading.complete {
        if let held = heldIncomplete { try? FileManager.default.removeItem(atPath: held.path) }
        heldIncomplete = nil
        record(reading, capturedAt: capturedAt, path: path)
        watchedWaveWritten = true
    } else {
        if let held = heldIncomplete { try? FileManager.default.removeItem(atPath: held.path) }
        heldIncomplete = (reading, capturedAt, path)
    }
}

while deadline.map({ Date() < $0 }) ?? true {
    let started = Date()
    if let window = findWindow(owner: options.app) {
        if let r = options.reopen {
            click(at: pointIn(window, fx: r[0], fy: r[1]))
            Thread.sleep(forTimeInterval: 0.6)
            click(at: pointIn(window, fx: r[2], fy: r[3]))
            Thread.sleep(forTimeInterval: 0.8)
        }
        // Milliseconds in the name: in --every-wave mode two captures can fall in one second.
        let capturedAt = stamp()
        let path = "\(outDir)/\(capturedAt)-\(String(format: "%03d", Int(Date().timeIntervalSince1970 * 1000) % 1000)).png"
        if capture(window, to: path), let image = loadImage(path) {
            let reading = parse(recognise(image), image: image)
            if options.everyWave {
                recordOncePerWave(reading, capturedAt: capturedAt, path: path)
            } else {
                record(reading, capturedAt: capturedAt, path: path)
            }
            missing = reading.panelOpen ? 0 : missing + 1
            if missing == (options.everyWave ? 10 : 3) { print("\(capturedAt)  The Wave Info panel is not showing. Open it in the game.") }
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
flushHeld()
print("Stopped. Readings are in \(csvPath).")
