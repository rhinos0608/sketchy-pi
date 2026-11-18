import Foundation
import Vision

guard CommandLine.arguments.count == 4,
      let width = Double(CommandLine.arguments[2]),
      let height = Double(CommandLine.arguments[3]) else {
    fputs("Usage: vision_ocr IMAGE WIDTH HEIGHT\n", stderr)
    exit(2)
}

let path = CommandLine.arguments[1]
let request = VNRecognizeTextRequest()
request.recognitionLevel = .accurate
request.usesLanguageCorrection = false
let handler = VNImageRequestHandler(url: URL(fileURLWithPath: path), options: [:])
do {
    try handler.perform([request])
    var labels: [String] = []
    var boxes: [[Double]] = []
    for observation in request.results ?? [] {
        guard let text = observation.topCandidates(1).first?.string else { continue }
        let b = observation.boundingBox
        let x1 = Double(b.minX) * width
        let x2 = Double(b.maxX) * width
        let y1 = (1.0 - Double(b.maxY)) * height
        let y2 = (1.0 - Double(b.minY)) * height
        labels.append(text)
        boxes.append([x1, y1, x2, y1, x2, y2, x1, y2])
    }
    let json = try JSONSerialization.data(withJSONObject: ["labels": labels, "quad_boxes": boxes], options: [])
    print(String(data: json, encoding: .utf8)!)
} catch {
    fputs("Vision OCR failed: \(error)\n", stderr)
    exit(1)
}
