# Original Sketchy compact scene syntax

Draw a whole scene and show it. One element per line:
title <text> | subtitle <text> | dir right|down
group <id> <label> [in <parent>]
<id> <label> [@icon] [(cylinder|person|note|circle|rounded|text)] [in <group>] [!accent|!muted] [file=<absolute path>] [~ hover text]
<a> -> <b> [label] [!accent|!muted]   (--> dashed, <-> both ends)
label <id>[.<pin>] <text>      (photo region with spaces: label <image>.<region>: <text>)
image <id from find_image>
step <title>: <text> | <ids to highlight; edges as a->b>
part <id> <type> [key=value] [caption]   (types and pins: search_parts)
wire <part.pin> -> <part.pin> [red|black|blue|green|yellow|orange|purple|gray|white]
draw <id> [WxH] [in <group>] [: title]   (free drawing on its own canvas, default 100x100, y down; the shape lines follow, later lines paint on top)
  circle [name] x,y r | ellipse [name] x,y rx ry | rect [name] x,y w h (x,y = top left)
  line|arrow|curve [name] x,y x,y … | shape|blob [name] x,y x,y x,y … (closed; curve and blob are smooth)
  arc [name] x,y r from to (degrees, 0 = right, counter-clockwise) | text [name] x,y words [size=14]
  object <type> [name] x,y [size] [rotate=45] [flip]   (types: person, tree, cloud, house, car, bike, gear, sun, bulb, battery, laptop, phone, server, book, heart, drop, flame, mountain, flask, rocket, lock, key) | icon [name] x,y <lucide name> [size]
  repeat i=0..7: <shape line>   (i in coordinates, {i+1} in names and labels)
  let w = 84-12*a   (names a sub-expression for the lines below; keeps long coordinates short)
  angle [name] x,y cx,cy x,y [r] (arc at the middle point; 90° gets the square) | measure [name] x,y x,y [offset] (dimension line)
  brace [name] x,y x,y [depth] (curly brace, bulging to the right of the way) | axes [name] x,y w h [ticks=10] [~ x name | y name] (x,y = origin) | grid [name] x,y w h [step]
  slider a 0..1 [= 0] [hidden]   (before the shapes using it; coordinates may use a, the reader gets a control unless hidden)
  Options: fill=<color> hatch=<color> color=<color> width=2 --dashed arrow both !accent !muted stage=2 along=<shape name>@<0..1> move=<dx>,<dy> ~ label
  Colors: black gray white accent yellow blue red green purple orange. Coordinates may be math: 50+30*cos(1),50. Use ~ label instead of text wherever you can: Sketchy places labels clear of the drawing. $x^2$ works in labels.
  In steps: "| pic[name]" circles a named shape; "pic=2" shows only shapes up to stage 2, so a picture can build up (start with pic=1); "a=0.5" glides a slider there, which is how things move. Draw a moving shape at its start and shift it with move=40*a,0; a shape with along=wire@a rides on the shape named wire, its own x,y being an offset (usually 0,0). Every step should end in a clear picture: move things all the way, one idea per step, never stop a motion halfway.
timeline|cycle|pyramid|funnel|venn|matrix|mindmap <id> [in <group>] [: title]   (ready-made explanation shapes; entries follow, one per line, a blank line ends them; end an entry with !accent, !muted or ~ small print)
  timeline: <when> | <what>   cycle, pyramid (top first), funnel (top first): <entry>
  mindmap: <centre>, then - <branch>, -- <sub-branch>
  venn: set a Cats, set b Dogs, then a | purrs, a,b | pets   (2 or 3 sets)
  matrix: cols Option | Price | Speed, then Cheap | 1 € | slow
  In steps: "| t[2]" circles the 2nd entry, "t=2" shows only the first 2.
molecule <id> <SMILES> [full] [in <group>] [: title]   (structural formula, e.g. CCO, c1ccccc1, CC(=O)O; full writes out every C and H; steps circle atoms as m[3], counted in SMILES order)
map <id> [world|europe|africa|asia|middle-east|north-america|south-america|americas|oceania|<country>|west,south,east,north] [: title]   (lines follow, a blank line ends them)
  <English country name> [fill=<color>|hatch=<color>|!accent] [~ label] | place [name] lat,lon [label] [!accent] | route [name:] <place|lat,lon> -> <place|lat,lon> [--dashed] [~ label]
  In steps: "| m[Germany]" or "m[United-Kingdom]" circles a country, "m[berlin]" a place or route.
Icons: @globe, @database, @server (Lucide) or @simple-icons:react. Ids: letters, digits, _ or -.

# Follow-up patches

Change the drawing from the last sketch call without resending it. Same line syntax as sketch; prefer this tool for follow-up changes.
A line for an id that exists replaces that element; a new id adds one. Arrows are matched by their two ends. Give the whole element line.
remove <id> | remove <a> -> <b> | remove <drawing>[<shape name or number, counted from 1>] | remove steps
Inside "draw <id>" lines, named shapes are replaced, an unnamed text with the same words is moved, others are added. Any step line replaces all steps. Other figures are replaced whole.
