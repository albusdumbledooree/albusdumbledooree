# FLOWI montaj uslubi: "Qizil kolaj-esse" (reference tahlili)

Manba: foydalanuvchi yuborgan namuna reels (720x1280, 24 fps, 27 s, AE'da qilingan).
Kadrlar: `ref-collage-sheet.jpg` (har 0.67 s), `ref-collage-ribbon.jpg` (lenta o'tishi), `ref-collage-glitch.jpg` (flash/glitch o'tishi).
Bu uslub FLOWI reels uchun ASOSIY uslub. Yangi reels yasashdan oldin shu faylni o'qi.

## 1. Hikoya tuzilishi (ovoz boshqaradi)
- Ovozli esse: diktor gapiradi, ekrandagi matn so'zma-so'z ovozga sinxron.
- Ilmoq — provokatsion savol (0–2.5 s): "What if aging was never the problem, but the fear of it was?"
- Keyin: tarix/sabab → "dushman" (sanoat, tizim) → burilish → CTA.
- 27 s, ~41 so'z birinchi 12 s'da: tez, lekin tushunarli (≈3.4 so'z/s).

## 2. Ritm
- 11 shot, lekin ko'p "kesish" aslida uzluksiz transformatsiya (kamera yaqinlashadi, qatlam almashadi).
- Boshlanish sekinroq (kesishlar 2.5 s, 7.1 s, 9.5 s), o'rtada tezlashuv (12.5–15 s oralig'ida 5 ta kesish), oxiri sekin CTA (20–27 s).
- Muhim so'z — zarb (beat) bilan "punch" scale.

## 3. Rang va ko'rinish
- Fon: to'q qizil / bordo gradient, kuchli vinyetka, qorong'i (luma ~60/255), iliq (warmth +32), to'yinganlik o'rtacha.
- Odamlar va buyumlar: oq-qora / kulrang, kesilgan (cutout), halftone / gazeta-bosma teksturasi, vintage gravyura ko'rinishi.
- Aksent: yorqin qizil (bitta so'z, chiziqlar, xochlar). Matn: krem / och-oq, yumshoq glow.
- Ustida: film grain, chang, yengil light leak va uchqunlar.

## 4. Tipografiya
- Yuqori kontrastli, tor serif display shrift (Didone uslubi: Abril Fatface / Playfair Display Black / Bodoni tipida), KATTA HARFLAR.
- Ierarxiya: kichik yordamchi so'zlar ("WAS", "THE", "NEVER") atrofga sochilgan; kalit so'z ulkan, pastda ("WHAT IF AGING", "AGING", "SELL", "PROJECT FILES").
- Chuqurlik: matn ob'ekt ORQASIDA ham, OLDIDA ham; orqa fondagi matn xira (depth of field).
- Bitta so'z qizil ("BUT"). Raqamlar sanaladi (DECADES 1057 → 1941).
- Matn izlari: echo/trail, 3D aylanish, burama (swirl) yozuvlar.

## 5. Kolaj elementlari
- Kesilgan yuzlar (faqat bosh), yon-atrofida buyumlar: lab bo'yog'i, krem tubi, tomchi, tangalar, cho'chqa-kopilka, mikroskop, pul dastasi.
- Qo'lda chizilgan belgilar: matn atrofida doira, strelka, xochlar, ajinlar ustida qizil nuqtali chiziq, so'roq belgilari.
- Yirtilgan qog'oz / qizil lenta (ribbon) — o'tish vositasi.

## 6. Harakat va o'tishlar
- Doimiy sekin kamera itarish (push-in / Ken Burns) + parallaks qatlamlar.
- Rack focus: fon xiralashadi, ob'ekt aniqlashadi.
- Qizil to'lqinli lenta ekran bo'ylab o'tib, yangi kadrni ochadi (1.3–2.5 s).
- Flash o'tish: oq/zangori invert chaqnash + RGB split + glitch (9.6 s, 17 s, 21 s).
- Ob'ektlar 3D aylanib kiradi; tomchi/pufakchalar oqadi; yorug'lik nuri (mikroskop).
- Oxiri: logotip ikonkalar + brend nomi katta, echo bilan takrorlanadi.

## 7. Ovoz
- Diktor + atmosferali musiqa + SFX (whoosh, glitch, impact).
- Baland miks: o'rtacha -15.8 dB, cho'qqi -0.8 dB (≈ -14 LUFS, Instagram uchun).

## FLOWI'ga moslash (qoidalar saqlanadi)
- Dastur ekranlari (UI skrinshot) KO'RSATILMAYDI — o'rniga kolaj buyumlar: daftar, chek lentasi, kalkulyator, tangalar, so'm pullar, choynak, piyola, kassa apparati, ofitsant bloknoti.
- Yuzlar: Unsplash'dan (bepul litsenziya) yoki foydalanuvchi materiali; halftone oq-qora qilib ishlatiladi. Haqiqiy shaxsni "mijoz" qilib ko'rsatma.
- Rang: qizil-bordo fon FLOWI aksent rangi bilan almashtirilishi mumkin (brend rangini so'ra), uslub o'zgarmaydi.
- Ilmoq namunasi: "Agar muammo kamomadda emas, nazoratsizlikda bo'lsa-chi?" → daftar, yo'qolgan chek, "KAMOMAD" so'zi sanaladi → burilish: FLOWI → "7 kun bepul" + @Flowisupport_bot.
- Asboblar: HyperFrames + GSAP (qatlamlar, lenta wipe, sanoq), registry bloklari (glitch, film grain, light leak, kinetic type), edge-tts/jonli ovoz, Whisper (subtitr vaqti), FFmpeg (halftone, grain).
