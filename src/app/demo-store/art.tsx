/* Original vector artwork for the storefront (no third-party imagery).
 * Built as plain SVG markup so it can be used both in React pages and as standalone product images. */

export type BikeVariant = "flat" | "city" | "trail" | "road" | "gravel";
export type ItemKind = "helmet" | "lock" | "pannier" | "cap" | "tee";

const RW = { x: 143, y: 255 };
const FW = { x: 560, y: 255 };
const BB = { x: 305, y: 268 };
const SEAT = { x: 262, y: 92 };
const HEAD_TOP = { x: 498, y: 78 };
const HEAD_BOT = { x: 512, y: 114 };
const P = (a: { x: number; y: number }) => `${a.x} ${a.y}`;

function wheel(c: { x: number; y: number }, r: number, tire: number, spin: boolean): string {
  let spokes = "";
  for (let i = 0; i < 18; i++) {
    const a = (i / 18) * Math.PI * 2;
    spokes += `<line x1="${(c.x + Math.cos(a) * 9).toFixed(1)}" y1="${(c.y + Math.sin(a) * 9).toFixed(1)}" x2="${(c.x + Math.cos(a) * (r - 10)).toFixed(1)}" y2="${(c.y + Math.sin(a) * (r - 10)).toFixed(1)}"/>`;
  }
  return (
    `<circle cx="${c.x}" cy="${c.y}" r="${r}" fill="none" stroke="#17181b" stroke-width="${tire}"/>` +
    `<circle cx="${c.x}" cy="${c.y}" r="${r - tire / 2 - 3}" fill="none" stroke="#aeb2ba" stroke-width="3"/>` +
    `<g${spin ? ' class="cd-spin"' : ""} stroke="#8d929b" stroke-width="1.1" opacity=".55">${spokes}</g>` +
    `<circle cx="${c.x}" cy="${c.y}" r="8" fill="#2a2c31"/>`
  );
}

export function bikeMarkup(variant: BikeVariant = "flat", frame = "#1b1d20", spin = false, shadow = true): string {
  const trail = variant === "trail";
  const city = variant === "city";
  const drop = variant === "road" || variant === "gravel";
  const tire = trail ? 16 : variant === "gravel" ? 13 : city ? 11 : 9;
  const line = (stroke: string, w: number) => `fill="none" stroke="${stroke}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"`;
  const bars = drop
    ? `<path d="M489 56 L520 50 Q552 48 548 80 Q546 96 528 96" ${line("#23252a", 7)}/>`
    : city
      ? `<path d="M492 54 Q470 40 440 50" ${line("#23252a", 7)}/>`
      : `<path d="M462 48 L526 44" ${line("#23252a", 8)}/>`;
  const topTube = city
    ? `<path d="M${HEAD_TOP.x} 84 Q390 205 287 198" ${line(frame, 13)}/>`
    : `<path d="M${SEAT.x} ${SEAT.y + 4} L${HEAD_TOP.x} ${HEAD_TOP.y + 4}" ${line(frame, drop ? 11 : 12)}/>`;
  const fenders = city
    ? `<g ${line(frame, 6)} opacity=".95"><path d="M${RW.x - 124} ${RW.y} A124 124 0 0 1 ${RW.x + 124} ${RW.y}"/><path d="M${FW.x - 124} ${FW.y} A124 124 0 0 1 ${FW.x + 124} ${FW.y}"/><path d="M120 132 H258 M150 130 L148 170 M232 130 L262 100" stroke-width="5"/></g>`
    : "";
  return (
    (shadow ? `<ellipse cx="352" cy="392" rx="300" ry="9" fill="rgba(0,0,0,.14)"/>` : "") +
    wheel(RW, 118, tire, spin) + wheel(FW, 118, tire, spin) + fenders +
    `<g stroke="#5b5f68" stroke-width="2" fill="none"><line x1="${RW.x}" y1="241" x2="${BB.x}" y2="245"/><line x1="${RW.x}" y1="270" x2="${BB.x}" y2="291"/></g>` +
    `<circle cx="${RW.x}" cy="${RW.y}" r="17" fill="#c9cdd4" stroke="#7d828b" stroke-width="2"/>` +
    `<circle cx="${BB.x}" cy="${BB.y}" r="25" fill="none" stroke="#2f3136" stroke-width="5"/><circle cx="${BB.x}" cy="${BB.y}" r="8" fill="#23252a"/>` +
    `<path d="M${BB.x} ${BB.y} L${BB.x + 36} ${BB.y + 14}" ${line("#23252a", 7)}/>` +
    `<circle cx="${FW.x}" cy="${FW.y}" r="22" fill="none" stroke="#b5b9c0" stroke-width="3"/>` +
    `<g ${line(frame, 13)}>` +
    `<path d="M${P(BB)} L${P(SEAT)}" stroke-width="13"/>${topTube}` +
    `<path d="M${P(BB)} L${HEAD_BOT.x - 4} ${HEAD_BOT.y - 6}" stroke-width="16"/>` +
    `<path d="M${HEAD_TOP.x} ${HEAD_TOP.y - 4} L${HEAD_BOT.x} ${HEAD_BOT.y}" stroke-width="17"/>` +
    `<path d="M${P(BB)} L${P(RW)}" stroke-width="9"/><path d="M${SEAT.x + 3} ${SEAT.y + 8} L${P(RW)}" stroke-width="8"/></g>` +
    `<path d="M${HEAD_BOT.x} ${HEAD_BOT.y} Q${HEAD_BOT.x + 24} 190 ${FW.x} ${FW.y}" ${line(trail ? frame : "#25272c", trail ? 13 : 10)}/>` +
    `<path d="M${HEAD_TOP.x} ${HEAD_TOP.y - 6} L${HEAD_TOP.x - 4} 56" ${line("#23252a", 9)}/>` + bars +
    `<path d="M${SEAT.x} ${SEAT.y} L${SEAT.x - 8} 62" ${line("#23252a", 8)}/>` +
    `<path d="M214 60 Q246 52 284 60 Q250 70 214 60Z" fill="#17181b" stroke="#17181b" stroke-width="9" stroke-linejoin="round"/>`
  );
}

