import { franc } from "franc";

const EN_TONE = {
  apology: [
    "\\bsorry\\b",
    "\\bapologi[sz]e\\b",
    "\\bmy\\s+mistake\\b",
    "\\bmy\\s+fault\\b",
    "\\bI\\s+was\\s+wrong\\b",
    "\\bI\\s+apologi[sz]e\\b",
    "\\bmy\\s+bad\\b",
    "\\bthat\\s+was\\s+incorrect\\b",
    "\\bI\\s+messed\\s+up\\b",
    "\\byou\\s+are\\s+right\\b",
    "\\byou\u2019re\\s+right\\b",
    "\\bgood\\s+catch\\b",
  ],
  confidence: [
    "\\bdefinitely\\b",
    "\\bcertainly\\b",
    "\\bI\\s+am\\s+sure\\b",
    "\\bI\u2019m\\s+sure\\b",
    "\\bclearly\\b",
    "\\bobviously\\b",
    "\\bwithout\\s+doubt\\b",
    "\\babsolutely\\b",
    "\\bindeed\\b",
    "\\bexactly\\b",
    "\\bprecisely\\b",
    "\\bthat\\s+is\\s+correct\\b",
    "\\bthat\u2019s\\s+correct\\b",
    "\\bno\\s+problem\\b",
  ],
  uncertainty: [
    "\\bmaybe\\b",
    "\\bperhaps\\b",
    "\\bI\\s+think\\b",
    "\\bnot\\s+sure\\b",
    "\\bmight\\s+be\\b",
    "\\bcould\\s+be\\b",
    "\\bpossibly\\b",
    "\\bprobably\\b",
    "\\bI\\s+believe\\b",
    "\\bit\\s+seems\\b",
    "\\bappears?\\b",
    "\\bI\\s+guess\\b",
    "\\bunsure\\b",
    "\\bunclear\\b",
    "\\bI\\s+don\u2019t\\s+know\\b",
    "\\bI\\s+would\\s+guess\\b",
    "\\bsounds?\\s+like\\b",
  ],
  helpfulness: [
    "\\blet\\s+me\\b",
    "\\bI\\s+can\\b",
    "\\bI\u2019ll\\b",
    "\\bI\\s+will\\b",
    "\\bhere\u2019s\\b",
    "\\bhere\\s+is\\b",
    "\\byou\\s+can\\b",
    "\\bwould\\s+you\\s+like\\b",
    "\\blet\u2019s\\b",
    "\\bI\\s+recommend\\b",
    "\\bI\\s+suggest\\b",
    "\\bfeel\\s+free\\b",
    "\\bhappy\\s+to\\b",
    "\\bglad\\s+to\\b",
    "\\byou\u2019re\\s+welcome\\b",
    "\\bI\\s+will\\s+help\\b",
    "\\bI\\s+can\\s+help\\b",
    "\\bhere\\s+you\\s+go\\b",
    "\\bdid\\s+that\\s+help\\b",
    "\\bdoes\\s+that\\s+help\\b",
  ],
  self_correction: [
    "\\bactually\\b",
    "\\bwait\\b",
    "\\blet\\s+me\\s+reconsider\\b",
    "\\bon\\s+second\\s+thought\\b",
    "\\brather\\b",
    "\\bI\\s+mean\\b",
    "\\bscratch\\s+that\\b",
    "\\blet\\s+me\\s+rephrase\\b",
    "\\binstead\\b",
    "\\bcorrection\\b",
    "\\bI\\s+should\\s+have\\b",
    "\\bthat\u2019s\\s+not\\s+right\\b",
    "\\blet\\s+me\\s+fix\\b",
    "\\bhold\\s+on\\b",
    "\\bI\\s+misread\\b",
    "\\bI\\s+misunderstood\\b",
  ],
  agent_question: [
    "\\bwhat\\b",
    "\\bhow\\b",
    "\\bwhy\\b",
    "\\bwhen\\b",
    "\\bwhere\\b",
    "\\bwho\\b",
    "\\bwhich\\b",
    "\\bcan\\s+you\\b",
    "\\bcould\\s+you\\b",
    "\\bwould\\s+you\\b",
    "\\bdo\\s+you\\b",
    "\\bdoes\\s+that\\b",
    "\\bis\\s+that\\b",
    "\\bare\\s+you\\b",
    "\\bshall\\s+I\\b",
    "\\bwould\\s+you\\s+like\\b",
    "\\bdo\\s+you\\s+want\\b",
  ],
};

