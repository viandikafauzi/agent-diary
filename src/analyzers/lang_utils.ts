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

const KK_TONE = {
  apology: [
    "\\b\u043a\u0435\u0448\u0456\u0440\u0456\u043d\u0456\u0437\\b",
    "\\b\u043a\u0435\u0448\u0456\u0440\\b",
    "\\b\u043a\u0435\u0448\u0456\u0440\u0456\u043c\\b",
    "\\b\u043c\u0435\u043d\u0456\u043d\\s+\u049b\u0430\u0442\u0435\u043c\\b",
    "\\b\u043c\u0435\u043d\\s+\u049b\u0430\u0442\u0435\u043b\u0435\u0441\u0442\u0456\u043c\\b",
    "\\b\u043c\u0435\u043d\u0456\u043d\\s+\u043a\u0456\u043d\u04d9\u043c\\b",
    "\\b\u043a\u0456\u043d\u04d9\u043b\u0456\u043c\u0438\u043d\\b",
    "\\b\u0430\u0431\u0430\u0439\u0441\u044b\u0437\u0434\u0430\\b",
    "\\b\u049b\u0430\u043f\u0443\\s+\u0435\u0442\u0456\u043d\u0456\u0437\\b",
    "\\b\u049b\u0430\u043f\u0443\\b",
    "\\b\u0441\u0456\u0437\\s+\u0434\u04b1\u0440\u044b\u0441\u0441\u044b\u0437\\b",
    "\\b\u0441\u0435\u043d\u0456\u043a\u0456\\s+\u0434\u04b1\u0440\u044b\u0441\\b",
  ],
  confidence: [
    "\\b\u04d9\u0440\u0438\u043d\u0435\\b",
    "\\b\u0441\u04d9\u0437\u0441\u0456\u0437\\b",
    "\\b\u043d\u0430\u049b\u0442\u044b\\b",
    "\\b\u0434\u04d9\u043b\\b",
    "\\b\u0434\u04b1\u0440\u044b\u0441\\b",
    "\\b\u043c\u0435\u043d\\s+\u0441\u0435\u043d\u0456\u043c\u0434\u0456\u043c\u0438\u043d\\b",
    "\\b\u043c\u0435\u043d\\s+\u043a\u04af\u043c\u04d9\u043d\u0441\u0456\u0437\u0431\u0438\u043d\\b",
    "\\b\u0430\u043d\u044b\u043a\\b",
    "\\b\u0448\u044b\u043d\\s+\u043c\u04d9\u043d\u0456\u043d\u0434\u0435\\b",
    "\\b\u0440\u0430\u0441\\b",
    "\\b\u0434\u04b1\u043f-\u0434\u04b1\u0440\u044b\u0441\\b",
    "\\b\u0435\u0448\\s+\u043a\u04af\u043c\u04d9\u043d\u0441\u0456\u0437\\b",
    "\\b\u043c\u04af\u043b\u0434\u0435\\s+\u0434\u04b1\u0440\u044b\u0441\\b",
    "\\b\u043f\u0440\u043e\u0431\u043b\u0435\u043c\u0430\\s+\u0436\u043e\u049b\\b",
  ],
  uncertainty: [
    "\\b\u043c\u04af\u043c\u043a\u0456\u043d\\b",
    "\\b\u0431\u04d9\u043b\u043a\u0456\u043c\\b",
    "\\b\u0448\u0430\u043c\u0430\u0441\u044b\\b",
    "\\b\u043c\u0435\u043d\u0456\u043d\u0448\u0435\\b",
    "\\b\u043c\u0435\u043d\\s+\u043e\u0439\u043b\u0430\u0439\u043c\u044b\u043d\\b",
    "\\b\u0431\u0456\u043b\u043c\u0435\u0439\u043c\u0456\u043d\\b",
    "\\b\u0441\u0435\u043d\u0456\u043c\u0434\u0456\\s+\u0435\u043c\u0435\u0441\u043f\u0456\u043d\\b",
    "\\b\u043a\u04af\u043c\u04d9\u043d\u0456\u043c\\s+\u0431\u0430\u0440\\b",
    "\\b\u0442\u04af\u0441\u0456\u043d\u0431\u0435\u0434\u0456\u043c\\b",
    "\\b\u0442\u04af\u0441\u0456\u043d\u0456\u043a\u0441\u0456\u0437\\b",
    "\\b\u0430\u043d\u044b\u043a\\s+\u0435\u043c\u0435\u0441\\b",
    "\\b\u0441\u0456\u0440\u04d9\\b",
    "\\b\u049b\u0430\u0439\u0434\u0430\u043c\\b",
  ],
  helpfulness: [
    "\\b\u0440\u04b1\u049b\u0441\u0430\u0442\\s+\u0435\u0442\u0456\u043d\u0456\u0437\\b",
    "\\b\u043c\u0435\u043d\\s+\u043a\u04d9\u043c\u0435\u043a\u0442\u0435\u0441\u0435\\b",
    "\\b\u043a\u04d9\u043c\u0435\u043a\u0442\u0435\u0441\u0443\u0433\u0435\\s+\u0434\u0430\u0439\u044b\u043d\u043c\u044b\u043d\\b",
    "\\b\u043c\u0435\u043d\\s+\u0436\u0430\u0441\u0430\u0439\\s+\u0430\u043b\u0430\u043c\u044b\u043d\\b",
    "\\b\u043c\u0456\u043d\u0435\\b",
    "\\b\u0431\u044b\u043b\u0430\u0439\\b",
    "\\b\u0441\u0456\u0437\\s+\u0436\u0430\u0441\u0430\u0439\\s+\u0430\u043b\u0430\u0441\u044b\u0437\\b",
    "\\b\u043c\u0435\u043d\\s+\u04b1\u0441\u044b\u043d\u0430\u043c\u044b\u043d\\b",
    "\\b\u043a\u0435\u043d\u0435\u0441\\s+\u0431\u0435\u0440\u0435\u043c\u0456\u043d\\b",
    "\\b\u049b\u0443\u0430\u043d\u0430\\s+\u043a\u04d9\u043c\u0435\u043a\u0442\u0435\u0441\u0435\u043c\u0456\u043d\\b",
    "\\b\u0431\u04b1\u043b\\s+\u043a\u04d9\u043c\u0435\u043a\u0442\u0435\u0441\u0442\u0456\\s+\u043c\u0435\\b",
    "\\b\u0441\u04b1\u0440\u0430\u0439\\s+\u0431\u0435\u0440\u0456\u043d\u0456\u0437\\b",
    "\\b\u0442\u0430\u049b\u044b\\s+\u043a\u04d9\u043c\u0435\u043a\\s+\u043a\u0435\u0440\u0435\u043a\\s+\u043f\u0435\\b",
  ],
  self_correction: [
    "\\b\u0448\u044b\u043d\u044b\u043d\u0434\u0430\\b",
    "\\b\u0442\u043e\u049b\u0442\u0430\u043d\u044b\u0437\\b",
    "\\b\u0442\u043e\u049b\u0442\u0430\\b",
    "\\b\u0434\u04d9\u043b\u0456\u0440\u0435\u043a\\s+\u0430\u0439\u0442\u0441\u0430\u043c\\b",
    "\\b\u043c\u0435\u043d\u0456\u043d\\s+\u0430\u0439\u0442\u0430\u0439\u044b\u043d\\s+\u0434\u0435\u0433\u0435\u043d\u0456\u043c\\b",
    "\\b\u0442\u04b1\u0437\u0435\u0442\u0435\u0439\u0456\u043d\\b",
    "\\b\u043c\u0435\u043d\\s+\u049b\u0430\u0442\u0435\u043b\u0435\u0441\u0442\u0456\u043c\\b",
    "\\b\u049b\u0430\u0442\u0435\\s+\u043e\u043a\u044b\u0434\u044b\u043c\\b",
    "\\b\u049b\u0430\u0442\u0435\\s+\u0442\u04b1\u0441\u0456\u043d\u0434\u0456\u043c\\b",
    "\\b\u043e\u043b\u0430\u0439\\s+\u0435\u043c\u0435\u0441\\b",
    "\\b\u0431\u04b1\u043b\\s+\u049b\u0430\u0442\u0435\\b",
    "\\b\u0436\u0430\u043d\u044b\u043b\u044b\u0441\u0442\u044b\u043c\\b",
    "\\b\u0431\u0430\u0441\u049b\u0430\u0448\u0430\\s+\u0430\u0439\u0442\u0430\u0439\u044b\u043d\\b",
  ],
  agent_question: [
    "\\b\u043d\u0435\\b",
    "\\b\u049b\u0430\u043b\u0430\u0439\\b",
    "\\b\u043d\u0435\u0433\u0435\\b",
    "\\b\u049b\u0430\u0448\u0430\u043d\\b",
    "\\b\u049b\u0430\u0439\u0434\u0430\\b",
    "\\b\u043a\u0456\u043c\\b",
    "\\b\u049b\u0430\u043d\u0434\u0430\u0439\\b",
    "\\b\u0441\u0456\u0437\\s+[\u0430-\u044f\u04d9\u0456\u043d\u04d9\u049b\u04b1\u04b2\u043e\u04d1]+\\s+\u0430\u043b\u0430\u0441\u044b\u0437\\s+\u0431\u0430\\b",
    "\\b\u0431\u043e\u043b\u0430\\s+\u043c\u0430\\b",
    "\\b\u0436\u0430\u0441\u0430\u0439\\s+\u0430\u043b\u0430\u0441\u044b\u0437\\s+\u0431\u0430\\b",
    "\\b\u043a\u04d9\u043c\u0435\u043a\u0442\u0435\u0441\u0435\\s+\u0430\u043b\u0430\u0441\u044b\u0437\\s+\u0431\u0430\\b",
    "\\b\u043c\u04b1\u043c\u043a\u0456\u043d\\s+\u0431\u0435\\b",
    "\\b\u0431\u0430\u0440\\s+\u043c\u0430\\b",
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

const KK_INTERACTION = {
  correction: [
    "\u049b\u0430\u0442\u0435",
    "\u0436\u043e\u049b",
    "\u0434\u04b1\u0440\u044b\u0441 \u0435\u043c\u0435\u0441",
    "\u043e\u043b\u0430\u0439 \u0435\u043c\u0435\u0441",
    "\u049b\u0430\u0439\u0442\u0430\u043b\u0430",
    "\u0436\u04b1\u043c\u044b\u0441 \u0456\u0441\u0442\u0435\u043c\u0435\u0439\u0434\u0456",
    "\u0456\u0441\u0442\u0435\u043c\u0435\u0439\u0434\u0456",
    "\u0431\u04b1\u043b \u0435\u043c\u0435\u0441",
    "\u04d9\u043b\u0456 \u0435\u043c\u0435\u0441",
    "\u0434\u04b1\u0440\u044b\u0441 \u0435\u043c\u0435\u0441 \u049b\u043e\u0439",
    "\u049b\u0430\u0439\u0442\u0430 \u0436\u0430\u0441\u0430",
    "\u0431\u04b1\u0440\u044b\u0441",
    "\u0436\u0430\u043d\u044b\u043b\u044b\u0441",
  ],
  exit_positive: [
    "\u0440\u0430\u0445\u043c\u0435\u0442",
    "\u043a\u04d9\u043f \u0440\u0430\u0445\u043c\u0435\u0442",
    "\u043a\u0435\u0440\u0435\u043c\u0435\u0442",
    "\u0442\u0430\u043c\u0430\u0448\u0430",
    "\u0441\u0430\u0443 \u0431\u043e\u043b",
    "\u0441\u0430\u0443 \u0431\u043e\u043b\u044b\u043d\u044b\u0437",
    "\u0431\u0456\u0442\u0442\u0456",
    "\u0434\u0430\u0439\u044b\u043d",
    "\u0436\u0435\u0442\u043a\u0456\u043b\u0456\u043a\u0442\u0456",
    "\u0436\u0430\u0440\u0430\u0439\u0434\u044b",
    "\u0431\u043e\u043b\u0434\u044b",
  ],
  clarification_question: [
    "\u043d\u0435 \u0430\u0439\u0442\u049b\u044b\u043d\u044b\u0437 \u043a\u0435\u043b\u0434\u0456",
    "\u0442\u04b1\u0441\u0456\u043d\u0434\u0456\u0440\u0435 \u0430\u043b\u0430\u0441\u044b\u0437 \u0431\u0430",
    "\u043d\u0430\u049b\u0442\u044b\u043b\u0430\u0439 \u0430\u043b\u0430\u0441\u044b\u0437 \u0431\u0430",
    "\u0434\u04d9\u043b\u0456\u0440\u0435\u043a \u0430\u0439\u0442\u0441\u0430\u043d\u044b\u0437",
    "\u0441\u0456\u0437 \u043d\u0435 \u0430\u0439\u0442\u044b\u043f \u0442\u04b1\u0440\u0441\u044b\u0437",
    "\u0434\u04b1\u0440\u044b\u0441 \u0442\u04b1\u0441\u0456\u043d\u0434\u0456\u043c \u0431\u0435",
    "\u043d\u0430\u049b\u0442\u044b\u043b\u0430\u0443 \u04b1\u0448\u0456\u043d",
    "\u0442\u04b1\u0441\u0456\u043d\u0433\u0435\u043d\u0456\u043c \u0434\u04b1\u0440\u044b\u0441 \u043f\u0430",
    "\u043d\u0435 \u0456\u0441\u0442\u0435\u0443\u0456\u043c\u0434\u0456 \u049b\u0430\u043b\u0430\u0439\u0441\u044b\u0437",
    "\u049b\u0430\u0439\u0441\u044b\u0441\u044b\u043d",
    "\u0442\u04b1\u0441\u0456\u043d\u0434\u0456\u0440\u0456\u043f \u0436\u0456\u0431\u0435\u0440\u0456\u043d\u0456\u0437\u0448\u0456",
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
    case "kk":
      return KK_TONE;
    default:
      return EN_TONE;
  }
}

function getInteractionTable(lang: string): InteractionPatterns {
  switch (lang) {
    case "id":
      return ID_INTERACTION;
    case "kk":
      return KK_INTERACTION;
    default:
      return EN_INTERACTION;
  }
}

const ISO_TO_SHORT: Record<string, string> = {
  eng: "en",
  ind: "id",
  kaz: "kk",
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
