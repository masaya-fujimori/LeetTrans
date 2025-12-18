/* LeetTrans - offline playful translator (EN <-> JA) */

const $ = (id) => /** @type {HTMLElement} */ (document.getElementById(id));

const els = {
  direction: /** @type {HTMLSelectElement} */ ($("direction")),
  swapBtn: /** @type {HTMLButtonElement} */ ($("swapBtn")),
  level: /** @type {HTMLInputElement} */ ($("level")),
  levelLabel: $("levelLabel"),
  levelHint: $("levelHint"),
  exampleBtn: /** @type {HTMLButtonElement} */ ($("exampleBtn")),
  clearBtn: /** @type {HTMLButtonElement} */ ($("clearBtn")),
  input: /** @type {HTMLTextAreaElement} */ ($("input")),
  output: /** @type {HTMLTextAreaElement} */ ($("output")),
  copyBtn: /** @type {HTMLButtonElement} */ ($("copyBtn")),
  pasteBtn: /** @type {HTMLButtonElement} */ ($("pasteBtn")),
  toast: $("toast"),
  detectedMeta: $("detectedMeta"),
  outputMeta: $("outputMeta"),
  inputCount: $("inputCount"),
  outputCount: $("outputCount"),
};

const LEVEL_HINTS = {
  1: "ちょいLeet（まだギリ読める）",
  2: "だいぶLeet（読むのがしんどい）",
  3: "カオス（文脈的にあり得ない）",
};

const EXAMPLES = [
  { dir: "en2ja", text: "Hello world! This app translates English into impossible Japanese Leet." },
  { dir: "en2ja", text: "Please translate: I love coffee, but I hate deadlines." },
  { dir: "ja2en", text: "こんにちは世界！このアプリは文脈的にあり得ない翻訳をします。" },
  { dir: "ja2en", text: "締め切りは嫌いだけど、コーヒーは好き。よろしくお願いします。" },
];

// --------------------------
// Utilities (deterministic RNG)
// --------------------------