const ID_TONE = {
  apology: [
    "\\bmaaf\\b",
    "\\bmaafkan\\b",
    "\\bminta\\s+maaf\\b",
    "\\bsaya\\s+salah\\b",
    "\\baku\\s+salah\\b",
    "\\bkesalahan\\w*\\b",
    "\\bsalah\\s+saya\\b",
    "\\bseharusnya\\b",
    "\\bsepertinya\\s+salah\\b",
    "\\bmaaf\\s+ya\\b",
    "\\boh\\s+maaf\\b",
  ],
  confidence: [
    "\\btentu\\b",
    "\\btentunya\\b",
    "\\bpasti\\b",
    "\\byakin\\b",
    "\\bjelas\\b",
    "\\b100%\\b",
    "\\bsudah\\s+pasti\\b",
    "\\bdengan\\s+yakin\\b",
    "\\bgampang\\b",
    "\\bmudah\\b",
    "\\bsaya\\s+yakin\\b",
    "\\baku\\s+yakin\\b",
    "\\btidak\\s+ada\\s+masalah\\b",
  ],
  uncertainty: [
    "\\bmungkin\\b",
    "\\bbarangkali\\b",
    "\\bsepertinya\\b",
    "\\bkayaknya\\b",
    "\\bkurang\\s+yakin\\b",
    "\\bbelum\\s+tahu\\b",
    "\\btidak\\s+tahu\\b",
    "\\bgak\\s+tahu\\b",
    "\\bnggak\\s+tahu\\b",
    "\\bragu\\b",
    "\\bkurang\\s+tau\\b",
    "\\bbisa\\s+jadi\\b",
    "\\btampaknya\\b",
    "\\baku\\s+pikir\\b",
    "\\bsaya\\s+pikir\\b",
  ],
  helpfulness: [
    "\\bbiar\\s+saya\\b",
    "\\bsaya\\s+bisa\\b",
    "\\baku\\s+bisa\\b",
    "\\bsaya\\s+akan\\b",
    "\\baku\\s+akan\\b",
    "\\bberikut\\b",
    "\\bini\\s+dia\\b",
    "\\bkamu\\s+bisa\\b",
    "\\banda\\s+bisa\\b",
    "\\bmari\\b",
    "\\bsaya\\s+sarankan\\b",
    "\\bsaya\\s+rekomendasikan\\b",
    "\\bsilakan\\b",
    "\\bsilahkan\\b",
    "\\bsenang\\s+membantu\\b",
    "\\bdengan\\s+senang\\s+hati\\b",
    "\\bsama-sama\\b",
    "\\bsaya\\s+akan\\s+membantu\\b",
    "\\baku\\s+akan\\s+membantu\\b",
    "\\bapakah\\s+membantu\\b",
  ],
  self_correction: [
    "\\bsebenarnya\\b",
    "\\btunggu\\b",
    "\\bentar\\b",
    "\\bmaksud\\w*\\s+saya\\b",
    "\\blupakan\\b",
    "\\bbiar\\s+saya\\s+ulang\\b",
    "\\bganti\\b",
    "\\boh\\s+iya\\b",
    "\\bmaksudku\\b",
    "\\bmaksud\\s+saya\\b",
    "\\bbiar\\s+saya\\s+perbaiki\\b",
    "\\bsaya\\s+keliru\\b",
    "\\bsaya\\s+salah\\s+baca\\b",
    "\\bbukan\\s+begitu\\b",
  ],
  agent_question: [
    "\\bapa\\b",
    "\\bbagaimana\\b",
    "\\bmengapa\\b",
    "\\bkenapa\\b",
    "\\bkapan\\b",
    "\\bdimana\\b",
    "\\bsiapa\\b",
    "\\byang\\s+mana\\b",
    "\\bbisakah\\b",
    "\\bbisa\\s+kamu\\b",
    "\\bbisa\\s+anda\\b",
    "\\bapakah\\b",
    "\\bapakah\\s+itu\\b",
    "\\bapakah\\s+kamu\\b",
    "\\bapakah\\s+anda\\b",
    "\\bbingung\\b",
    "\\bmaukah\\b",
  ],
};


const EN_INTERACTION = {
  correction: [
    "wrong",
    "nope",
    "incorrect",
    "actually",
    "i meant",
    "what i meant",
    "that\u2019s not",
    "don\u2019t do",
    "do not",
    "shouldn\u2019t",
    "should not",
    "try again",
    "redo",
    "re-do",
    "not yet",
    "not what i",
    "not correct",
    "not working",
    "doesn\u2019t work",
    "didn\u2019t work",
    "still broken",
    "not right",
  ],
  exit_positive: [
    "thanks",
    "thank",
    "perfect",
    "great",
    "goodbye",
    "bye",
    "done",
    "that\u2019s all",
    "all good",
    "resolved",
    "/exit",
  ],
  clarification_question: [
    "what do you mean",
    "can you clarify",
    "could you clarify",
    "do you mean",
    "are you saying",
    "do you want me to",
    "would you like me to",
    "to confirm",
    "just to be clear",
    "let me make sure",
    "so you want",
    "is this what you",
    "am i understanding",
    "to clarify",
    "which one",
    "did you mean",
    "let me know if",
  ],
};

