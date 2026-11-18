---
name: showcase-circuit
description: Diagram Arduino, ESP32 or sensor wiring from code or a circuit description using native showcase parts, named pins, and automatic wire routing.
---

# Showcase a circuit

Read the source or wiring specification. Use showcase(action="search_parts",query="<part name>") for available catalog types and their exact pin names. Draw with showcase(action="sketch",scene="...") using part and wire lines, or use incremental place_part and connect actions with payload, then render.

Example:

    title Simple circuit
    dir right
    part uno arduino-uno
    part led1 led
    part r1 resistor value=220
    wire uno.GND -> led1.C black

Use real pins found in search results; do not invent names. Use red for power, black for ground, and distinguish other signals. Keep current limiting resistors in series with LEDs. The visual layout must reflect actual circuit logic. Revise with edit_sketch rather than rebuilding unrelated elements.

The HTML viewer allows SVG, PNG and Excalidraw export.
