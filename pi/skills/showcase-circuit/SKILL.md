---
name: showcase-circuit
description: Draw a circuit using catalog-backed part types, verified pin names, and connected wires.
disable-model-invocation: true
---

# Circuit diagram

Use when explicitly invoked for a wiring diagram. The native `showcase` tool must first be enabled with `/showcase`.

Inspect the circuit specification or code. Call `showcase` with `action="search_parts"` and `query="<part name>"` to verify part types and pin names before drawing. Then use `action="sketch"` with `part` and `wire` lines, or incrementally `place_part`, `connect`, and `render`.

Example: an Arduino-driven LED with a resistor **in series**.

```text
title Arduino LED
dir right
part uno arduino-uno
part r1 resistor value=220
part led1 led
wire uno.13 -> r1.1 green
wire r1.2 -> led1.A green
wire led1.C -> uno.GND black
```

Keep actual electrical connectivity faithful to the source. Use catalog pin names or supported aliases, red for supply, black for ground, and distinguish signal wires as useful. A layout rendering successfully does not verify circuit electrical safety or correctness. Revise existing scenes with `edit_sketch`.