function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function mulberry32(seed) {
  let t = seed >>> 0;
  return function rand() {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

function detectJapanese(text) {
  return /[ぁ-んァ-ン一-龯]/.test(text);
}

function normalizeNewlines(s) {
  return s.replace(/\r\n?/g, "\n");
}

function countChars(s) {
  // JS string length counts UTF-16 code units; for UX this is fine.
  return s.length;
}

function pick(rand, arr) {
  return arr[Math.floor(rand() * arr.length)] ?? arr[0];
}

function chance(rand, p) {
  return rand() < p;
}

function withStableRand(text, level) {
  return mulberry32(fnv1a32(`${level}::${text}`));
}

// --------------------------
// Dictionary (small, playful)
// --------------------------

/** @type {Array<[string, string]>} */
const EN_PHRASES = [
  ["thank you", "ありがとう"],
  ["thanks", "ありがとう"],
  ["good morning", "おはよう"],
  ["good night", "おやすみ"],
  ["i love you", "愛してる"],
  ["i love", "大好き"],
  ["i hate", "嫌い"],
  ["hello", "こんにちは"],
  ["hi", "やあ"],
  ["bye", "じゃあね"],
  ["please", "お願い"],
  ["sorry", "ごめん"],
  ["excuse me", "すみません"],
  ["coffee", "コーヒー"],
  ["deadline", "締め切り"],
  ["translate", "翻訳する"],
  ["app", "アプリ"],
  ["world", "世界"],
];

/** @type {Array<[string, string]>} */
const JA_PHRASES = [
  ["ありがとうございます", "thank you"],
  ["ありがとう", "thanks"],
  ["おはよう", "good morning"],
  ["おやすみ", "good night"],
  ["こんにちは", "hello"],
  ["やあ", "hi"],
  ["じゃあね", "bye"],
  ["お願い", "please"],
  ["ごめん", "sorry"],
  ["すみません", "excuse me"],
  ["コーヒー", "coffee"],
  ["締め切り", "deadline"],
  ["翻訳", "translate"],
  ["アプリ", "app"],
  ["世界", "world"],
];

function applyEnPhraseDict(text) {
  let out = text;
  // longer first
  const sorted = [...EN_PHRASES].sort((a, b) => b[0].length - a[0].length);
  for (const [en, ja] of sorted) {
    const re = new RegExp(`\\b${escapeRegExp(en)}\\b`, "gi");
    out = out.replace(re, ja);
  }
  return out;
}

function applyJaPhraseDict(text) {
  let out = text;
  const sorted = [...JA_PHRASES].sort((a, b) => b[0].length - a[0].length);
  for (const [ja, en] of sorted) {
    out = out.replaceAll(ja, en);
  }
  return out;
}

function escapeRegExp(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// --------------------------
// EN -> "Katakana-ish" (fallback)
// --------------------------

const EN_CHAR_TO_KATA = {
  a: "ア",
  b: "ブ",
  c: "ク",
  d: "ド",
  e: "エ",
  f: "フ",
  g: "グ",
  h: "ハ",
  i: "イ",
  j: "ジ",
  k: "ケ",
  l: "ル",
  m: "ム",
  n: "ン",
  o: "オ",
  p: "プ",
  q: "ク",
  r: "ル",
  s: "ス",
  t: "ト",
  u: "ウ",
  v: "ヴ",
  w: "ワ",
  x: "クス",
  y: "イ",
  z: "ズ",
};

function enWordToKatakanaish(word) {
  const w = word.toLowerCase();
  // quick digraphs (super rough)
  const digraphs = [
    ["tion", "ション"],
    ["ship", "シップ"],
    ["sh", "シ"],
    ["ch", "チ"],
    ["th", "ス"],
    ["ph", "フ"],
    ["qu", "ク"],
    ["ck", "ク"],
  ];
  let i = 0;
  let out = "";
  while (i < w.length) {
    let matched = false;
    for (const [d, rep] of digraphs) {
      if (w.startsWith(d, i)) {
        out += rep;
        i += d.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const ch = w[i];
    out += EN_CHAR_TO_KATA[ch] ?? ch;
    i++;
  }
  return out;
}

// --------------------------
// Kana -> Romaji (fallback)
// --------------------------

const KANA_BASE = {
  あ: "a",
  い: "i",
  う: "u",
  え: "e",
  お: "o",
  か: "ka",
  き: "ki",
  く: "ku",
  け: "ke",
  こ: "ko",
  さ: "sa",
  し: "shi",
  す: "su",
  せ: "se",
  そ: "so",
  た: "ta",
  ち: "chi",
  つ: "tsu",
  て: "te",
  と: "to",
  な: "na",
  に: "ni",
  ぬ: "nu",
  ね: "ne",
  の: "no",
  は: "ha",
  ひ: "hi",
  ふ: "fu",
  へ: "he",
  ほ: "ho",
  ま: "ma",
  み: "mi",
  む: "mu",
  め: "me",
  も: "mo",
  や: "ya",
  ゆ: "yu",
  よ: "yo",
  ら: "ra",
  り: "ri",
  る: "ru",
  れ: "re",
  ろ: "ro",
  わ: "wa",
  を: "wo",
  ん: "n",
  が: "ga",
  ぎ: "gi",
  ぐ: "gu",
  げ: "ge",
  ご: "go",
  ざ: "za",
  じ: "ji",
  ず: "zu",
  ぜ: "ze",
  ぞ: "zo",
  だ: "da",
  ぢ: "ji",
  づ: "zu",
  で: "de",
  ど: "do",
  ば: "ba",
  び: "bi",
  ぶ: "bu",
  べ: "be",
  ぼ: "bo",
  ぱ: "pa",
  ぴ: "pi",
  ぷ: "pu",
  ぺ: "pe",
  ぽ: "po",
  ぁ: "a",
  ぃ: "i",
  ぅ: "u",
  ぇ: "e",
  ぉ: "o",
  ゃ: "ya",
  ゅ: "yu",
  ょ: "yo",
  っ: "",
  ゔ: "vu",
  ー: "-",
};

const KANA_DIGRAPHS = {
  きゃ: "kya",
  きゅ: "kyu",
  きょ: "kyo",
  しゃ: "sha",
  しゅ: "shu",
  しょ: "sho",
  ちゃ: "cha",
  ちゅ: "chu",
  ちょ: "cho",
  にゃ: "nya",
  にゅ: "nyu",
  にょ: "nyo",
  ひゃ: "hya",
  ひゅ: "hyu",
  ひょ: "hyo",
  みゃ: "mya",
  みゅ: "myu",
  みょ: "myo",
  りゃ: "rya",
  りゅ: "ryu",
  りょ: "ryo",
  ぎゃ: "gya",
  ぎゅ: "gyu",
  ぎょ: "gyo",
  じゃ: "ja",
  じゅ: "ju",
  じょ: "jo",
  びゃ: "bya",
  びゅ: "byu",
  びょ: "byo",
  ぴゃ: "pya",
  ぴゅ: "pyu",
  ぴょ: "pyo",
  ふぁ: "fa",
  ふぃ: "fi",
  ふぇ: "fe",
  ふぉ: "fo",
};

function kataToHira(s) {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    // Katakana range
    if (code >= 0x30a1 && code <= 0x30f6) out += String.fromCharCode(code - 0x60);
    else out += ch;
  }
  return out;
}

function kanaToRomaji(s) {
  const hira = kataToHira(s);
  let out = "";
  let i = 0;
  let sokuon = false;
  while (i < hira.length) {
    const ch = hira[i];
    const next2 = hira.slice(i, i + 2);

    if (ch === "っ") {
      sokuon = true;
      i++;
      continue;
    }

    let roma = KANA_DIGRAPHS[next2];
    if (roma) {
      i += 2;
    } else {
      roma = KANA_BASE[ch];
      i += 1;
    }

    if (!roma) {
      out += ch;
      sokuon = false;
      continue;
    }

    if (roma === "-") {
      // long vowel marker: repeat last vowel if possible, else hyphen
      const m = out.match(/[aeiou](?!.*[aeiou])/);
      out += m ? m[0] : "-";
      sokuon = false;
      continue;
    }

    if (ch === "ん") {
      const next = hira[i] ?? "";
      const nextRoma = KANA_BASE[next] ?? "";
      if (/^[aiueoy]/.test(nextRoma)) out += "n'";
      else out += "n";
      sokuon = false;
      continue;
    }

    if (sokuon && roma.length > 0) {
      const c = roma[0];
      if (/[a-z]/.test(c)) out += c;
    }
    sokuon = false;
    out += roma;
  }
  return out;
}

// --------------------------
// Base translation
// --------------------------

function translateBase(text, direction, level) {
  const src = normalizeNewlines(text);
  const rand = withStableRand(src, level);

  if (direction === "en2ja") {
    let t = applyEnPhraseDict(src);
    // Tokenize by word/space/other
    const parts = t.match(/([A-Za-z]+(?:'[A-Za-z]+)?)|(\d+)|(\s+)|([^\sA-Za-z\d]+)/g) || [];
    const outParts = parts.map((p) => {
      if (/^[A-Za-z]/.test(p)) {
        const key = p.toLowerCase();
        const dict = EN_PHRASES.find(([en]) => en === key);
        if (dict) return dict[1];
        return enWordToKatakanaish(p);
      }
      return p;
    });

    let out = outParts.join("");

    // Slightly "Japanese-ish" particles at higher levels (playful)
    if (level >= 2 && out.length > 0) {
      const particles = ["の", "を", "が", "に", "で"];
      out = out.replace(/[。.!?]\s*$/g, (m) => pick(rand, particles) + m);
    }
    return out;
  }

  if (direction === "ja2en") {
    let t = applyJaPhraseDict(src);

    // Romanize kana segments; keep kanji/punct as-is
    let out = "";
    let i = 0;
    while (i < t.length) {
      const ch = t[i];
      if (/[ぁ-んァ-ンー]/.test(ch)) {
        let j = i + 1;
        while (j < t.length && /[ぁ-んァ-ンー]/.test(t[j])) j++;
        const seg = t.slice(i, j);
        out += kanaToRomaji(seg);
        i = j;
        continue;
      }
      out += ch;
      i++;
    }

    // playful politeness inflation at higher levels
    if (level >= 2 && /please|thanks|sorry/i.test(out) === false && chance(rand, 0.25)) {
      out += pick(rand, [" please.", " ok?", " lol.", " (??)"]);
    }
    return out;
  }

  return src;
}

// --------------------------
// Leetify (English)
// --------------------------

const EN_LEET_L1 = {
  a: "4",
  e: "3",
  i: "1",
  o: "0",
  s: "5",
  t: "7",
};

const EN_LEET_L2 = {
  ...EN_LEET_L1,
  b: "8",
  g: "6",
  z: "2",
  l: "|",
  c: "(",
  d: "|)",
  h: "#",
  k: "|<",
  m: "/\\/\\",
  n: "|\\|",
  r: "|2",
  u: "(_)",
  v: "\\/",
  w: "\\/\\/",
  y: "`/",
};

const EN_LEET_L3 = {
  ...EN_LEET_L2,
  f: "ph",
  p: "|*",
  x: "><",
  j: "_|",
  q: "0_",
};

function leetifyEnglish(text, level, rand) {
  const map = level === 1 ? EN_LEET_L1 : level === 2 ? EN_LEET_L2 : EN_LEET_L3;
  const p = level === 1 ? 0.35 : level === 2 ? 0.65 : 0.95;
  const insertP = level === 1 ? 0.02 : level === 2 ? 0.08 : 0.18;
  const inserts = ["_", "-", ".", "~", "*", "=", ":", ";"];

  let out = "";
  for (const ch of text) {
    const lower = ch.toLowerCase();
    const rep = map[lower];
    const should = rep && chance(rand, p);
    let piece = should ? rep : ch;

    // random casing chaos (but keep non-letters)
    if (level >= 2 && /[a-z]/i.test(piece) && chance(rand, 0.22 + 0.12 * (level - 2))) {
      piece = chance(rand, 0.5) ? piece.toUpperCase() : piece.toLowerCase();
    }

    out += piece;
    if (chance(rand, insertP) && /\S/.test(ch)) out += pick(rand, inserts);
  }

  if (level === 3) {
    // occasional bracket wrapping
    if (chance(rand, 0.30) && out.length > 0) out = `[${out}]`;
    // vowel drop (light)
    if (chance(rand, 0.22)) out = out.replace(/[aeiou]/gi, "");
  }
  return out;
}

// --------------------------
// Leetify (Japanese)
// --------------------------

const SMALL_KANA = {
  あ: "ぁ",
  い: "ぃ",
  う: "ぅ",
  え: "ぇ",
  お: "ぉ",
  や: "ゃ",
  ゆ: "ゅ",
  よ: "ょ",
  つ: "っ",
  ア: "ァ",
  イ: "ィ",
  ウ: "ゥ",
  エ: "ェ",
  オ: "ォ",
  ヤ: "ャ",
  ユ: "ュ",
  ヨ: "ョ",
  ツ: "ッ",
};

const JA_LOOKALIKE = {
  の: "σ",
  し: "ι",
  へ: "∧",
  ー: "ｰ",
  ん: "ソ",
  る: "ʀ",
  り: "ʀɪ",
};

const KATA_TO_HALF = {
  ア: "ｱ",
  イ: "ｲ",
  ウ: "ｳ",
  エ: "ｴ",
  オ: "ｵ",
  カ: "ｶ",
  キ: "ｷ",
  ク: "ｸ",
  ケ: "ｹ",
  コ: "ｺ",
  サ: "ｻ",
  シ: "ｼ",
  ス: "ｽ",
  セ: "ｾ",
  ソ: "ｿ",
  タ: "ﾀ",
  チ: "ﾁ",
  ツ: "ﾂ",
  テ: "ﾃ",
  ト: "ﾄ",
  ナ: "ﾅ",
  ニ: "ﾆ",
  ヌ: "ﾇ",
  ネ: "ﾈ",
  ノ: "ﾉ",
  ハ: "ﾊ",
  ヒ: "ﾋ",
  フ: "ﾌ",
  ヘ: "ﾍ",
  ホ: "ﾎ",
  マ: "ﾏ",
  ミ: "ﾐ",
  ム: "ﾑ",
  メ: "ﾒ",
  モ: "ﾓ",
  ヤ: "ﾔ",
  ユ: "ﾕ",
  ヨ: "ﾖ",
  ラ: "ﾗ",
  リ: "ﾘ",
  ル: "ﾙ",
  レ: "ﾚ",
  ロ: "ﾛ",
  ワ: "ﾜ",
  ヲ: "ｦ",
  ン: "ﾝ",
  ガ: "ｶﾞ",
  ギ: "ｷﾞ",
  グ: "ｸﾞ",
  ゲ: "ｹﾞ",
  ゴ: "ｺﾞ",
  ザ: "ｻﾞ",
  ジ: "ｼﾞ",
  ズ: "ｽﾞ",
  ゼ: "ｾﾞ",
  ゾ: "ｿﾞ",
  ダ: "ﾀﾞ",
  ヂ: "ﾁﾞ",
  ヅ: "ﾂﾞ",
  デ: "ﾃﾞ",
  ド: "ﾄﾞ",
  バ: "ﾊﾞ",
  ビ: "ﾋﾞ",
  ブ: "ﾌﾞ",
  ベ: "ﾍﾞ",
  ボ: "ﾎﾞ",
  パ: "ﾊﾟ",
  ピ: "ﾋﾟ",
  プ: "ﾌﾟ",
  ペ: "ﾍﾟ",
  ポ: "ﾎﾟ",
  ヴ: "ｳﾞ",
  ー: "ｰ",
  ・: "･",
};

function hiraToKata(s) {
  let out = "";
  for (const ch of s) {
    const code = ch.charCodeAt(0);
    if (code >= 0x3041 && code <= 0x3096) out += String.fromCharCode(code + 0x60);
    else out += ch;
  }
  return out;
}

function toHalfWidthKatakana(s) {
  let out = "";
  for (const ch of s) out += KATA_TO_HALF[ch] ?? ch;
  return out;
}

function leetifyJapanese(text, level, rand) {
  let out = text;

  if (level >= 2) out = hiraToKata(out);

  const sep = level === 1 ? ["", "", "", "・"] : level === 2 ? ["・", "☆", "♪", "♡"] : ["☆", "♪", "✧", "⚡", "ｗ"];
  const insertP = level === 1 ? 0.04 : level === 2 ? 0.10 : 0.20;

  let tmp = "";
  for (const ch of out) {
    let piece = ch;

    // small-kana twitch
    if (SMALL_KANA[piece] && chance(rand, level === 1 ? 0.28 : level === 2 ? 0.40 : 0.52)) {
      piece = SMALL_KANA[piece];
    }

    // lookalike replacements at high chaos
    if (level === 3 && JA_LOOKALIKE[piece] && chance(rand, 0.55)) {
      piece = JA_LOOKALIKE[piece];
    }

    tmp += piece;
    if (chance(rand, insertP) && /[ぁ-んァ-ン一-龯A-Za-z0-9]/.test(ch)) tmp += pick(rand, sep);
  }

  out = tmp;

  if (level >= 2 && chance(rand, 0.55)) out = toHalfWidthKatakana(out);

  if (level === 3) {
    // occasional broken dakuten (visual chaos)
    if (chance(rand, 0.35)) {
      out = out.replace(/[ァ-ンｱ-ﾝあ-ん]/g, (m) => (chance(rand, 0.08) ? m + "\u3099" : m));
    }
    // wrap
    if (chance(rand, 0.28) && out.length > 0) out = `【${out}】`;
  }

  return out;
}

// --------------------------
// Orchestration
// --------------------------

function translate(text, direction, level) {
  const src = normalizeNewlines(text ?? "");
  const lv = clamp(Number(level) || 1, 1, 3);

  let effective = direction;
  if (direction === "auto") effective = detectJapanese(src) ? "ja2en" : "en2ja";

  const base = translateBase(src, effective, lv);
  const rand = withStableRand(src + "::out", lv);
  const outputLang = effective === "en2ja" ? "ja" : "en";

  const styled =
    outputLang === "en" ? leetifyEnglish(base, lv, rand) : leetifyJapanese(base, lv, rand);

  return { effective, outputLang, base, styled };
}

// --------------------------
// UI glue
// --------------------------

let debounceTimer = 0;
function scheduleTranslate() {
  window.clearTimeout(debounceTimer);
  debounceTimer = window.setTimeout(runTranslate, 60);
}

function setToast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add("show");
  window.setTimeout(() => els.toast.classList.remove("show"), 1400);
}

function setLevelUI() {
  const lv = clamp(Number(els.level.value) || 1, 1, 3);
  els.levelLabel.textContent = `Level ${lv}`;
  els.levelHint.textContent = LEVEL_HINTS[lv];
}

function runTranslate() {
  setLevelUI();
  const lv = Number(els.level.value) || 1;
  const src = els.input.value ?? "";
  const dir = els.direction.value;
  const res = translate(src, dir, lv);

  els.output.value = res.styled;

  const det = res.effective === "en2ja" ? "英語 → 日本語" : "日本語 → 英語";
  els.detectedMeta.textContent = dir === "auto" ? `自動: ${det}` : `指定: ${det}`;
  els.outputMeta.textContent = res.outputLang === "ja" ? "出力: 日本語（Leet）" : "出力: English (Leet)";

  els.inputCount.textContent = `${countChars(src)} 文字`;
  els.outputCount.textContent = `${countChars(res.styled)} 文字`;
}

els.input.addEventListener("input", scheduleTranslate);
els.direction.addEventListener("change", scheduleTranslate);
els.level.addEventListener("input", scheduleTranslate);

els.clearBtn.addEventListener("click", () => {
  els.input.value = "";
  scheduleTranslate();
  setToast("クリアしました");
});

els.exampleBtn.addEventListener("click", () => {
  const lv = Number(els.level.value) || 1;
  const rand = withStableRand(String(Date.now()), lv);
  const ex = pick(rand, EXAMPLES);
  els.input.value = ex.text;
  els.direction.value = "auto";
  scheduleTranslate();
  setToast("例文を入れました");
});

els.swapBtn.addEventListener("click", () => {
  const v = els.direction.value;
  if (v === "auto") {
    // swap based on detection of current input
    const eff = detectJapanese(els.input.value) ? "ja2en" : "en2ja";
    els.direction.value = eff === "ja2en" ? "en2ja" : "ja2en";
  } else if (v === "en2ja") {
    els.direction.value = "ja2en";
  } else if (v === "ja2en") {
    els.direction.value = "en2ja";
  }

  // move output back into input for chaining (fun)
  const curOut = els.output.value;
  if (curOut && curOut.trim().length > 0) els.input.value = curOut;
  scheduleTranslate();
  setToast("方向を入れ替えました");
});

els.copyBtn.addEventListener("click", async () => {
  const text = els.output.value ?? "";
  if (!text) return setToast("出力が空です");
  try {
    await navigator.clipboard.writeText(text);
    setToast("コピーしました");
  } catch {
    // fallback
    els.output.focus();
    els.output.select();
    document.execCommand("copy");
    setToast("コピーしました（フォールバック）");
  }
});

els.pasteBtn.addEventListener("click", async () => {
  try {
    const t = await navigator.clipboard.readText();
    if (!t) return setToast("クリップボードが空です");
    els.input.value = t;
    scheduleTranslate();
    setToast("貼り付けました");
  } catch {
    setToast("貼り付けはブラウザ設定でブロックされています");
  }
});

// Initial render
setLevelUI();
runTranslate();