const ID_INTERACTION = {
  correction: [
    "salah",
    "bukan",
    "bukan itu",
    "maksudnya",
    "seharusnya",
    "bukan begitu",
    "jangan",
    "coba lagi",
    "ulang",
    "ulangi",
    "belum",
    "bukan ini",
    "salah semua",
    "masih salah",
    "tidak benar",
    "nggak",
    "gak",
    "tidak sesuai",
    "bukan gitu",
    "salah lagi",
  ],
  exit_positive: [
    "makasih",
    "terima kasih",
    "terimakasih",
    "thanks",
    "thank",
    "sempurna",
    "bagus",
    "hebat",
    "mantap",
    "oke",
    "ok",
    "selesai",
    "sudah",
    "cukup",
    "done",
    "bye",
    "dadah",
    "baik terima kasih",
    "baiklah",
  ],
  clarification_question: [
    "maksud kamu",
    "maksud anda",
    "apa yang kamu maksud",
    "bisa dijelaskan",
    "bisa klarifikasi",
    "apakah kamu mengatakan",
    "apakah maksudmu",
    "apakah anda mengatakan",
    "apakah kamu mau",
    "untuk memastikan",
    "biar jelas",
    "jadi kamu mau",
    "apakah ini yang",
    "apakah saya memahami",
    "untuk klarifikasi",
    "yang mana",
    "tolong jelaskan",
  ],
};


const TONE_EMOJI = {
  apology: new Set(["😅", "😓", "😔", "🙏", "😬", "🥺"]),
  confidence: new Set(["💪", "🔥", "✅", "✔️", "🎯"]),
  uncertainty: new Set(["🤔", "😕", "🤷", "🧐"]),
  helpfulness: new Set(["👍", "👌", "🙌", "✨", "💡", "😊"]),
  self_correction: new Set(["🔄", "✏️", "📝"]),
  positive: new Set(["😊", "👍", "🎉", "✅", "🙌", "💯", "🔥", "✨"]),
  negative: new Set(["😞", "😠", "😤", "👎", "❌", "💀"]),
  question: new Set(["❓", "❔", "🤔"]),
  gratitude: new Set(["🙏", "😊"]),
};

type ToneCategory =
  | "apology"
  | "confidence"
  | "uncertainty"
  | "helpfulness"
  | "self_correction"
  | "agent_question";

type InteractionCategory = "correction" | "exit_positive" | "clarification_question";

type TonePatterns = Record<ToneCategory, string[]>;
type InteractionPatterns = Record<InteractionCategory, string[]>;

function getToneTable(lang: string): TonePatterns {
  switch (lang) {
    case "id":
      return ID_TONE;
    default:
      return EN_TONE;
  }
}

function getInteractionTable(lang: string): InteractionPatterns {
  switch (lang) {
    case "id":
      return ID_INTERACTION;
    default:
      return EN_INTERACTION;
  }
}

const ISO_TO_SHORT: Record<string, string> = {
  eng: "en",
  ind: "id",
};

export function detectLanguage(texts: string[]): string {
  const sample = texts.slice(0, 100).join(" ").trim();
  if (sample.length < 10) return "en";
  const detected = franc(sample);
  return ISO_TO_SHORT[detected] ?? "en";
}

export function getTonePatterns(lang: string): TonePatterns {
  return getToneTable(lang);
}

export function getInteractionPatterns(lang: string): InteractionPatterns {
  return getInteractionTable(lang);
}

export function matchTonePattern(
  patterns: TonePatterns,
  category: ToneCategory,
  text: string,
): boolean {
  const regexes = patterns[category] ?? [];
  return regexes.some((re) => new RegExp(re, "i").test(text));
}

export function matchInteractionPattern(
  patterns: InteractionPatterns,
  category: InteractionCategory,
  text: string,
): boolean {
  const substrings = patterns[category] ?? [];
  const lower = text.toLowerCase();
  return substrings.some((sub) => lower.includes(sub.toLowerCase()));
}

export function hasQuestionMark(text: string): boolean {
  return text.includes("?");
}

export function hasExclamation(text: string): boolean {
  return text.includes("!");
}

export function hasRepeatedChars(text: string): boolean {
  return /(.)\1{2,}/.test(text);
}

export function hasEmoji(
  text: string,
  category: keyof typeof TONE_EMOJI,
): boolean {
  const emojis = TONE_EMOJI[category];
  if (!emojis) return false;
  return Array.from(emojis).some((emoji) => text.includes(emoji));
}

export function countAllCapsWords(text: string): number {
  const words = text.match(/\b[A-Z]{2,}\b/g);
  return words?.length ?? 0;
}
