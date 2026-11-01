import type { QuadrantId } from "./domain/tasks";

const art = {
  notebook: [
    "....ooooooo.....", "...owwwwwwwo....", "..oowwwwwwwoo...", "..obwwwwwwwbo...",
    "..obwwwwwwwbo...", "..obwkkwwkkwbo...", "..obwkkwwkkwbo...", "..obwwwwwwwbo...",
    "..obwwwrrwwbo...", "..obwwrrrrwbo...", "..obwwwwwwwbo...", "..obgggggggbo...",
    "..obgggggggbo...", "...obbbbbbo....", "....ooooooo.....", "................",
  ],
  q2: ["............", ".....gg.....", "....gGg.....", "...gGGGg....", "....gGg.....", ".....g......", "....gGg.....", "...gGGGg....", "..gGGGGGg...", ".....b......", "....bbb.....", "...bbbbb...."],
  q1: ["............", "......r.....", ".....rr.....", "....rRr.....", "...rRRrr....", "...rRRRr....", "..rRRRRrr...", "..rRYRRRr...", "..rRYYRRr...", "...rYYRr....", "....rrrr....", "............"],
  q4: ["............", "............", "..bbbbbbbb..", "..bwwwwwwb..", "..bwbbbbwb..", "..bwbbbbwb..", "..bwwwwwwb..", "..bwoooowb..", "..bwoooowb..", "..bwwwwwwb..", "..bbbbbbbb..", "............"],
  q3: ["............", "......cccc..", ".....cCCCc..", "....cCCCc...", "...cCCCc....", "..cCCCCcc...", "..ccccCCc...", ".....cCCc...", "....cCCc....", "...cCCc.....", "...ccc......", "............"],
} as const;

const colors: Record<string, string> = {
  o: "#453b35", b: "#7f604a", w: "#fff5da", k: "#42382f", r: "#ec8c83",
  g: "#527853", G: "#a7d28b", R: "#e36c64", Y: "#ffd58a", y: "#ffe8af",
  c: "#3d858b", C: "#8ed4d4",
};

export function PixelArt({ kind, className = "" }: { kind: QuadrantId | "notebook"; className?: string }) {
  const rows = art[kind];
  return (
    <svg className={className} viewBox={`0 0 ${rows[0].length} ${rows.length}`} shapeRendering="crispEdges" aria-hidden="true" focusable="false">
      {rows.flatMap((row, y) => [...row].map((cell, x) => cell === "." ? null : <rect key={`${x}-${y}`} x={x} y={y} width="1" height="1" fill={colors[cell]} />))}
    </svg>
  );
}
