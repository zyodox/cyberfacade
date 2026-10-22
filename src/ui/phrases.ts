/**
 * Ready-made sign copy for text fields. Japanese entries carry an English
 * gloss so they can be picked without reading Japanese.
 */
export interface Phrase {
  text: string;
  /** English meaning (Japanese / Chinese / Korean entries only). */
  en?: string;
}

export interface PhraseGroup {
  label: string;
  phrases: Phrase[];
}

const j = (text: string, en: string): Phrase => ({ text, en });
const s = (...texts: string[]): Phrase[] => texts.map((text) => ({ text }));

export const PHRASE_GROUPS: PhraseGroup[] = [
  {
    label: "Japanese · Shop signs",
    phrases: [
      j("営業中", "Open for business"),
      j("二十四時間営業", "Open 24 hours"),
      j("本日休業", "Closed today"),
      j("ラーメン", "Ramen"),
      j("寿司", "Sushi"),
      j("居酒屋", "Izakaya (pub)"),
      j("焼肉", "Grilled meat / BBQ"),
      j("焼鳥", "Yakitori"),
      j("喫茶店", "Coffee shop"),
      j("酒場", "Bar / tavern"),
      j("薬局", "Pharmacy"),
      j("質屋", "Pawn shop"),
      j("ホテル", "Hotel"),
      j("カラオケ", "Karaoke"),
      j("ゲームセンター", "Game arcade"),
      j("パチンコ", "Pachinko"),
      j("コンビニ", "Convenience store"),
      j("クリニック", "Clinic"),
      j("電器店", "Electronics store"),
      j("中古品", "Second-hand goods"),
      j("立ち飲み", "Standing bar"),
      j("食堂", "Diner / canteen"),
      j("銭湯", "Public bath"),
      j("ネットカフェ", "Internet cafe"),
    ],
  },
  {
    label: "Japanese · Ad slogans",
    phrases: [
      j("未来はここに", "The future is here"),
      j("新発売", "New release"),
      j("限定品", "Limited edition"),
      j("期間限定", "Limited time only"),
      j("大特価", "Huge bargain"),
      j("半額", "Half price"),
      j("今すぐ", "Right now"),
      j("無料", "Free"),
      j("最高品質", "Highest quality"),
      j("夢を買おう", "Buy a dream"),
      j("もっと速く", "Faster"),
      j("永遠に若く", "Forever young"),
      j("あなたの新しい体", "Your new body"),
      j("記憶を売ります", "Memories for sale"),
      j("完璧な伴侶", "The perfect companion"),
      j("幸せは合成", "Happiness is synthetic"),
      j("夜は終わらない", "The night never ends"),
      j("さあ、飲もう", "Come on, drink up"),
      j("本物の味", "The real taste"),
      j("ようこそ", "Welcome"),
      j("ありがとう", "Thank you"),
      j("いらっしゃいませ", "Welcome (shop greeting)"),
    ],
  },
  {
    label: "Japanese · Cyber / city",
    phrases: [
      j("ネオン", "Neon"),
      j("電脳", "Cyber-brain"),
      j("電脳都市", "Cyber city"),
      j("新東京", "Neo Tokyo"),
      j("夜の街", "Night town"),
      j("義体", "Cybernetic body"),
      j("人工知能", "Artificial intelligence"),
      j("接続中", "Connecting"),
      j("接続完了", "Connected"),
      j("警告", "Warning"),
      j("危険", "Danger"),
      j("立入禁止", "No entry"),
      j("監視中", "Under surveillance"),
      j("非常口", "Emergency exit"),
      j("信号なし", "No signal"),
      j("再起動", "Reboot"),
      j("データ", "Data"),
      j("システム異常", "System error"),
      j("生体認証", "Biometric ID"),
      j("企業", "Corporation"),
      j("未来", "Future"),
      j("夢", "Dream"),
      j("愛", "Love"),
      j("光", "Light"),
      j("雨", "Rain"),
      j("龍", "Dragon"),
      j("鬼", "Demon"),
      j("桜", "Cherry blossom"),
    ],
  },
  {
    label: "Chinese / Korean",
    phrases: [
      j("营业中", "Open (Chinese)"),
      j("龙门客栈", "Dragon Gate Inn (Chinese)"),
      j("按摩", "Massage (Chinese)"),
      j("饭店", "Restaurant / hotel (Chinese)"),
      j("茶馆", "Tea house (Chinese)"),
      j("发财", "Get rich (Chinese)"),
      j("面馆", "Noodle house (Chinese)"),
      j("노래방", "Karaoke (Korean)"),
      j("편의점", "Convenience store (Korean)"),
      j("영업중", "Open (Korean)"),
    ],
  },
  {
    label: "English · Shop signs",
    phrases: s(
      "OPEN", "OPEN 24/7", "CLOSED", "NOODLES", "RAMEN BAR", "SUSHI", "HOTEL", "MOTEL", "BAR", "LIQUOR",
      "PHARMACY", "CLINIC", "PAWN", "ARCADE", "KARAOKE", "DINER", "COFFEE", "CASINO", "LOUNGE", "CLUB",
      "REPAIRS", "CYBERWARE", "IMPLANTS", "GUNS & AMMO", "VACANCY", "NO VACANCY", "PARKING", "TAXI", "METRO", "EXIT",
    ),
  },
  {
    label: "English · Ad slogans",
    phrases: s(
      "THE FUTURE IS NOW", "LIVE FOREVER", "UPGRADE YOURSELF", "BE MORE HUMAN", "MORE HUMAN THAN HUMAN",
      "EVERYTHING YOU WANT", "BUY NOW", "LIMITED EDITION", "NEW FLAVOUR", "TASTE THE FUTURE",
      "ALWAYS ON", "NEVER SLEEP", "DREAM BIGGER", "YOUR NEW LIFE AWAITS", "OFF-WORLD COLONIES",
      "A NEW LIFE AWAITS YOU", "SYNTHETIC BUT REAL", "FEEL EVERYTHING", "STAY CONNECTED", "OWN THE NIGHT",
      "100% REAL FLAVOUR", "NOW WITH MORE", "ZERO SUGAR · ZERO LIMITS", "PREMIUM MEMORIES", "THINK FASTER",
    ),
  },
  {
    label: "English · Brands (fictional)",
    phrases: s(
      "VOLTA COLA", "NEXUS", "KAIROS", "HELIX", "ORBITAL", "SYNAPSE", "KAGEYAMA CORP", "MERIDIAN",
      "NOVA DYNAMICS", "HALCYON", "OBSIDIAN", "PARALLAX", "VANTA", "QUANTA", "ECHO LABS", "SERAPH GENETICS",
      "KESTREL AIR", "LUMEN", "SOLARIS", "ZENITH",
    ),
  },
  {
    label: "English · Tech / HUD",
    phrases: s(
      "SYSTEM ONLINE", "ACCESS GRANTED", "ACCESS DENIED", "WARNING", "ALERT", "SIGNAL LOST", "NO SIGNAL",
      "UPLOADING", "DOWNLOADING", "SCANNING", "TARGET ACQUIRED", "LOADING", "ERROR 404", "REBOOTING",
      "ENCRYPTED", "RESTRICTED AREA", "AUTHORISED PERSONNEL ONLY", "BIOMETRIC SCAN", "NETWORK SECURE",
      "SECTOR 7", "LEVEL 42", "GATE B-12", "FLOOR 88",
    ),
  },
];

