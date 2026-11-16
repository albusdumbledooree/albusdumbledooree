# FLOWI montaj uslubi №3: "Pixel reel" (foydalanuvchi bergan texnik topshiriq)

Foydalanuvchi bergan topshiriq: o'zining qisqa videosini (bitta odam, tik) 6–8 soniyalik reels'ga aylantirish —
pixel-shriftli yozuvlar, "line burst" (chiziqlar portlashi) va logo ochilishi bilan. Hammasi kodda, After Effects'siz.
Bu fayl topshiriqning o'zbekcha mazmuni + to'liq inglizcha matni (pastda). Yangi "pixel reel" so'ralsa — shu faylni o'qi.

## Qisqacha mazmun (o'zbekcha)

**Texnika:** 1080x1920, 30 fps. Video qismi — Python + OpenCV + ffmpeg. Barcha grafika — HTML/CSS + GSAP bitta timeline'da,
headless Chrome'da kadrma-kadr render (bizda: HyperFrames), so'ng ffmpeg bilan birlashtirish. Shablon ham, qo'lda keyframe ham yo'q.

**Avval ko'rsatish (qurishdan oldin):** videoni so'z vaqtlari bilan transkripsiya qil → bitta jumlani 5 ta slotga bo'l
→ bo'linish, so'z vaqtlari va beat-reja ni ko'rsat.
Slotlar: (1) videodagi boshlang'ich so'zlar, (2) qorong'i ekrandagi savolning qolgani, (3) line burst uchun kalit so'z,
(4) logo uchun kalit so'z, (5) videoga qaytgandagi qisqa yakuniy jumla.

**Uslub:** qora fonda oq, yumshoq binafsha (violet) nur, logodan olingan bitta aksent rang; katta so'zlar — blokli pixel shrift,
kichiklari — ingichka toza sans.
1. Videodan boshlanadi. Odam maska bilan kesiladi, yuqori tanasi orqasida qora panel, panel tepasida markazda qisqa oq chiziqcha. Panel kadr bilan birga harakatlanadi.
2. Bosh ustida bittadan so'z, katta oq pixel shriftda, BOSH ORQASIDA (bosh harflarning pastini yopadi). 4 ta kichik oq kvadrat burchaklarni belgilaydi va so'z tushganda ichkariga yopiladi. 1-so'z xiralikdan pixellarga aniqlashadi, kadr esa orqaga tortiladi; keyingi har so'zda kadr biroz yaqinlashadi.
3. Kesish → qora ekran, bir yondan binafsha nur. Chapda kursor kabi oq kvadrat. Keyingi so'z o'ngdan chiziq bo'lib uchib keladi, keyin jumlaning qolgani bitta qatorda kichik, markazda; kvadrat uning tagida.
4. Matn tozalanadi, ekran bo'ylab turli o'lchamdagi 5 ta oq kvadrat "pop" bo'ladi.
5. Line burst (1-kalit so'z tepada): markazda kvadrat, undan ~12 ta ingichka oq chiziq otilib chiqadi, har biri kichik kvadrat bilan tugaydi.
6. 2-kalit so'zda markazdan och panel o'sadi, logo oq kartochkada motion blur bilan tushadi, butun ekran oq bo'ladi. Keyin logo ustida ingichka qora shriftda brend jumlasi, markazda.
7. Yakun: videoga qaytish (panelsiz). Yakuniy jumla ustma-ust sarlavha: bitta katta pixel so'z, kichik so'zlar uning pastki-o'ngida, tasodifiy pixellardan to'g'ri harflarga "scramble". Ikki burchak qavs (tepa-o'ng, past-chap) blokni o'raydi. Oxirigacha turadi.

