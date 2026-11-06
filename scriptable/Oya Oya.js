// ============================================
// OYA OYA — lock screen inline widget (Scriptable)
// The one-line slot above the clock. iOS always keeps the
// date there; this text shows right after it.
//
// SETUP: paste into Scriptable, name it "Oya Oya".
// Lock screen > Customize > tap the date above the clock >
// pick Scriptable > tap it > Script = Oya Oya.
// ============================================

const QUOTE = "Oya Oya";
const SYMBOL = "";            // optional SF Symbol before the text, e.g. "flame.fill" or "eye"

const w = new ListWidget();
if (SYMBOL) {
  const img = w.addImage(SFSymbol.named(SYMBOL).image);
  img.imageSize = new Size(12, 12);
}
w.addText(QUOTE);

if (config.runsInWidget) Script.setWidget(w);
else if (w.presentAccessoryInline) await w.presentAccessoryInline();
else await w.presentSmall();
Script.complete();