/** Multi-line sets for tickers, playlists, HUD labels and message rotations. */
export const PHRASE_SETS: { label: string; text: string }[] = [
  { label: "JP shop rotation (open · ramen · karaoke · 24h)", text: "営業中\nラーメン\nカラオケ\n二十四時間営業" },
  { label: "JP ad rotation (new · limited · half price · now)", text: "新発売\n期間限定\n半額\n今すぐ" },
  { label: "JP cyber warnings (warning · danger · no entry)", text: "警告\n危険\n立入禁止\n監視中" },
  { label: "JP + EN bilingual ad", text: "未来はここに\nTHE FUTURE IS HERE\n新発売\nNEW RELEASE" },
  { label: "JP + EN hotel", text: "ホテル\nHOTEL\n空室あり\nVACANCY" },
  { label: "EN soda ad", text: "VOLTA COLA\nTASTE THE FUTURE\nZERO SUGAR · ZERO LIMITS\nBUY NOW" },
  { label: "EN off-world ad", text: "A NEW LIFE AWAITS YOU\nIN THE OFF-WORLD COLONIES\nTHE CHANCE TO BEGIN AGAIN" },
  { label: "EN cyberware ad", text: "UPGRADE YOURSELF\nCYBERWARE · IMPLANTS\nBE MORE HUMAN" },
  { label: "EN HUD status", text: "SYSTEM ONLINE\nSCANNING\nTARGET ACQUIRED" },
  { label: "EN ticker news", text: "MARKETS UP 4.2% · WEATHER: ACID RAIN 22:00 · METRO LINE 3 DELAYED · STAY CONNECTED" },
];

export const ALL_PHRASES: Phrase[] = PHRASE_GROUPS.flatMap((g) => g.phrases);
