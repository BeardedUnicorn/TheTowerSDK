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
/// "Б", a K suffix as the Cyrillic "К" and a B suffix as the baht sign "฿".
/// A token is repaired only when the repair turns it into a number the panel could have written;
/// anything else (a label such as "Boss") is returned untouched.
func repairNumber(_ token: String) -> String {
    // Latin O and D and Cyrillic О for 0, Cyrillic З for 3 and Б for 6, Cyrillic К М В Т for the
    // K M B T suffixes, ฿ for B, and g for the q suffix ("919.10g").
    let swaps: [Character: Character] = ["O": "0", "o": "0", "D": "0", "О": "0", "о": "0", "З": "3", "з": "3", "Б": "6", "б": "6",
                                         "К": "K", "М": "M", "В": "B", "Т": "T", "฿": "B", "g": "q"]
    var result = token
    if token.contains(where: { swaps[$0] != nil }) {
        let repaired = String(token.map { swaps[$0] ?? $0 })
        if firstMatch(#"^\(?\d+(\.\d+)?\)?(%|[KMBTqsm])?$"#, in: repaired) != nil { result = repaired }
    }
    // A chance above 100 has lost its point. The panel writes a fractional chance with exactly two
    // decimals, so "133%" can only have been "1.33%".
    if let m = firstMatch(#"^(\d+)(\d{2})%$"#, in: result), let value = Double(m[1] + m[2]), value > 100 {
        result = "\(m[1]).\(m[2])%"
    }
    // The panel writes exactly two decimals, so a third that is a 5 is the s suffix: "1.41s" read
    // as "1.415".
    if let m = firstMatch(#"^(\d+\.\d{2})5$"#, in: result) {
        result = m[1] + "s"
    }
    return result
}

/// Two neighbouring cells are sometimes read as one word with no space between them: an attack
/// and the speed after it as "484.08M5.47". A suffix letter can only end a cell, so a number that
/// carries on after one is two cells.
func splitMergedCells(_ token: String) -> [String] {
    guard let m = firstMatch(#"^(\d+\.\d{2}[KMBTqs])(\d+\.\d{2}[KMBTqs]?)$"#, in: token) else { return [token] }
    return [m[1], m[2]]
}

let enemyNames = ["Basic", "Fast", "Tank", "Ranged", "Boss", "Protector", "Vampire", "Scatter", "Ray", "Saboteur", "Commander", "Overcharge"]
let columnNames = ["chance", "health", "attack", "speed", "mass"]

/// A panel number as a value: "28.39M" is 28,390,000.
func panelAmount(_ text: String) -> Double? {
    guard let m = firstMatch(#"^(\d+(?:\.\d+)?)([KMBTqs]?)$"#, in: text), let number = Double(m[1]) else { return nil }
    // The suffix after q (1e15) is a capital Q (1e18): Saboteur health reads "1.06Q" by wave 4663
    // on tier 1. After Q come s (1e21) and S (1e24): Boss health reads "1.12s" at wave 6146. Each
    // pair differs only by case; settleSuffixCase and the health multiples deal with one read as
    // the other. The suffixes after those (O, N, D) are not accepted yet: O and D are also what a
    // misread 0 looks like.
    let units: [String: Double] = ["": 1, "K": 1e3, "M": 1e6, "B": 1e9, "T": 1e12, "q": 1e15, "Q": 1e18, "s": 1e21, "S": 1e24]
    return number * (units[m[2]] ?? 1)
}

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
    /// q and Q are different suffixes, as are s and S, and the recogniser sometimes returns the
    /// wrong case ("4.14S" where the rows beside it read "4.14s"). The wrong case is a thousand
    /// times off, and no health in the panel is that far from Basic health, so the case is settled
    /// by size: Basic, Fast, Ranged and Ray show one health and take the spelling most of them
    /// have; every other row takes whichever case puts it between half and 500 times Basic.
    mutating func settleSuffixCase() {
        let otherCase: [Character: Character] = ["q": "Q", "Q": "q", "s": "S", "S": "s"]
        func flipped(_ text: String) -> String? {
            guard let last = text.last, let other = otherCase[last] else { return nil }
            return String(text.dropLast()) + String(other)
        }
        func health(_ name: String) -> String? {
            guard let values = enemies[name], values.count > 1 else { return nil }
            return values[1]
        }
        let shared = ["Basic", "Fast", "Ranged", "Ray"]
        let spellings = shared.compactMap(health)
        guard let basicText = spellings.max(by: { a, b in spellings.filter { $0 == a }.count < spellings.filter { $0 == b }.count }),
              let basic = panelAmount(basicText), basic > 0 else { return }
        for name in enemyNames {
            guard let text = health(name), let other = flipped(text) else { continue }
            if shared.contains(name) {
                if other == basicText { enemies[name]?[1] = other }
                continue
            }
            guard let own = panelAmount(text), let alternative = panelAmount(other) else { continue }
            func plausible(_ value: Double) -> Bool { value / basic >= 0.5 && value / basic < 500 }
            if !plausible(own), plausible(alternative) { enemies[name]?[1] = other }
        }
    }

    var complete: Bool {
        // Every row has five cells and every cell reads as the panel writes it: a percentage for
        // the chance, and a number with an optional K M B T q suffix for the rest.
        guard panelOpen, spawnRate != nil, attackSkips != nil, healthSkips != nil else { return false }
        for name in enemyNames where !rowIsWellFormed(enemies[name] ?? []) { return false }
        return ordinaryChancesTotal == 100 && (!crossChecksEnabled || cellsAgree)
    }

    /// The panel repeats itself: several rows always show the same health, attack, speed or mass,
    /// and Tank, Boss, Protector and Vampire health are fixed multiples of Basic. A misread digit
    /// in one cell ("13.00" read as "15.00") is well-formed, so only its disagreement with the
    /// cells that should match gives it away.
    ///
    /// These held in every reading on tiers 1 and 7. An enemy-specific lab or a battle condition
    /// could break one legitimately; --no-cross-checks turns them off.
    ///
    /// The Boss row has two forms. In one tier 1 run it changed at wave 1500: health from 20 times
    /// Basic to about 5.93 times, and speed from the Protector's to the Tank's. That is taken to be
    /// the Boss trade-off perk (health -70%, speed +50%). Both forms are accepted. At wave 5638 of
    /// the same run Boss health rose eightfold, to 47.4 times Basic, which is taken to be the Boss
    /// health x8 trade-off perk; eight times either form is accepted as well.
    var cellsAgree: Bool {
        func cell(_ name: String, _ column: Int) -> String? {
            guard let values = enemies[name], values.count > column else { return nil }
            return values[column]
        }
        func same(_ names: [String], _ column: Int) -> Bool {
            let cells = names.map { cell($0, column) }
            return cells.allSatisfy { $0 != nil && $0 == cells[0] }
        }
        func amount(_ text: String?) -> Double? { text.flatMap(panelAmount) }
        // Health 1, attack 2, speed 3, mass 4.
        guard same(["Basic", "Fast", "Ranged", "Ray"], 1), same(["Saboteur", "Commander", "Overcharge"], 1), same(["Vampire", "Scatter"], 1),
              same(["Basic", "Fast", "Tank", "Boss", "Protector", "Vampire", "Ray"], 2),
              same(["Protector", "Vampire", "Ray"], 3), same(["Tank", "Scatter"], 3), same(["Commander", "Overcharge"], 3),
              same(["Boss", "Protector"], 3) || same(["Boss", "Tank"], 3),
              same(["Basic", "Fast", "Ranged"], 4), same(["Vampire", "Scatter"], 4), same(["Saboteur", "Commander", "Overcharge"], 4),
              // The three elites always share one chance, and no chance is above 100 ("1.33%"
              // read without its point is "133%").
              same(["Vampire", "Scatter", "Ray"], 0),
              enemyNames.allSatisfy({ name in Double((cell(name, 0) ?? "").dropLast()).map { $0 <= 100 } ?? false })
        else { return false }
        guard let basic = amount(cell("Basic", 1)), basic > 0 else { return false }
        // Two decimals of display rounding on each side: 1% covers it with room to spare.
        func multiple(_ name: String, _ expected: [Double]) -> Bool {
            guard let health = amount(cell(name, 1)) else { return false }
            return expected.contains { abs(health / basic / $0 - 1) < 0.01 }
        }
        // Tank and Boss mass stand alone in their column, so a misread digit there ("16.73" read
        // as "16.75") agrees with nothing. Both are fixed fractions of Saboteur mass, which is large
        // enough to pin them to the hundredth: 0.0051 and 0.013 on tiers 1, 7 and 20.
        func massFraction(_ name: String, _ fraction: Double) -> Bool {
            guard let mass = amount(cell(name, 4)), let saboteur = amount(cell("Saboteur", 4)) else { return false }
            return abs(mass - saboteur * fraction) < 0.011
        }
        return multiple("Tank", [5]) && multiple("Saboteur", [20]) && multiple("Boss", [20, 5.93, 160, 47.44])
            && multiple("Protector", [0.6]) && multiple("Vampire", [2])
            && massFraction("Tank", 0.0051) && massFraction("Boss", 0.013)
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
        var tokens = row.flatMap { $0.text.split(separator: " ").flatMap { splitMergedCells(repairNumber(String($0))) } }
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
    reading.settleSuffixCase()
    if crossChecksEnabled, enemyNames.allSatisfy({ rowIsWellFormed(reading.enemies[$0] ?? []) }), !reading.cellsAgree {
        for name in enemyNames { lookAgain(name) }
        reading.settleSuffixCase()
    }
    return reading
}

/// Five cells, each as the panel writes it. The chance is a whole percentage or one with two
/// decimals ("8%", "1.33%"). The other four always carry exactly two decimals and an optional
/// K M B T q suffix ("28.39M", "0.00", "1000.00"), so a dropped point ("2839M") or a suffix read
/// as a digit ("1.638") is not well-formed.
func rowIsWellFormed(_ values: [String]) -> Bool {
    guard values.count == 5, firstMatch(#"^\d+(\.\d{2})?%$"#, in: values[0]) != nil else { return false }
    return values.dropFirst().allSatisfy { firstMatch(#"^\d+\.\d{2}[KMBTqs]?$"#, in: $0) != nil }
}

/// One enemy row read from its own strip of the screenshot, or nil if that does not give five
/// well-formed cells either.
func rereadRow(_ image: CGImage, band: CGRect, name: String) -> [String]? {
    guard band.width > 0, band.height > 0 else { return nil }
    // The same strip can garble the same cell again, so a taller and a shorter strip are tried too.
    let whole = CGRect(x: 0, y: 0, width: 1, height: 1)
    let strips = [1.0, 1.35, 0.8].map { band.insetBy(dx: 0, dy: band.height * (1 - $0) / 2).intersection(whole) }
    for (strip, level) in strips.flatMap({ strip in [VNRequestTextRecognitionLevel.accurate, .fast].map { (strip, $0) } }) {
        let words = recognise(image, region: strip, level: level).sorted { $0.box.minX < $1.box.minX }
        var tokens = words.flatMap { $0.text.split(separator: " ").flatMap { splitMergedCells(repairNumber(String($0))) } }
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
    // The elite and fleet chances are part of what counts as a change, so they are shown too.
    func chanceList(_ names: [String]) -> String { names.map { reading.enemies[$0]?.first ?? "?" }.joined(separator: " / ") }
    let elites = chanceList(["Vampire", "Scatter", "Ray"])
    let fleets = chanceList(["Saboteur", "Commander", "Overcharge"])
    let speed = reading.enemies["Basic"].flatMap { $0.count > 3 ? $0[3] : nil } ?? "?"
    return "T\(reading.tier!) W\(reading.panelWave!)  chances \(chances)  elites \(elites)  fleets \(fleets)  speed \(speed)  spawn rate \(reading.spawnRate.map(String.init) ?? "?")"
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

/// What a reading is compared on, by name: every chance but the Boss's, and the spawn rate.
func watchedValues(_ reading: Reading) -> [(name: String, value: String)] {
    enemyNames.filter { $0 != "Boss" }.map { (name: $0, value: reading.enemies[$0]?.first ?? "?") }
        + [(name: "tier", value: reading.tier.map(String.init) ?? "?"), (name: "spawn rate", value: reading.spawnRate.map(String.init) ?? "?")]
}
var lastWatched: [(name: String, value: String)] = []

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
    // Name what changed, so a misread cell can be told from a real step.
    var differences = ""
    if changed, count > 1, reading.panelOpen {
        let now = watchedValues(reading)
        differences = zip(lastWatched, now).filter { $0.value != $1.value }
            .map { "\($1.name) \($0.value) -> \($1.value)" }.joined(separator: ", ")
    }
    if reading.panelOpen {
        lastSignature = reading.signature
        lastWatched = watchedValues(reading)
    }

    let name = (path as NSString).lastPathComponent
    append(csvLine(reading, capturedAt: capturedAt, file: name), to: csvPath)
    append(jsonLine(reading, capturedAt: capturedAt, file: name), to: jsonPath)
    print("\(capturedAt)  \(describe(reading))\(changed && count > 1 ? "  <- changed\(differences.isEmpty ? "" : ": " + differences)" : "")")
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