**Harakat qoidalari:** har so'z aytilgan kadrda tushadi; boshida ekranda bir vaqtda bitta so'z; pixel harflar doim tiniq
(haqiqiy pixel shrift yoki kichik canvas + nearest-neighbour kattalashtirish; tushgandan keyin blur yo'q); yagona shakl — oq kvadrat
(bir xil oq, bir xil o'lcham oilasi); so'zlar ko'z va og'iz ustidan o'tmaydi; hammasi Instagram xavfsiz zonasida; sahna almashuvi tez, silkinishsiz.

**Ovoz:** odam ovozi eng ustida. Har pixel so'zga qisqa raqamli "blip", qorong'i ekranga kesishda "whoosh", line burst oldidan ko'tariluvchi "sweep",
logoda bitta yumshoq "hit". Hammasi Python'da sintez qilinadi va ovoz ostida miks qilinadi.

**QC:** har beat'dan still eksport; har kadrda maska cheti (halo, miltillash yo'q); har so'zni transkript va vaqt bilan tekshirish; keyin `final.mp4`.

**reference.mp4 rejimi (1:1 nusxa):** reference — monitorni telefonda suratga olingan video (chapda chat, o'ngda 6 s'lik tik montaj preview'da).
1. Preview panelning 4 burchagini OpenCV bilan har kadrda kuzatib, 9:16 ga tekislab `ref_flat.mp4` saqlash; faqat shundan o'lchash.
2. `ref_flat.mp4` ni beat'larga bo'lib, `REF.md` yozish: kadrma-kadr nima borligi, o'lchangan raqamlar (pozitsiya/o'lcham kadrga nisbatan ulush, shrift turi, x-height, harf eni, kadrdan olingan ranglar, boshlanish/tugash vaqti va egri chizig'i). Panel kichik va xira — bir necha kadr o'rtachasini ol.
3. Mening videomni transkripsiya qilib, xuddi shu slotlarni mening so'zlarim bilan to'ldirish (so'z sonini iloji boricha saqlash).
4. Odamni maska bilan kesib, panel va pixel so'zlarni uning orqasiga qo'yish; pull-back va push-in'larni aynan o'sha kadrlarda.
5. Har beat'ni alohida qurish → reference yonida render → `DIFF.md` (eng yomon farq birinchi) → tuzatish → qayta solishtirish.
6. Hamma grafika 1080x1920 da toza qayta quriladi; reference'dan kesib kattalashtirish TAQIQ. Mening logom reference logosi o'rnida.
7. Ovoz: reference audiodagi har zarbni (onset detection) topib, o'sha kadrga mos ovoz qo'yish.
8. Yakun: yonma-yon video (chapda ref_flat, o'ngda meniki) + kadrma-kadr tekshiruv (maska cheti). Savol berma, natijani ko'rsat.

## FLOWI uchun eslatmalar
- Kerak bo'ladigan materiallar: `footage/` — bitta odam gapirayotgan tik video (masalan, choyxona egasi yoki sotuvchi); `assets/` — FLOWI logosi (SVG yoki shaffof PNG); brend jumlasi (masalan "FLOWI — biznesingiz nazoratda" — foydalanuvchidan so'ra); ixtiyoriy `reference.mp4`.
- Aksent rang — FLOWI logosidan olinadi.
- Bu uslubda ham dastur UI ekranlari ko'rsatilmaydi; "7 kun bepul" yakuniy jumlada yoki caption'da.
- Hozircha o'rnatilmagan, ish boshlanganda o'rnatiladi: OpenCV (`opencv-python-headless`), odam maskasi uchun segmentatsiya modeli (masalan MediaPipe yoki rembg), pixel shrift (masalan Google Fonts'dan "Silkscreen" yoki "Press Start 2P" — litsenziyasi OFL). Tayyor: ffmpeg, HyperFrames+GSAP, Whisper (so'z vaqtlari), Python/numpy (ovoz sintezi, `marketing/hyperframes/tools/audio.py`).

---

## Asl topshiriq matni (inglizcha, o'zgarishsiz)

You are my motion designer. Turn my short clip into a 6 to 8 second vertical reel with pixel-type captions, a line burst and a logo reveal. 1080x1920, 30 fps, entirely in code: Python + OpenCV + ffmpeg for the footage, every graphic in HTML/CSS + GSAP on one timeline, rendered frame by frame in headless Chrome, composited and encoded with ffmpeg. No After Effects, no templates, no keyframes from me.

First: transcribe my clip with word timestamps. Split one line into five slots: a few opening words on the footage, the rest of the question on a dark screen, one key word for the line burst, one for the logo, and a short closing line back on the footage. Show me the split, the word timings and a beat plan before you build anything. My clip is in footage/ (one person, vertical). My logo is in assets/ (PNG or SVG). My brand line for the logo screen: [your line]. My words, if the clip has no speech: [your line].

STYLE (white on near black, a soft violet glow, one accent colour taken from my logo, blocky pixel type for the big words, a clean thin sans for the small ones)
1. Open on my clip. Cut the person out with a person mask and put a near-black panel behind their upper body, with a short white dash centred near its top. The panel moves and scales with the shot.
2. One word at a time above their head in big white pixel type. The word sits behind the head: the head covers the bottom of the letters. Four small white squares mark the corners and close in on each word as it lands. The first word sharpens from soft into pixels while the shot pulls back. Then the shot pushes in a little on every next word.
3. Cut to a near-black screen with a violet glow from one side. A white square waits on the left like a cursor. The next word streaks in from the right, then the rest of the sentence sits on one line, small and centred, with the square parked under it.
4. The text clears. Five white squares of different sizes pop in across the screen.
5. Line burst on the first key word, shown at the top: a centre square appears and about a dozen thin white lines shoot out from it, each ending in a small square.
6. On the second key word, a light panel grows from the middle and my logo lands on a white card with motion blur, until the whole screen is white. Then my brand line in thin black type above the logo, centred, on pure white.
7. Close: back on my clip, no panel. The closing line as a stacked title: one big pixel word, the small words stacked to its lower right, scrambling from random pixels into the right letters. Two corner brackets (top right, bottom left) frame the block. Hold it to the end.

MOTION RULES
- Every word lands on the frame it is spoken. One word on screen at a time in the opening.
- Pixel type stays crisp. Use a real pixel font, or draw the word on a small canvas and scale it up with nearest-neighbour. No blur on the letters once they land.
- White squares are the only shape: corner marks, cursor, scatter, burst ends. Same white and same size family everywhere.
- Words never cross the eyes or the mouth. Everything stays inside the Instagram safe zone.
- Scene changes are fast. Things move quickly and settle clean, with no wobble.

AUDIO Keep my clip's voice on top. Add a short digital blip on each pixel word, a whoosh on the cut to the dark screen, a quick rising sweep into the line burst and one soft hit on the logo. Make the sounds in code (synthesised in Python) and mix them well under the voice.

QC Export a still of every beat. Check the mask edge around the person on every frame (no halo, no flicker). Check every word against the transcript and its timing. Then render final.mp4.

Copy the edit inside reference.mp4 onto my clip, 1:1. Same timing, layout, type, colours, motion and sound, with my footage, my words and my logo. Built in code, frame by frame: Python + OpenCV + ffmpeg for the footage, HTML/CSS + GSAP rendered in headless Chrome for the graphics. No After Effects.

1. Find the edit first. reference.mp4 is a phone filming a monitor: the Claude app with a chat on the left and a 6-second vertical edit playing in the preview panel on the right. Track the four corners of that panel on every frame with OpenCV, warp it flat to 9:16 and save ref_flat.mp4. Measure only from ref_flat.mp4. Leave out the monitor, the chat and the white title on top unless I ask for them.
2. Split ref_flat.mp4 into beats (every cut and every new word). For each beat write REF.md: what is on screen frame by frame, with numbers measured from the frames, never guessed: positions and sizes as a share of frame width and height, type (pixel or thin sans, x-height, letter width), colours sampled from the frame, when each element starts and stops and on what curve. The panel is small and soft, so average several frames before you trust a measurement.
3. Transcribe my clip with word timestamps. Fill the same slots with my words: the opening words on the footage, the question on the dark screen, the key word for the line burst, the word over the logo card, my brand line on white, the stacked closing line. Keep the same word count per slot where you can.
4. Cut my person out with a person mask so the dark panel and the pixel words sit behind them exactly like the reference. Match the pull-back and every push-in on the same frames.
5. Build one beat at a time, render it next to the reference, write DIFF.md (every difference, worst first), fix, compare again. Move on only when the beat matches.
6. Rebuild every graphic clean at 1080x1920. Never cut anything out of the reference and upscale it. My logo goes where the reference has its logo.
7. Sound: find every hit in the reference audio (onset detection in Python) and put a matching sound on the same frame, under my voice.
8. Finish with a side-by-side (ref_flat left, mine right) and a per-frame check so nothing jitters, the mask edge most of all. Don't ask me questions, show me the result.