export function itemMarkup(kind: ItemKind, color: string): string {
  const dark = "rgba(0,0,0,.18)";
  const shadow = `<ellipse cx="200" cy="268" rx="130" ry="8" fill="rgba(0,0,0,.12)"/>`;
  switch (kind) {
    case "helmet":
      return shadow +
        `<path d="M70 196 C68 108 135 62 208 62 C288 62 338 112 340 196 Z" fill="${color}"/>` +
        `<path d="M62 196 H350 q10 0 10 14 v8 H52 v-8 q0-14 10-14z" fill="${dark}"/>` +
        [130, 190, 250].map((x) => `<ellipse cx="${x}" cy="128" rx="14" ry="30" fill="rgba(255,255,255,.55)" transform="rotate(-12 ${x} 128)"/>`).join("") +
        `<rect x="316" y="164" width="20" height="10" rx="4" fill="#e4572e"/>`;
    case "lock":
      return shadow +
        `<path d="M128 214 V124 a72 72 0 0 1 144 0 V214" fill="none" stroke="${color}" stroke-width="26" stroke-linecap="round"/>` +
        `<rect x="104" y="204" width="192" height="52" rx="12" fill="#26282d"/><circle cx="200" cy="230" r="8" fill="#0e0f11"/>`;
    case "pannier":
      return shadow +
        `<rect x="70" y="80" width="130" height="170" rx="22" fill="${color}"/><rect x="70" y="80" width="130" height="34" rx="14" fill="rgba(255,255,255,.14)"/>` +
        `<rect x="200" y="100" width="130" height="150" rx="22" fill="${color}" opacity=".78"/><rect x="200" y="100" width="130" height="30" rx="14" fill="rgba(255,255,255,.12)"/>` +
        `<rect x="120" y="140" width="30" height="46" rx="6" fill="#e4572e"/>`;
    case "cap":
      return shadow +
        `<path d="M88 178 C88 100 146 72 200 72 C256 72 308 102 312 178 Z" fill="${color}" stroke="rgba(0,0,0,.08)"/>` +
        `<path d="M296 176 q70 4 78 40 q-44 12 -118 -6 z" fill="${color}" stroke="rgba(0,0,0,.1)"/><circle cx="200" cy="74" r="7" fill="${dark}"/>`;
    default:
      return shadow +
        `<path d="M122 66 L162 52 q38 24 76 0 L278 66 L338 122 L302 154 L276 134 V250 H124 V134 L98 154 L62 122 Z" fill="${color}"/>` +
        `<path d="M162 52 q38 24 76 0" fill="none" stroke="rgba(0,0,0,.15)" stroke-width="6"/>`;
  }
}

export function BikeArt({ variant = "flat", frame = "#1b1d20", spin = false, shadow = true }: { variant?: BikeVariant; frame?: string; spin?: boolean; shadow?: boolean }) {
  return <svg viewBox="0 0 720 410" role="img" aria-hidden="true" style={{ width: "100%", height: "auto", display: "block" }} dangerouslySetInnerHTML={{ __html: bikeMarkup(variant, frame, spin, shadow) }} />;
}

export function ItemArt({ kind, color }: { kind: ItemKind; color: string }) {
  return <svg viewBox="0 0 400 300" role="img" aria-hidden="true" style={{ width: "100%", height: "auto", display: "block" }} dangerouslySetInnerHTML={{ __html: itemMarkup(kind, color) }} />;
}
