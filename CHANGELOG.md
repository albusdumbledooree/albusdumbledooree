# FLOWI — versiyalar

Har bir yangilanishda versiya raqami oshadi va ekran chetida (pastki qator, ish stoli, platforma) ko'rinadi.

## 1.46.0 — "Boshqaruv" bo'limi

- **Yangi bo'lim: Boshqaruv** — yuqori menyuda, Panel yonida, hamma ko'radigan joyda. Ichida: Mijozlar, Ombor, Mijoz baholari, Davomat, Ish haqi, Doimiy xarajatlar. Har tugmada bugungi holat: nechta mijoz va qancha qarz, nechta masalliq tugayapti, o'rtacha baho, bugun kim keldi, keyingi doimiy to'lov qachon.
- **Moliya** endi faqat pul hisoboti: Hisobot, Sof foyda, Kirim-chiqim (do'konlarda — Foyda, Mol keldi, Qarzlar). Avvalgidek menyuning chetida va parol bilan.
- **Kim nimani ko'radi** — Ish haqi va Doimiy xarajatlar tugmasi faqat boshliq va adminga. Kassir Mijozlar, Ombor va Baholarni ko'radi. Davomat "Ishga keldim" yoqilgan bo'lsa chiqadi.
- Moliya paroli yoqilgan bo'lsa, Ish haqi va Doimiy xarajatlar sahifalari parolni so'rashda davom etadi (pul ma'lumoti), tugmalarida esa raqam ko'rsatilmaydi.

## 1.45.3 — Biznes tarifida Mijozlar ekrani

- Biznes tarifida qarz daftari bor edi, lekin qarzdorlar ro'yxati va "Qarz to'lovi" ekrani (Moliya → Mijozlar) faqat Pro'da ko'rinardi. Endi Biznes'da ham Mijozlar ekrani ochiladi: mijozlar, qarzdorlar, qarzni olish. Bonus va keshbek Pro'da qoladi.

## 1.45.2 — Yangilash sinovi tuzatildi

- Serverdagi yangilash sinovlaridan biri (bellashuv reytingi) natijasi tezlikka bog'liq edi va sekinroq serverda yiqilib, 1.45.1 o'rnatilmay qolgan edi. Sinov aniq natijali qilindi. Dasturning o'zida o'zgarish yo'q — bu versiya 1.45.1 dagi kirish tuzatishini serverga yetkazadi.

## 1.45.1 — Tuzatish: kirish buzilgan edi

- 1.45.0 da ba'zi qurilmalarda "Offline is not defined" xatosi chiqib, hisobga kirib bo'lmas edi. Endi internetsiz rejim moduli yuklanmasa ham dastur odatdagidek kiritadi va ishlaydi.

## 1.45.0 — Internetsiz ish (oflayn rejim)

- **Dastur internetsiz ham ochiladi** — telefon, planshet va Windows dasturi oxirgi ko'rilgan menyu, xonalar va ochiq cheklarni o'zida saqlaydi. Internet uzilsa "Internet yo'q" yozuvi chiqadi, ish to'xtamaydi.
- **Buyurtma navbati** — internetsiz tasdiqlangan buyurtma shu qurilmada saqlanadi va internet kelishi bilan o'zi yuboriladi. Har buyurtmaning o'z kaliti bor: ikki marta yuborilsa ham chekka bir marta yoziladi. Navbatni "Internet yo'q" yozuvini bosib ko'rish, chop etish yoki o'chirish mumkin. Yuborilmay qolgani (masalan, taom menyudan olib tashlangan) sababi bilan qizil ko'rinadi.
- **Kassa kompyuteri** — internetsiz yozilgan buyurtmaning oshxona cheki darhol shu kompyuterda chiqadi ("INTERNETSIZ" belgisi bilan), internet kelganda qayta chop etilmaydi. "Chek" tugmasi oxirgi ko'rilgan chekni internetsiz chop etadi.
- **Cheklovlar** — internetsiz paytda qurilmalar bir-birini ko'rmaydi (oshxona ekrani va boshqa telefonlar buyurtmani internet kelgach ko'radi); to'lov qabul qilish, chekni yopish va PIN bilan kirish internet bilan ishlaydi. Shuning uchun xodim internet borligida kirib qo'ygan bo'lishi kerak.
- Server javob bermay qolganda (502–504) ham dastur xuddi shunday ishlaydi.

## 1.44.0 — Menyuni tez kiritish (import) va onlayn bron

- **Menyu importi** — Menyu → Import. Menyuni matn qilib yozing yoki Excel'dan nusxa olib joylang: har qatorda taom nomi va narxi ("Norin 35000", "Tovuq kabob 22 ming", "Qatiq — 6 000 so'm"). Narxsiz qator bo'lim nomi hisoblanadi. Saqlashdan oldin ro'yxat ko'rinadi — nom, bo'lim, narxni tuzatish yoki qatorni olib tashlash mumkin. Menyuda shu nomli taom bo'lsa, faqat narxi yangilanadi.
- **Onlayn bron** (standart holatda o'chiq) — Bronlar bo'limida yoqiladi. Mehmon `/b/<kod>` sahifasida kun, vaqt, xona tanlab so'rov qoldiradi; band xonalar ko'rinib turadi. So'rov Bronlar bo'limida va Telegram'da chiqadi — "Tasdiqlash" yoki "Rad etish". Mehmon javobni o'sha sahifaning o'zida ko'radi. Tasdiqlangan so'rov oddiy bronga aylanadi. "Olib ketish" bo'limi ro'yxatda chiqmaydi.

## 1.43.0 — Boshliqqa ogohlantirishlar, mijoz bahosi, chekda to'lov QR'i, ombor prognozi

- **Ogohlantirishlar (Telegram)** — Sozlamalar → Telegram: bir xodim ko'p taom bekor qilsa, katta chegirma berilsa, taomli chek o'chirilsa, chek soatlab ochiq qolsa, smena yopilganda kassa farq qilsa — boshliqqa darhol xabar. Har birining chegarasini boshliq o'zi belgilaydi (0 — kelmaydi). Biznes va Pro tariflarida.
- **Mijoz bahosi** (standart holatda o'chiq) — Sozlamalar → Ko'rinish → Chekdagi QR kodlar. Chek pastida QR: mehmon 1–5 yulduz qo'yadi va izoh yozadi. 1–3 yulduz boshliqqa darhol Telegram orqali boradi. Natijalar: Moliya → Mijoz baholari (o'rtacha baho, har ofitsant bo'yicha, izohlar). Biznes va Pro tariflarida.
- **Chekda to'lov QR'i** (sozlamadan yoqiladi) — Payme va Click alohida. Summa QR ichida, mehmon faqat tasdiqlaydi. To'lov kelganini kassir Payme/Click ilovasida ko'rib chekni yopadi.
- **Ombor prognozi** (Pro) — har masalliq oxirgi 7 kunlik sarf bo'yicha necha kunga yetishi ko'rinadi; 2 kundan kam qolgani "kam qolgan" hisoblanadi. Ertalab Telegram'ga "tugayapti" ro'yxati va 5 kunga yetadigan xarid ro'yxati keladi.

## 1.42.0 — Bellashuv: jamoa, boshqa choyxonalar, havola va saytda; oylik reyting

- **Akademiya → ⚔️ Bellashuv**: ikki kishiga bir xil 10 ta savol, har biriga 20 soniya. Ko'p to'g'ri javob bergan yutadi, teng bo'lsa — tezroq yechgan. Javoblar serverda tekshiriladi, vaqtni ham server o'lchaydi.
- **O'z jamoam**: hamkasbni tanlab chaqirasiz, unga darhol xabar (ovoz va bildirishnoma) boradi — "Qabul qilish" yoki "Rad etish".
- **Boshqa choyxonalar**: butun FLOWI bo'yicha tasodifiy raqib. Kutib turgan bo'lsa darhol, bo'lmasa siz hozir yechasiz, raqib keyin — natija kelganda xabar keladi.
- **Havola orqali**: do'stingizga Telegramda yuborasiz, u `flowi.uz/test?d=…` da (dasturisiz) o'ynaydi.
- **Saytda**: flowi.uz/test sahifasida tasodifiy raqib, do'stni chaqirish, "Bellashuvlarim" va oyning reytingi. Testdan keyin "Do'stingizni bellashuvga chaqiring" tugmasi.
- **Oylik reyting**: g'alaba — 3 ball, durang — 1. Jamoa, butun FLOWI (va choyxonalar reytingi), sayt. Boshqa choyxonaga faqat ism va choyxona nomi, saytda faqat ism ko'rinadi.
- **Boshliq** (Akademiya → Xodimlar): har xodimning g'alaba/durang/mag'lubiyati; bellashuvni, boshqa choyxonalar bilan bellashuvni va ish vaqtida bellashuvni yoqish/o'chirish. Standart holatda ochiq cheki yoki smenasi bor xodim bellashuv boshlay olmaydi.
- **Platforma → Akademiya**: bizneslararo va saytdagi bellashuvni yoqish/o'chirish, oxirgi 30 kun soni, oyning eng yaxshilari va bizneslar reytingi.

## 1.41.0 — Sertifikatda QR kod, urinish raqami, platformada sertifikatlar

- Har bir yakuniy test **nechanchi urinish** ekani yoziladi: natijada, sertifikatda ("2-urinishda o'tdi"), boshliq ro'yxatida (urinishlar va "55% → 90%" tarixi), platformada.
- **Sertifikatda QR kod** va noyob raqam (dasturda FA-…, saytda FS-…). Telefon kamerasi bilan skanerlansa `flowi.uz/test?c=…` ochiladi: "Sertifikat haqiqiy", ism, ish joyi, lavozim, natija, urinishlar tarixi.
- Saytdagi testda **telefon raqami majburiy**: urinishlar shu raqam bo'yicha sanaladi. Raqam hech kimga to'liq ko'rsatilmaydi.
- **Platforma → Akademiya → Sertifikatlar**: hamma sertifikatlar (bizneslar va sayt), ism / raqam / telefon / joy bo'yicha qidiruv, ochish-chop etish, havolani nusxalash.
- Oldin berilgan sertifikatlar ham avtomatik raqam oladi va QR bilan tekshiriladi.

## 1.40.0 — Akademiya: har bir biznes uchun alohida boshqaruv va saytdagi testni yoqish/o'chirish

- Biznesni tahrirlash oynasida **"Akademiya bu biznesda"**: Tarif bo'yicha / To'liq ochiq / Faqat bepul modullar / Yashirin.
- **Qo'shimcha oylik to'lov** Akademiya uchun (ixtiyoriy): biznesning oylik to'loviga qo'shiladi, to'lov botida ham shu summa. "Yashirin" bo'lsa olinmaydi.
- "Yashirin" bo'lsa xodimlar menyusida Akademiya ko'rinmaydi. O'qilgan darslar va natijalar saqlanib qoladi, qayta ochilsa joyida turadi.
- Platforma → Akademiya: **"Saytda ochiq test"** tugmasi. O'chirilsa bosh sahifadagi havola yo'qoladi, /test sahifasida "Test vaqtincha yopiq" chiqadi. Berilgan sertifikatlarni tekshirish ishlayveradi.
- Platforma → Akademiya: hamma restoran va choyxonalar ro'yxati, har birining holati va qo'shimcha to'lovi. Bosib o'zgartirsa bo'ladi.

## 1.39.0 — FLOWI Akademiya: xodimlar uchun darslar va ofitsantlik testi

- **Akademiya** bo'limi: 8 modul, 32 dars, 96 savol (kutib olish, muloqot, dasturxon va choy odobi, menyu va tavsiya, FLOWI'da ishlash, qiyin mijoz, gigiena, hisob-kitob odobi).
- Dars — qisqa kartochkalar (rasm, matn, "✅ shunday qiling / ❌ bunday qilmang") va oxirida 3 ta savol, darhol izoh bilan. "🔊 Eshitish" — darsni ovoz chiqarib o'qib beradi.
- Ofitsant telefonida pastki menyuda "Akademiya". Boshliq va admin: Xodimlar → Akademiya.
- **Yakuniy test**: 20 ta tasodifiy savol, javoblar serverda tekshiriladi, 70% bilan o'tiladi. O'tolmasa 12 soatdan keyin qayta topshiradi. O'tganga chop etiladigan **sertifikat**.
- **Boshliq ekrani**: kim nechta dars o'qigan, test natijasi, kim boshlamagan, eng ko'p xato qilinadigan mavzu.
- **Tarif**: "Kutib olish" va "Muloqot madaniyati" modullari hamma tariflarda bepul. Hamma darslar, yakuniy test va sertifikat — Biznes va Pro tariflarida (platformada Tariflar bo'limidan o'zgartirsa bo'ladi).
- **Saytda ochiq test** — `flowi.uz/test`: istalgan odam ism yozib 20 ta savolga javob beradi, darhol natija va sertifikat oladi. Sertifikatni raqami bilan tekshirish: `flowi.uz/test?c=KOD`. Bosh sahifada "Ofitsantlik testi" havolasi.
- **Platformada "Akademiya"**: saytdagi testlar soni va natijalari, bizneslarda kim o'qiyapti, darslarni tahrirlash (kartalar, savollar, to'g'ri javob, bepul modul), asl darslarga qaytarish.

## 1.38.1 — Chekda bir xil taomlar bitta qatorda

- Bir xil taom qayta yuborilsa, chekda alohida qator emas — yuqoridagi qatorga soni qo'shiladi (taom, qo'shimcha tanlovi, izohi va narxi bir xil bo'lsa).
- Izohli taom (masalan "achchiq") alohida qatorda qoladi.
- Qatorni bossangiz har bir yuborilgani vaqti va holati bilan ko'rinadi; tayyorlarini "Oldim" bilan olish, keraklisini bekor qilish mumkin.
- "−" oxirgi yuborilganidan bittasini bekor qiladi. Oshxona ekrani, oshxona qog'ozi va tarix o'zgarmaydi.

## 1.38.0 — Platforma: faollik, xatolar, savdo yashirin

- Bizneslar ro'yxatida savdo summasi endi ko'rinmaydi (serverdan ham yuborilmaydi). Uni ko'rish: kartochkadagi ⋮ → **Savdo** (bugun, 7 kun, 30 kun).
- Kartochkada: "Hozir N kishi dasturda · bugun X/Y xodim · eng ko'pi Z" va **Faollik** havolasi.
- **Faollik** oynasi: hozir kim ishlayapti (lavozim, qurilma, Android ilova / Windows / telefon / kompyuter), bugun kirmaganlar, eng ko'p bir vaqtda (bugun va 7 kun), soatlar bo'yicha grafik, xatolar (7 kun: rad etilgan amallar — PIN noto'g'ri, to'lov yetarli emas va h.k., dastur xatolari — qaysi telefonda, qaysi joyda), bajarilgan ishlar, ulangan qurilmalar.
- "Hisob almashib ishlatilyapti" o'rniga aniqroq: "Bitta login bir necha kishida: ISM — 7 kunda N marta boshqa qurilmadan ochildi".
- Xatolar va faollik shu versiyadan boshlab yig'iladi.

## 1.37.0 — Android ilova (APK)

- Yangi: **FLOWI Android ilovasi** — `flowi.uz/flowi.apk` dan yuklab olinadi (78 KB), Android 5 va undan yangi hamma telefon va planshetga o'rnatiladi.
- Birinchi ochilganda biznes kodi bir marta yoziladi, keyin ilova to'g'ri o'sha biznesni ochadi. Kodni o'zgartirish: Sozlamalar → "Biznes kodini o'zgartirish" yoki "orqaga" tugmasini bosib turish.
- "Taom tayyor" — ilova orqada bo'lsa telefonga bildirishnoma (ovoz va titrash bilan) keladi; xabar telefonning o'z ovozi bilan aytiladi.
- Kamera (shtrix-kod, selfi), joylashuv (davomat), fayl tanlash ishlaydi; ekran o'chmaydi; "orqaga" ilovani tasodifan yopmaydi; internet uzilsa o'zi qayta ulanadi.
- Eski telefonlar uchun: dastur kodi eski ichki brauzerlar (Android 9 va undan eski, Chrome 74) ham tushunadigan qilib yozildi; bu test bilan tekshiriladi.
- Ilova kodi `android/` papkasida; GitHub'da avtomatik yig'iladi (imzo kaliti repozitoriy sirlarida saqlanadi, kodda emas).

## 1.36.1 — Idish: bitta molni boshqa narxda sotish

- Savatdagi har bir mol qatorida narx belgisi ("Optom ▾"). Bosilsa — shu molning o'zi Chakana, Optom yoki Katta optom narxda; "Umumiy narx" — savatdagi kabi.
- Alohida o'zgartirilgan qator sariq belgi bilan ajralib turadi; tepadagi narx almashtirilsa ham u o'z narxida qoladi (10 karobkadan avtomatik katta optom ham unga qo'yilmaydi).
- Server ham har qatorni o'z narxida hisoblaydi.

## 1.36.0 — Yuborilgan taom yonida − / +, qidiruv hamma bo'limdan

- Chekdagi yuborilgan taom yonida "+" — shu taomdan yana bittasi yangi qator bo'lib qo'shiladi (menyudan qayta qidirish shart emas); qo'shimcha tanlovli taomda tanlov so'raladi.
- "−" — bitta taomni bekor qilish. Ruxsati yo'q ofitsantda qulf belgisi turadi; kod bilan bekor qilish yoqilgan bo'lsa kod so'raladi; boshliq, admin, kassirda bekor qilish oynasi (1 dona) ochiladi. Hammasi tarixga yoziladi.
- Taom qidiruvi endi qaysi bo'lim ochiq bo'lishidan qat'i nazar butun menyudan qidiradi.

## 1.35.3 — Idish: faqat donalab sotiladigan mol ham optom narxda

- Pachka/karobkasi yo'q (faqat dona) mollarda Chakana / Optom / Katta optom tanlanganda narx o'zgarmay qolardi. Endi kartochkadagi narx, savatdagi summa va chek tanlangan narxda bo'ladi (mijozning narxi ham).

## 1.35.2 — Asosiy (kassa) kompyuterda tezroq va bosish yo'qolmaydi

- Kassa hamma xonalarning o'zgarishini oladi. Kechqurun o'zgarishlar ketma-ket kelganda ekran yangilanishni kutib "qotib" qolardi — endi kamida sekundda bir marta yangilanadi.
- Tugma bosilib turgan paytda ekran qayta chizilmaydi (avval bosish "yutilib" ketardi, bir necha marta yoki bosib turish kerak edi). Yangi ma'lumot qo'l qo'yib yuborilgandan keyin chiziladi.
- Belgilar (tayyor taomlar, hisob so'rovlari, oshxona soni) bir nechta o'zgarish uchun bir marta so'raladi — server va kompyuterga yuk kamaydi.

## 1.35.1 — Xona raqami summa bilan aralashmaydi

- Xona (stol) raqami endi qora katak ichida turadi, summaning oxirida "so'm" yoziladi: "1" va "172 000" endi "1 172 000" bo'lib o'qilmaydi.
- Olib ketish va dostavka kartochkalarida ham shunday. Qorong'i rejimda katak och rangda.

## 1.35.0 — flowi.uz: dastur rasmlari o'rniga grafika

- Saytdagi 16 ta dastur ekrani rasmi olib tashlandi; o'rniga oddiy, tushunarli grafikalar: buyurtma yo'li (Ofitsant → Oshxona → Kassa → Boshliq), rangli stollar, oshxona qog'ozi, chek, QR-menyu, "Bugun" ro'yxati, mol keldi, skaner, sof foyda tenglamasi.
- Bosh qismda Choyxona birinchi, yonida Restoran, Fast food, Do'kon — hammaga mos, choyxonaga yo'naltirilgan.
- Grafikalardagi hamma yozuvlar o'zbek va rus tilida.
- Sayt ancha yengil (1,9 MB rasm o'rniga 0,14 MB); ijtimoiy tarmoqda havola rasmi ham yangi grafika.

## 1.34.2 — Mol kartasi telefonda tushunarliroq

- Pachka va karobka yozilmagan (faqat dona) molda ortiqcha "+ dona" katagi ko'rinmaydi.
- Narx bo'sh bo'lsa katakda "0" emas, "avto" yoziladi; izoh ham shunga mos: "Optom yoki katta optom bo'sh qolsa — chakana narxi olinadi".
- Telefonda narxlar jadvali to'liq sig'adi (Katta optom ustuni kesilmaydi).

## 1.34.1 — Kassirga cheklar tarixi, umumiy summasiz

- Kassir "Cheklar" bo'limida endi **Cheklar tarixi**ni ko'radi: ochiq va yopilgan cheklar ro'yxati, har chekning o'z summasi va ichidagi taomlar.
- Kun / hafta / oy bo'yicha umumiy savdo summasi, tannarx ustuni va Excel kassirga ko'rinmaydi (server ham yubormaydi).
- Boshliq xohlasa yoqib qo'yadi: Sozlamalar → Ruxsatlar → "Kassir Cheklar bo'limida umumiy savdo summasini ko'ra oladi". Standart — o'chiq.
- Boshliq va admin hammasini avvalgidek ko'radi.

## 1.34.0 — Yangi biznes turi: Bir martalik idishlar

- Platformada yangi tur: **Bir martalik idishlar** (stakan, konteyner, tarelka, qoshiq-vilka, paket). Namuna mollar bilan ochiladi.
- Bitta mol uch xil sotiladi: **dona, pachka, karobka**. Mol kartasida "1 pachka = 50 dona", "1 karobka = 1000 dona" yoziladi; omborda hammasi donada hisoblanadi, ekranda esa "42 karobka + 350 dona" bo'lib ko'rinadi.
- Uch narx: **chakana, optom, katta optom** (dona, pachka, karobka uchun). Bo'sh qolgan narx karobka narxidan o'zi bo'linadi. Bir moldan 10 karobkadan ko'p olinsa katta optom narxi o'zi qo'yiladi (soni Sozlamalarda).
- Sotuv: mol bosilganda "qanchadan?" — Dona / Pachka / Karobka va narxlari. Savatda birlikni almashtirish va sonini yozish mumkin. Mijoz tanlansa uning narxi (optom va h.k.) o'zi qo'yiladi, qarzi ko'rinadi. **"Oxirgi xarid"** tugmasi mijozning o'tgan safargi xaridini bitta bosishda savatga soladi. Boshliqqa "Shu savdodan foyda" ko'rinadi.
- **Ombor**: ombordagi mol (tannarxda), sotsa tushadigan pul, kam qolgan va tugagan mollar soni; qoldiq karobka/pachka/donada.
- **Mol keldi**: karobka yoki pachkada kiritiladi, narxi 1 karobka uchun; qoldiq donada qo'shiladi, tannarx (yo'lkira bilan) o'zi yangilanadi.
- **Foyda**: bitta qator — Sotildi − Mol tannarxi − Xarajatlar = Sof foyda; eng ko'p sotilgan mollar karobkada.
- Mijozlar: har mijozga narx turi (chakana / optom / katta optom).
- Qaytarish va bekor qilishda qoldiq to'g'ri (karobka × dona) qaytadi.

## 1.33.0 — Oshxona, to'lov oynasi va ofitsant telefoni soddaroq

- Oshxona: kartochkada bitta vaqt (qolgan vaqt, kechiksa qizil), "~15 daq" olib tashlandi; tayyor taomda qisqa "⏳ kutyapti 0:05"; chop etish tugmasi kartochka burchagida kichik belgi; sarlavhadagi ikkinchi Stop-list tugmasi olib tashlandi (yuqori menyuda bor).
- To'lov oynasi: Naqd / Karta / O'tkazma bosilsa summa o'zi yoziladi (chegirma qo'shilsa ham o'zi to'g'rilanadi). Naqdda bitta katak qoladi — mijoz bergan pulni yozsangiz qaytim chiqadi. Uchta katak faqat "Aralash to'lov"da. Chegirma, Mijoz va "Boshqa" (xodim hisobiga) — kichik havolalar, bosilganda ochiladi. Taomlar ro'yxati jadval ko'rinishida: nomi, soni, summa. To'lov turi tanlanmasa ogohlantiradi.
- Ofitsant telefoni: katta yashil "Tayyor — olib keting!" oynasi o'rniga pastda ingichka qator "● 3 ta taom tayyor — Ko'rish →", bosilsa tayyor taomlar ro'yxati ochiladi.
- Xonalar ko'rinishi o'zgarmadi.

## 1.32.2 — Chek paneli tozaroq

- "1-yuborish · 15:08" ajratgichlari va "Yangi (yuborilmagan)" sarlavhasi olib tashlandi (yangi taomlarni sariq rang ajratadi; qachon yuborilgani — qatorni bosganda).
- Belgilar faqat ikkita: to'q sariq nuqta — oshxonada, yashil nuqta va yashil qator — tayyor. Berilgan taomlar oddiy qator.

## 1.32.1 — Chek panelida yozuv kichikroq

- Chek jadvalidagi yozuvlar kichikroq (15 → 14), qatorlar zichroq: uzun nomlar ham ko'pincha bitta qatorga sig'adi, ekranga ko'proq taom kiradi.

## 1.32.0 — Chek paneli jadval ko'rinishida

- Taom urish ekranidagi chek endi jadval: **№ · Nomi · Soni · Summa**. Har bir taom bitta qatorda — telefonda bir ekranga taxminan ikki baravar ko'p taom sig'adi.
- Holat rangli nuqta bilan: ko'k — yangi, to'q sariq — tayyorlanmoqda, yashil — tayyor (qatori ham yashil), kulrang — berildi.
- Qo'shimchalar (+ …) va izoh (✎ …) taom nomi ostida.
- Taom qatorini bosganda menyu: tayyor taomda "Oldim", "Bekor qilish"; yangi (yuborilmagan) taomda "Izoh" va "O'chirish". − / + tugmalari qatorning o'zida.
- Tayyor taomlar 2 tadan ko'p bo'lsa — "Hammasini oldim" tugmasi.
- "1-yuborish · 15:04" ajratgichlari qoladi, raqamlash uzluksiz.

## 1.31.4 — Logotip tepa-pastida bo'sh joy yo'q

- Logotip faylining o'zidagi bo'sh chet (tepa va pastdagi oq yoki shaffof qism) chekka chiqmaydi — avtomatik kesiladi. Logotipning ko'rinishi va rangi o'zgarmaydi.
- Logotip bilan pastdagi chiziq orasi qisqardi.
- Biznes nomi bo'sh bo'lsa (nom logotipda yozilgan bo'lsa), uning o'rniga bo'sh qator qolmaydi.
- Printer cheki, oddiy matnli chek va brauzer cheki — hammasida.

## 1.31.3 — Chek ostidagi yozuvlar qalin

- Chek ostidagi qo'shimcha yozuvlar (masalan "DASTAVKA: 94-…") hamma chek turida qalinroq: printer cheki (rasm), oddiy matnli chek va brauzer cheki.

## 1.31.2 — Dostavka chekida mijoz ma'lumoti

- Dostavka chekida endi: **Mijoz** (ismi), **Tel**, **Manzil** (uzun bo'lsa keyingi qatorga o'tadi) va **Dostavchik** (kim olib boradi). Faqat to'ldirilganlari chiqadi.
- Printer cheki (rasm), oddiy matnli chek va brauzer cheki — uchalasida ham.
- Brauzer chekida dostavka uchun "Ofitsant" va "Mehmonlar" qatorlari chiqmaydi (o'rniga "Dostavchik").

## 1.31.1 — Chek ixchamroq: tepa-pastda bo'sh joy yo'q

- Chek va oshxona qog'ozi oxirida printerga ketadigan "yana 4 qator sur" buyrug'i olib tashlandi: printer endi kesish joyigacha suradi va kesadi. Tepada ham dastur qo'shadigan bo'sh joy yo'q (qolgan ozgina joy — printerning o'z kallagi va pichog'i orasidagi masofa).
- Qatorlar orasi qisqardi (38 → 34 nuqta).
- JAMI kichikroq (46 → 40).
- Chek ostidagi yozuvlar (masalan "DASTAVKA: 94-…") kattaroq (24 → 30).
- "N kishi — har biriga" qatori kattaroq va qalinroq (soni ham, summasi ham).
- Brauzer orqali chiqadigan chekda ham xuddi shunday.
- Natija: zal cheki ~15%, olib ketish ~18%, oshxona qog'ozi ~19% qisqa — qog'oz tejaladi.

## 1.31.0 — flowi.uz sayti yangilandi

- "Imkoniyatlar" bo'limiga 3 ta yangi kartochka qo'shildi: **Dostavka**, **Taom qo'shimchalari** (modifikatorlar), **Boshliq paneli**.
- "Kassa" qismida yangi qator: har bir bo'lim o'z printeriga chiqadi, ikkinchi kompyuterdagi chek ham kassa printeridan chiqadi.
- Sayt yuqorisidagi "Yangi" xabari: "Dostavka, taom qo'shimchalari va boshliq paneli".
- Bosh qismdagi qatorga qo'shildi: "Kassa uchun Windows dasturi".
- Hammasi o'zbek va rus tilida.

## 1.30.3 — Saytdagi "bepul kunlar" platformadan olinadi

- flowi.uz saytida "14 kun bepul" qo'lda yozib qo'yilgan edi (asosiy tugma, pastki sarlavha, Google tavsifi). Endi platformadagi Tariflar → "Yangi biznesga bepul sinov (kun)" qiymati saytning hamma joyida (o'zbek va rus tilida) chiqadi.

## 1.30.2 — Telefonda platforma va kichik ekranlar

- Platforma: telefonda yuqoridagi tugmalar ekranga sig'may, sahifa o'ngga surilib qolardi. Endi tugmalar logotip ostidagi alohida qatorda turadi (320–430 px ekranlarda tekshirildi).
- Juda kichik telefonlarda (320 px) oshxonadagi "Qabul qilish" tugmasi o'z qatoriga tushadi, Zaxira bo'limidagi uzun tugmalar ekranga sig'adi.
- Umumiy tekshiruv kengaytirildi: endi yuqori qator va menyular ham tekshiriladi — 390 ta sahifa, 0 ta xato.

## 1.30.1 — Telefonda "Qurilmani ulash" oynasi ekrandan chiqib ketmaydi

- Logotipi bor bizneslarda telefonda yuqori qatorga (FLOWI, logotip, klaviatura, til) joy yetmay, oyna o'ng tomonga chiqib ketardi. Endi tugmalar ikkinchi qatorga tushadi va oyna ekranga to'liq sig'adi.

## 1.30.0 — "To'lov va yordam" Telegram boti

- Platformada yangi tugma (🤲 belgisi): alohida botning tokeni kiritiladi va bot sizning Telegramingizga ulanadi. Karta raqami va karta egasi shu yerda yoziladi.
- Mijoz dasturda **Sozlamalar → Mening tarifim → «Telegram botga ulanish»** tugmasini bosadi. Bot ochiladi va uning biznesiga o'zi bog'lanadi, kod terish shart emas.
- Botda uchta tugma bor: **💳 To'lash**, **📅 Tarifim**, **🆘 Yordam**.
- **Yordam:** mijozning xabari (matn, rasm, ovoz) sizga "qaysi biznes, kim" degan sarlavha bilan keladi. Siz unga *reply* qilib javob yozasiz va javob mijozga boradi.
- **Karta orqali to'lov:** mijozga karta chiqadi, u chek rasmini yuboradi. Chek sizga **+1 oy / +3 oy / Rad etish** tugmalari bilan keladi. Tasdiqlansa, muddat o'zi uzayadi va mijozga xabar boradi.
- **Naqd to'lov:** sizga xabar keladi. Pulni olgach, o'sha tugmalar bilan tasdiqlaysiz.
- Muddat tugashiga 3 kun va 1 kun qolganda, shuningdek tugagan kuni mijozga eslatma boradi (soat 9:00–21:00 oralig'ida).
- Platformadagi biznes kartochkasida yangi **«To'lovlar»** tarixi bor. Naqd pulni u yerda qo'lda ham yozish mumkin (+1 / +3 oy).
- Barcha yozishmalar va to'lovlar serverda saqlanadi.

## 1.29.1 — Dostavka: tekshiruvdan keyingi tuzatishlar

- Dostavka chekida telefon/manzil yozilayotganda boshqa qurilmadan o'zgarish kelsa (jonli yangilanish), yozilgan matn o'chib ketmaydi.
- Ekrandagi klaviatura bilan yozilgan telefon/manzil ham saqlanadi (maydondan chiqqanda).
- Dostavka yoki olib ketish chekini xonaga o'tkazganda u endi zal cheki bo'ladi (hisobotda "Dostavka" bo'lib qolmaydi).
- Ofitsantning "Tayyor taomlar" ro'yxatida "Olib ketish · Dostavka #N" deb chalkash yozilardi — endi faqat "Dostavka #N".

## 1.29.0 — Dostavka alohida: "Olib ketish" bilan aralashmaydi

- Dostavchikda "Olib ketish" o'rniga 🚚 **Dostavka** bo'limi: uning hamma cheklari "Dostavka #N" bo'lib yuradi.
- Kassir va boshliqda ikkita alohida bo'lim: **Olib ketish** va **Dostavka** (har birida o'z hisoblagichi). Kassir dostavka chekini ochib, dostavchikni tanlay oladi.
- Mijoz ismi, telefoni va manzili — ixtiyoriy; keyin ham to'ldirish yoki tuzatish mumkin, telefon yonida qo'ng'iroq tugmasi.
- Sozlamalar → Muassasa: **Yetkazib berish haqi** (standart 0 — qo'shilmaydi). Dostavkada xizmat haqi olinmaydi.
- Hisobot: yangi "Savdo turlari" — Zal / Olib ketish / Dostavka alohida (Excelda ham). Cheklar hisobotida "Dostavka" filtri; "Olib ketish" filtri endi dostavkani qo'shmaydi.
- Oshxona ekrani, oshxona qog'ozi va mijoz cheki: "Dostavka #N".
- Faqat avtomatik dostavka haqi qatori bo'lgan bo'sh chekni o'chirish taomli chekdek parol so'ramaydi.

## 1.28.0 — Xonalar "kim birinchi ochsa", oshxona qog'ozi yangi uslubda
- **Xonalarni ofitsantga biriktirish shart emas**: bo'sh xonani istalgan ofitsant ochadi, chek yopilguncha xona o'shaniki;
  boshqa ofitsantlar uni xira ko'radi (kimniki va summasi), faqat ko'ra oladi, taom ura olmaydi. Chek yopilgach xona yana bo'sh.
  Sozlamalar → Ruxsatlar → "Ofitsant xonalari": "Kim birinchi ochsa" (hamma bizneslarda yoqildi) yoki "Faqat biriktirilgan xonalar".
- **Oshxona qog'ozi** mijoz cheki uslubida (rasm, DejaVu Sans Mono): tepada katta xona nomi, ostida chek, ofitsant, vaqt;
  har taom — **avval nomi, o'ngda soni**, katta harflarda; qo'shimcha tanlov (+) va izoh (*) ostida; otkazda qora fonda
  "BEKOR QILINDI". FLOWI Printer, Windows dasturi va brauzerda bir xil. "Oddiy matn" belgisi bu qog'ozga ham ishlaydi.

## 1.27.2 — Chekda bo'lim nomlari yo'q
- Mijoz chekida bo'lim nomlari (1-TAOM, SHASHLIKLAR…) endi chiqmaydi — taomlar bitta ro'yxat. Hamma bizneslarda bir marta
  o'chirildi; xohlagan Sozlamalar → Ko'rinish → Chek → "Taomlarni bo'limlar bo'yicha guruhlash" bilan qayta yoqadi.

## 1.27.1 — Chek ixchamroq, kassir doim yoziladi
- Mijoz chekida qatorlar biroz yaqinroq (chek ~17% qisqa), lekin bir-biriga tegmaydi.
- "Kassir: …" doim chiqadi: yopilgan chekda pulni olgan kassir, to'lovdan oldingi hisob chekida "Chek"ni bosgan xodim.

## 1.27.0 — Mijoz cheki rasm bo'lib chiqadi: o'z shrifti, keng qatorlar
- **FLOWI Printer orqali mijoz cheki endi rasm bo'lib chiqadi**: shrift DejaVu Sans Mono (qalin), qatorlar orasi keng,
  ustunlar tekis — har qanday 80 / 58 mm printerda bir xil (avval printerning o'z shrifti va oralig'i edi, uni buyruq
  bilan o'zgartirib bo'lmaydi). Chek tepasida **logotip** ham chiqadi (PNG, o'lchami Sozlamalar → Ko'rinish → Chek'dan).
  Kassa kompyuteridagi FLOWI Printer dasturini yangilash shart emas.
- Juda eski printer rasm chiqara olmasa: Printerlar → shu printerda "Mijoz chekini oddiy matn qilib chiqarish".
- Windows dasturi va brauzer chekida ham shu shrift (shrift chek ichiga joylanadi — chop etish paytida yo'qolmaydi).
- Oshxona qog'ozlari o'zgarmadi.

## 1.26.2 — Windows dasturida papkaga zaxira (FLOWI Windows 1.2.0)
- **FLOWI Windows dasturi 1.2.0**: Sozlamalar → Zaxira → "Papkani tanlash" — Windows'ning o'z oynasi ochiladi; tanlangan papkada
  "FLOWI zaxira" ichiga har 3 soatda biznesning to'liq bazasi yoziladi (oxirgi 60 tasi saqlanadi). Ruxsat so'ralmaydi,
  dastur qayta yoqilganda ham papka esda qoladi; "Papkani ochish", "Papkadagi nusxalar" (tiklash uchun) ham ishlaydi.
  Avval dastur ichidagi brauzer (Chromium 108) papkaga yoza olmasdi — endi faylni dasturning o'zi yozadi.
- Eski dastur (1.1.x) ochilsa, Zaxira bo'limida "dasturni yangilang" degan yozuv chiqadi.
- Windows dasturi va eski Chrome'da yuqori menyu va bo'limlar tagidagi qo'pol kulrang aylantirish chizig'i
  yashirildi / ingichka qilindi.

## 1.26.1 — Mijoz cheki o'qishga qulayroq
- Taom bitta qatorda: **nomi — soni — summasi** ("2 x 35 000" degan alohida qator yo'q), tepasida "Nomi / Soni / Summa".
- Bir xil taom bir necha marta urilgan bo'lsa, chekda bitta qator: "Non — 2 — 10 000", "Saboy idish — 4 — 20 000".
- "Taomlar" va "Xizmat haqi" ro'yxat davomida, o'sha ustunlarda (chiziqsiz), keyin katta JAMI.
- Chekda to'lov turi (Naqd / Karta / O'tkazma) yozilmaydi; avansli sotuvda "Avans" va "Qoldi" qoladi.
- FLOWI Printer chekida qatorlar orasi kengroq — o'qish oson.
- Hammasi FLOWI Printer, Windows dasturi va brauzer chekida bir xil.

## 1.26.0 — Boshliq paneli va qo'shimcha tanlovlar (modifikatorlar)
- **Boshliq paneli** (yangi "Panel" bo'limi, boshliq va admin uchun): tepada bugungi savdo (kechagi shu vaqtga nisbatan %),
  ochiq cheklar va summasi, bugungi xarajat, stop-list; pastda 5 ta rangli guruh — Menyu, Moliya, Cheklar, Xodimlar,
  Sozlamalar — har bir havolada jonli son (taomlar, ochiq va o'chirilgan cheklar, otkazlar, bronlar, ishdagilar…).
  Hisobot huquqi yo'q admin pul raqamlarini ko'rmaydi.
- **Qo'shimcha tanlovlar** (Menyu → "Qo'shimcha tanlovlar"): guruhlar — masalan "Achchiqligi" (achchiq / o'rtacha /
  achchiqmas) yoki "Qo'shimcha" (+pishloq +5 000, +tuxum). Guruh "bittasi" yoki "bir nechtasi", majburiy yoki ixtiyoriy;
  bitta guruh ko'p taomga biriktiriladi (guruh oynasida yoki taom oynasida).
  - Ofitsant yoki kassir taomni bosganda tanlov oynasi chiqadi, narx tanlovga qarab o'zgaradi; bir xil tanlov bitta qatorga qo'shiladi.
  - Tanlov oshxona ekrani, oshxona qog'ozi (FLOWI Printer ham), mijoz cheki, cheklar hisobotida ko'rinadi.
  - Variant keyin o'zgartirilsa ham, eski cheklarda o'sha paytda tanlangani qoladi.
- Oshxona qog'ozida "1 ×" belgisi endi bo'linmaydi.

## 1.25.0 — Cheklar hisoboti va yangi chek ko'rinishi
- **Cheklar hisoboti** yangilandi: keng jadval — №, turi (yopilgan / ochiq / o'chirilgan), ochilgan va yopilgan vaqt, ofitsant,
  stol va zal, mehmonlar, tannarx, taomlar, xizmat haqi (% va summa), chegirma (% va summa), jami.
  - Filtrlar: sana, chek turi, to'lov turi, ofitsant, zal, stol/xona, chegirma, qidiruv; "Filtrlarni tozalash".
  - Har chek o'z joyida ochiladi: taomlar qo'shilgan vaqti bilan, **bekor qilingan taom OTKAZ deb chizilgan**
    (sababi, kim va qachon bekor qilgani bilan) va jamiga qo'shilmaydi; to'lovlar, kim yopgani, necha marta chop etilgani.
    Shu yerning o'zida: chek tarixi, qaytarish, qolganini to'lash, chop etish.
  - Sahifalar yo'q: pastga aylantirgan sari keyingi cheklar o'zi yuklanadi. Pastda butun davr bo'yicha jami doim ko'rinib turadi.
  - Ochiq cheklar summasi hozirgi taomlardan hisoblanadi. Excel ham shu filtr bilan, tannarx va zal ustunlari bilan.
  - Telefonda — kartochkalar, filtrlar bitta tugma ostida, jami pastda ixcham (bosilsa to'liq ochiladi).
- **Yangi chek ko'rinishi**: katta nom, manzil, Sana / Ofitsant / Chek № / Stol / Mehmonlar, taomlar bo'limlar bo'yicha
  (BAR, OSHXONA…), Summa / Xizmat haqi / Chegirma, katta **JAMI**, "N kishi — har biriga", to'lov turlari, avans.
- **Sozlamalar → Ko'rinish → Chek**: logotip o'lchami surgich bilan (20–100%), qog'oz kengligi (80 / 58 mm),
  bo'limlar bo'yicha guruhlash, "har biriga" qatori, chek ostiga bir nechta qator yozuv — yonida **jonli ko'rinish**
  va "Sinov cheki" tugmasi. FLOWI Printer dasturi chiqaradigan chek ham shunday.

## 1.24.0 — Printer vazifalari, boshqa xonalarni ko'rish, PIN ko'rish
- **Printerlar** (Sozlamalar → Printerlar): har printerda ikki belgi — **"Mijoz cheki (hisob)"** va **"Buyurtma qog'ozlari"**
  (qaysi bo'limlar chiqishi tanlanadi, "Hamma bo'limlar" ham bor). Kassa printeriga ham bo'lim biriktirsa bo'ladi.
  Urilgan taom, otkaz va o'chirilgan chek qog'ozi faqat o'sha taom bo'limi biriktirilgan printerga chiqadi.
  Endi bo'lim tanlanmasa — hech narsa chiqmaydi (avval "hammasi" edi; eski sozlamalar "Hamma bo'limlar" bo'lib qoldi).
- **"Chek" istalgan qurilmadan kassaga**: mijoz cheki printeri belgilangan bo'lsa, ofitsant telefonidan, planshetdan yoki
  ikkinchi kompyuterdan bosilgan chek server orqali kassa printeridan chiqadi (boshqa qurilmalarda printer sozlash shart emas).
  Kassa printeri o'chiq bo'lsa ogohlantirish chiqadi, chek u yoqilganda chiqadi. FLOWI Printer dasturi ham mijoz chekini chiqaradi.
- Ogohlantirishlar: hech qaysi printerga chiqmaydigan bo'lim, ikki printerga chiqadigan bo'lim, bir nechta kassa printeri.
- **Ofitsant hamma xonalarni ko'radi**: o'zinikilar odatdagidek, boshqalarniki xira — kim ochgani va summasi ko'rinadi.
  Boshqa ofitsantning chekini faqat ko'radi, hech narsa ura olmaydi; bo'sh begona xonani bossa "Sizga biriktirilmagan" chiqadi.
- **Oddiy ofitsantda "Olib ketish" yo'q** — faqat kassir, boshliq va dostavchikda (fast foodda hammada).
- **Boshliq xodim PIN va parolini ko'radi** (Xodimlar → PIN ustiga bosish, faqat egasi). Har ko'rish tarixga yoziladi.
  Shifrlangan nusxa serverdagi maxfiy kalit bilan saqlanadi. Eski PIN xodim keyingi safar kirganda ko'rinadi.
  Xodim oynasida **"Yangi PIN yaratish"** tugmasi.
- Ekran klaviaturasi yopilganda pastda qolib ketadigan kulrang yo'lak tuzatildi.
- Menyu kartochkalari eski kompyuterlarda (Windows 7, Chrome 109) oq bo'lib qolardi — endi hamma joyda rangli, bir xil.
- Bo'lim tanlash tugmalari orqasidagi ortiqcha kulrang fon olib tashlandi.

## 1.23.4 — Chek o'chirilganda oshxonaga qog'oz
- Butun chek o'chirilganda buyurtma printerlariga **"BEKOR QILINDI — BUTUN CHEK O'CHIRILDI"** qog'ozi chiqadi:
  xona, chek raqami, taomlar (har printerga o'z bo'limi — oshxonaga oshxona taomlari, shashlikchiga shashlik), sababi va kim o'chirgani.
  Berilgan yoki tayyor bo'lgan taomlar "berilgan edi" / "tayyor edi" deb belgilanadi.
- Oshxona ekranida ovozli ogohlantirish: "Diqqat! … Butun chek o'chirildi."
- Avvalgidek: buyurtma urilganda va bitta taom bekor qilinganda (otkaz) ham qog'oz chiqadi.

## 1.23.3 — Ish oynasida lavozim nomi
- Ish oynasida (xodimni tanlash, PIN), xodim tanlash ro'yxatlarida va ish vaqti jurnalida endi xodimning lavozimi
  ("Dostavchik", "Katta ofitsant") ko'rinadi, asosiy huquqi ("Ofitsant") emas.

## 1.23.2 — Windows 7 uchun to'liq o'rnatuvchi
- Kichik o'rnatuvchi Windows 7/8 da "internet connection seems to be unavailable" deb to'xtardi: u dasturni GitHub'dan
  Windows'ning eski tarmoq qismi orqali yuklaydi, Windows 7 esa unda TLS 1.2 ni qo'llamaydi.
  Endi har versiyada **FLOWI-Setup-Full-<versiya>.exe** ham bor — internetdan hech narsa yuklamaydi.
  Botga keladigan xabarda Windows 7/8 uchun shu to'liq o'rnatuvchining havolasi ham bo'ladi.

## 1.23.1 — Yangilanish faqat xohlaganda; dostavchik "Olib ketish" orqali
- **FLOWI Windows dasturi 1.1.1**: endi o'zi yangilanmaydi. Yangi versiya chiqsa, dastur sozlamalarida (Ctrl+Shift+S) ko'rinadi —
  qulay paytda "Yuklab olish" va "Hozir yangilash" bosiladi. "Avtomatik yangilansin" belgisi o'chiq (xohlagan yoqadi).
- Alohida "Yetkazib berish" bo'limi olib tashlandi: dostavchik ham **"Olib ketish"** (soboy) orqali avvalgidek chek uradi.
  Lavozimi "Dostavchik" bo'lib qoladi; uning cheklari, summasi va sotgan taomlari hisobotda alohida ko'rinadi.

## 1.23.0 — Chekni o'chirish, dostavchik, xodim turlari, Windows dasturi o'zi yangilanadi
- **Chekni o'chirish** (mijoz chiqib ketdi): Sozlamalar → Ruxsatlar → **"Chek o'chirish paroli"** (faqat boshliq qo'yadi).
  Parolni bilgan xodim taomli chekni sabab bilan o'chiradi; parol o'rnatilsa admin ham uni so'raydi.
  Chek bazadan o'chmaydi: savdodan chiqadi va **Hisobot → O'chirilgan** bo'limida qoladi — nima urilgan, kim urgan,
  kim va qachon o'chirgan, sababi. Kechki Telegram hisobotida ham ko'rinadi.
- **Dostavchik va xodim turlari**: Xodimlar → **"Lavozimlar"** — o'z lavozimlaringizni yarating (masalan "Katta ofitsant",
  "Barmen") va qaysi huquq bilan ishlashini tanlang. **Dostavchik** faqat yetkazib berishni ko'radi: mijoz ismi,
  telefoni, manzili va yetkazish haqi bilan buyurtma uradi, taomlar oshxonaga boradi. Pulni kassaga topshiradi —
  kassir chekni "Olib ketish"dan yopadi. Hisobot → Xodimlar'da dostavchikning cheklari, summasi va sotgan taomlari.
- **Xonalar**: kartochkalar har ekranda bir xil ixcham o'lchamda, atrofda ko'proq joy.
- **FLOWI Windows dasturi 1.1** — **o'zi yangilanadi**: dastur sozlamalarida "Yangilanish" bo'limi
  (Tekshirish / Yuklab olish / Hozir yangilash) va "Avtomatik yangilansin" belgisi. O'rnatuvchi endi kichik (0,6 MB).
- **Yangi Windows dasturi botga fayl bo'lib keladi**: yangi versiya chiqishi bilan FLOWI-Setup.exe sizning Telegram'ingizga
  o'zi yuboriladi; platformada "Oxirgi versiyani hozir yuborish" tugmasi.

## 1.22.2 — Windows dasturi: Windows 7'da "ERR_CERT_AUTHORITY_INVALID" tuzatildi
- Yangilanmagan Windows 7/8 saytning Let's Encrypt sertifikatini tanimasdi. Dastur endi Let's Encrypt'ning ildiz
  sertifikatlarini (ISRG Root X1, X2) o'zi bilan olib yuradi va zanjirni o'zi tekshiradi: faqat biznesingiz manzili uchun,
  faqat Windows ildizni tanimagan holda; sayt nomi, muddatlar va har bir imzo tekshiriladi.

## 1.22.1 — Windows dasturi Windows 7 va 32-bit kompyuterlarda ham
- FLOWI-Setup endi **Windows 7/8/10/11** va **32-bit hamda 64-bit** kompyuterlarda ishlaydi (o'rnatuvchi mosini o'zi tanlaydi).
  Oldingi fayl Windows 7 / 32-bit'da "не является приложением Win32" xatosini berardi.

## 1.22.0 — FLOWI Windows dasturi (kassa kompyuteri uchun)
- **FLOWI-Setup.exe**: o'rnatiladi, ish stolida belgi chiqadi, kompyuter yoqilganda o'zi ochiladi; bitta nusxa ishlaydi.
  Birinchi ochilishda biznes havolasi yoziladi (masalan `flowi.uz/c/navruz`) — keyin har safar to'g'ridan-to'g'ri ochiladi.
- **Chop etish oynasisiz**: chek — "Chek printeri"ga, oshxona qog'ozi — "Oshxona printeri"ga (Windows'dagi USB printerlar).
  Printer javob bermasa — ogohlantirish va oddiy chop etish oynasi (chek yo'qolmaydi). "Sinov cheki" tugmasi.
- **Kassa rejimi** (ixtiyoriy): doim to'liq ekran, xodim tasodifan chiqib keta olmaydi.
- **Internet uzilsa**: "Internet yo'q" sahifasi, aloqa tiklanishi bilan o'zi qayta ochiladi.
- Tugmalar: Ctrl+Shift+S — sozlamalar, F11 — to'liq ekran, F5 — yangilash.
- Dastur saytning o'zini ochadi: FLOWI'dagi har bir yangilanish dasturda ham darrov bo'ladi.
- .exe GitHub'da avtomatik yasaladi (Actions → "FLOWI Windows dasturi", tayyor fayl — Releases sahifasida).

## 1.21.1 — Yangilanish testlari tuzatildi
- Ba'zi serverlarda yangilanish 3 ta Telegram testi tufayli to'xtab, eski versiyaga qaytardi. Sabab dasturda emas, testda edi:
  test Telegram xabari tahrirlanishini kutmasdan tekshirardi (tez kompyuterda ulgurardi, sekinrog'ida yo'q),
  yiqilganda esa botni o'chirmay qoldirib, keyingi testlarni ham yiqitardi. Endi kutadi va har doim tozalab chiqadi.

## 1.21.0 — Google va Yandex'da chiqish
- Bosh sahifa ikki manzilda: **flowi.uz/** (o'zbekcha) va **flowi.uz/ru** (ruscha). Ruscha matn serverning o'zida
  qo'yiladi, shuning uchun Yandex va Google uni to'liq o'qiydi; UZ/RU tugmalari shu manzillarga o'tadi, tanlov eslab qolinadi.
- Qidiruv tizimlari uchun: sarlavha va tavsif har tilda, canonical, hreflang, Open Graph, tuzilgan ma'lumot
  (dastur va tarif narxlari, savol-javoblar), narxlar sahifaning o'zida.
- **sitemap.xml** va **robots.txt** saytning o'z manzili bilan; Yandex uchun `?from=…` belgilari bir sahifa deb hisoblanadi.
  Biznes sahifalari, dastur va platforma qidiruvga chiqmaydi.
- Platformada **🔍 "Google va Yandex"** oynasi: Search Console va Yandex Webmaster tasdiqlash kodini qo'yish, qadamma-qadam yo'riqnoma.
- Mavjud bo'lmagan manzil endi haqiqiy **404** sahifa beradi (oldin bosh sahifa ochilardi — qidiruv tizimlari buni yomon ko'radi).

## 1.20.0 — Eshik do'koni: avans (bosh to'lov) va qolganini keyin to'lash
- **To'lov oynasida ikki tugma**: "To'liq to'lov" va **"Avans (bosh to'lov)"**. Avansda mijoz ismi va telefoni
  shu yerda yoziladi (oldindan ro'yxatda bo'lishi shart emas, keyingi safar telefonidan o'zi topiladi),
  avans summasi va **qolganini qachon to'lashi**. Hamma tariflarda ishlaydi, faqat eshik do'konida.
- Sotuvdan keyin va **chekda**: jami, avans, qoldi, to'lash sanasi. **Nakladnoy**da ham.
- **Cheklar → "To'lanmagan"**: qarzi qolgan hamma cheklar, to'lash sanasi bo'yicha; muddati o'tgani qizil; jami qoldiq.
- **"Qolganini to'lash"**: bir yo'la yoki bo'lib, naqd/karta/o'tkazma; har bir to'lov sanasi va kim olgani bilan yoziladi.
  Oxirgisidan keyin chekda **"To'liq to'landi"** chiqadi. Pul kassaga **to'langan kuni** tushadi.
- To'lash kuni **"Bugun"** ro'yxatida va ertalabki Telegram xabarida eslatiladi; to'langach eslatma o'zi yopiladi.
- To'lanmagan chekdagi mol qaytarilsa: avval qarz kamayadi, kassadan faqat to'langan pul qaytadi.
- Tuzatildi: telefonda Cheklar bo'limida tanlangan chek ko'rinmay qolardi (hamma biznes turlarida).

## 1.19.0 — Chegirmalar, har bir biznesga Telegram hisobot, versiyalar ro'yxati
- **Chegirma** (platforma → biznesni tahrirlash → "Chegirma"): foiz yoki summa, muddati bilan yoki doimiy, sababi bilan.
  - Kartada eski narx o'chirilgan holda va yangi narx ko'rinadi; "Oylik tushum" chegirma bilan hisoblanadi.
  - Muddat tugasa, narx o'zi tarif narxiga qaytadi.
  - Biznes egasi o'z "Tarif" sahifasida chegirmali narxni ko'radi (sababi ko'rinmaydi).
- **Telegram hisobot — har bir biznesga alohida**:
  - bitta biznesga **bir nechta odam** ulanadi: egasi, sherigi, boshqaruvchi yoki guruh — har biri o'z hisobotini oladi;
  - platformada har bir biznes kartasida kim ulanganini va hisobot vaqtini ko'rasiz;
  - "Telegram hisobot" oynasidan **ulash havolasini** olib, mijozga yuborasiz — u bitta bosishda ulanadi;
  - hisobot vaqtini o'zgartirish, kimnidir uzish, hisobotni hozir yuborish ham shu yerda.
  - Zaxira nusxalar avvalgidek **faqat sizga** boradi.
- **Versiyalar** (platforma → "Versiyalar"): har bir yangilanishda nima o'zgargani; sana — serverda o'rnatilgan kun.

## 1.18.1 — "Mening natijalarim" olib tashlandi
- Xodimlar (ofitsant, kassir, oshpaz) sozlamalaridagi **"Mening natijalarim"** bo'limi olib tashlandi — natijalar faqat boshliq uchun
  (Moliya → Hisobot → xodim bo'yicha). Xodim o'z natijasini havola orqali ham ocha olmaydi.

## 1.18.0 — Printerlar boshliq sozlamalarida, bir kompyuterdan bir nechta printer
- **Printer sozlamalari faqat boshliqda**: Sozlamalar → **Printerlar**. Ofitsant va oshpaz qurilmada printerni o'chira olmaydi;
  qurilmaning ⚙ menyusida faqat holati ko'rinadi. Avval yoqilgan printerlar o'z-o'zidan yoqiq qoladi.
- **FLOWI Printer dasturi** (ixtiyoriy, Sozlamalar → Printerlar → "FLOWI Printer dasturini ishlatish"):
  - kassa kompyuteriga bir marta o'rnatiladi, Windows yoqilganda o'zi ishga tushadi;
  - kompyuterdagi **USB printerlarni o'zi topadi**, **LAN printerlar IP orqali** qo'shiladi (port 9100);
  - har bir printerga nom va bo'lim: sho'rva — oshxonaga, shashlik — shashlikchiga; 80/58 mm qog'oz;
  - chop etish oynasisiz, to'g'ridan-to'g'ri; printer javob bermasa qog'oz kutib turadi va ekranda ogohlantirish chiqadi;
  - "Sinov qog'ozi" faqat tanlangan printerga chiqadi; kompyuter o'chirilsa kaliti bekor bo'ladi.
- **Davomat yashirildi**: "Ishga keldim" (Sozlamalar → Joylashuv) yoqilmagan bo'lsa Davomat bo'limi ko'rinmaydi.
  Kunlik ishlovchilar uchun kelgan kunlar orqada belgilanaveradi.

## 1.17.0 — Oshxona printerlari va platformadan biznesni o'chirish
- **Buyurtma printeri sozlamalari** (qurilmaning qulf ekrani → ⚙ → "Buyurtma printeri"):
  - **faqat oshxona taomlari** chop etiladi (choy, non, ichimlik oshxona qog'oziga tushmaydi) yoki hammasi;
  - **bo'lim bo'yicha printerlar**: har bir printer o'z bo'limlarini tanlaydi — kabobxonaga faqat kaboblar, barga ichimliklar;
  - "Sinov qog'ozi" va **oxirgi qog'ozlarni qayta chop etish**.
- **Hech bir buyurtma yo'qolmaydi**: har bir qog'oz avval serverga yoziladi. Printer kompyuteri o'chib qolsa,
  oxirgi 3 soatda chop etilmay qolganlar u yoqilganda o'zi chiqadi ("KECHIKIB CHIQDI" belgisi bilan).
- **Printer ulanmagan bo'lsa ogohlantirish**: kassa, ofitsant va boshliq ekranining pastki qatorida
  "Printer ulanmagan: Oshxona" chiqadi va bir marta xabar keladi.
- **Oshxonaga qayta chop etish**: chek → ☰ → "Oshxonaga qayta chop etish" (qog'oz yo'qolsa yoki printerda qog'oz tugasa) — "QAYTA CHOP ETILDI" belgisi bilan.
- Bekor qilingan taom qog'ozi ("BEKOR QILINDI") faqat o'sha taom chiqqan printerga boradi.
- **Platforma: biznesni butunlay o'chirish** (biznes kartasi → ⋮ → "Butunlay o'chirish"). Tasdiqlash uchun biznes kodi
  va platforma paroli so'raladi. Oxirgi nusxasi serverda (data/backups/deleted/) saqlanadi va Telegramga yuboriladi.
  Vaqtincha to'xtatish uchun "Bloklash" avvalgidek ishlaydi.
- Eski qurilmalarda yoqilgan printer o'zi yangi tizimga o'tadi (faqat oshxona taomlari rejimida).

## 1.16.1 — Kichik tuzatish
- "Xodimning kuni" sahifasi xodim tanlanmasdan ochilsa, xato o'rniga Hisobotga qaytadi.

## 1.16.0 — Batafsil hisobot: kategoriyalar, xodimlar, chek tarixi, shubhali holatlar
Moliya → **Hisobot** yangilandi. Tepada davr (bugun / kecha / hafta / oy / sana) va **xodim** tanlanadi — xodim tanlansa,
hamma yorliq faqat o'shaniki bo'ladi. Telefon, planshet va kompyuterda bir xil qulay.
- **Umumiy**: savdo (o'tgan davr bilan solishtirish), chiqim, foyda, mehmonlar, to'lov turlari, soatlar bo'yicha grafik.
- **Taomlar**: kategoriya bo'yicha (Suyuq taomlar, Quyuq taomlar…), bosilsa ichidagi taomlar — nechta, qancha, foydasi;
  bekor qilinganlar alohida.
- **Xodimlar**: har biri — cheklar, mehmonlar, savdo, o'rtacha chek, chegirma, bekor qilganlari, yopgan cheklari, kelgan–ketgan vaqti.
  Xodim bosilsa — **uning kuni**: daqiqama-daqiqa nima qilgani (chek ochdi, taom qo'shdi, bekor qildi, chop etdi, yopdi),
  uning cheklari va sotgan taomlari.
- **Smenalar**: kim ochdi va yopdi, kutilgan va haqiqiy naqd, kamomad yoki ortiqcha.
- **Shubhali**: dastur o'zi topadi — chek chop etilgandan keyin taom olib tashlangan, tayyor taom bekor qilingan,
  10% dan katta chegirma, butun chek bekor qilingan, chek 8 soatdan ko'p ochiq turgan, kassada kamomad.
- **Chek tarixi**: Cheklar bo'limida va hisobotda chek raqami bosilsa — kim ochdi, kim qaysi taomni qo'shdi,
  oshxona qachon qabul qildi, kim bekor qildi va nega, necha marta chop etildi, kim va soat nechada yopdi.
- **Mening natijalarim**: ofitsant va kassir Sozlamalar'da faqat o'zining kunini ko'radi.
- Excelga: kategoriya va taomlar, xodimlar, shubhali holatlar.
- Telegram'dagi kechki hisobotga ofitsantlar savdosi va shubhali holatlar soni qo'shildi.
- Eski cheklar ham to'liq ko'rinadi: amallar tarixi har doim yozib borilgan.

## 1.15.0 — To'liq oylik hisobot: barcha xodimlar, doimiy xarajatlar, sof foyda
- **Dasturga kirmaydigan xodimlar** (tandirchi, idishchi, qorovul, farrosh…): Xodimlar → "Dasturga kirmaydi (faqat maosh)".
  Faqat ism, lavozim, telefon va maosh kiritiladi; login/PIN yo'q, tarif limitiga kirmaydi. Davomat, avans, bonus va jarima ular uchun ham ishlaydi.
- Yangi xodim qo'shishda **maoshi shu oynaning o'zida** kiritiladi (oylik / kunlik / soatbay / foiz).
- **Soatbay maosh**: "Ishga keldim / Ishni tugatdim" vaqtlari bo'yicha hisoblanadi.
- **Doimiy xarajatlar** (Moliya → Doimiy xarajatlar): ijara, svet, gaz, suv, soliq, internet, reklama… har oyning qaysi kuni to'lanishi bilan.
  - To'lov kuni kelganda Xonalar sahifasida va Telegramda eslatma chiqadi.
  - "To'landi" bosilsa, kassaga o'zi yoziladi; svet va gaz kabi o'zgaruvchan summani to'lashda to'g'rilash mumkin.
- **Sof foyda** (Moliya → Sof foyda, Biznes va Pro, faqat boshliq uchun): oy bo'yicha savdo − mahsulot − ish haqi − ijara, kommunal, soliq, reklama… = sof foyda.
  - Ish haqi berilgani emas, **hisoblangani** bo'yicha olinadi; to'lov kuni kelib to'lanmagan doimiy xarajatlar ham shu oyga kiradi.
  - Har bir guruhning savdodagi ulushi, o'tgan oy bilan solishtirish, "Hali to'lanmagan" ro'yxati, Excelga yuklab olish.
- **Xarajat guruhlari**: har bir xarajat kategoriyasi guruhga tegishli (mahsulot, ish haqi, ijara, kommunal, soliq, reklama, ta'mirlash, transport, boshqa).
  Guruh nomdan o'zi aniqlanadi, Sozlamalar → Muassasa'da o'zgartirish mumkin. Choyxona uchun yangi kategoriyalar: Svet, Suv, Reklama.
- **Tez kirim-chiqim**: Xonalar (va kassa) sahifasida "+ Kirim / − Chiqim" tugmalari; xarajatni **kechagi yoki boshqa kunga** yozish mumkin.
- **Start tarifida** ham oddiy kirim-chiqim, kassa smenasi va doimiy xarajatlar ochildi.
- **Telegram**:
  - har kuni kechqurun (vaqti sozlanadi, standart 23:00) kunlik hisobot: savdo, to'lov turlari, xarajat, eng ko'p sotilganlar, ochiq cheklar;
  - choyxonaga ertalab faqat to'lov kuni kelgan xarajatlar haqida xabar keladi (ishlar ro'yxati — faqat eshik do'konida).
- **Har kecha zaxira Telegramga** (platforma egasining chatiga): soat 3 dan keyin har bir biznes fayli siqilgan holda yuboriladi —
  server buzilsa ham ma'lumot qoladi. Platforma → Telegram oynasida yoqish/o'chirish va "Hozir yuborish".
- "Bugun" bo'limi endi faqat eshik do'konida; do'konlarda "Tayyor (taom)" bo'limi olib tashlandi.
- Tuzatishlar:
  - masalliq ombori sahifasi jonli yangilanadi va "kam qoldi" ogohlantirishi chiqadi;
  - telefonda tasdiqlash oynasi va platforma kartochkasidagi tugma matnlari endi kesilmaydi.

## 1.14.0 — Joylashuv: avtomatik davomat, GPS, selfi va QR-menyu himoyasi
Hammasi ixtiyoriy: Sozlamalar → **Joylashuv** bo'limida ega o'zi yoqadi (standart holatda o'chiq).
- **Ish joyi joylashuvi**: ega ish joyi ichida turib "Hozirgi joyni saqlash" ni bosadi, radius tanlanadi (50 m – 1 km).
- **Xodimlar faqat ish joyida**: kassir, ofitsant va oshpaz o'z telefonida dasturni faqat radius ichida ochadi;
  joylashuv har ~5 daqiqada fonda tekshiriladi. Kassa kompyuteri, oshxona planshetiga va egaga ta'sir qilmaydi.
- **Ish vaqti (avtomatik davomat)**: telefonda "Ishga keldim" ekrani — bosmaguncha dastur ochilmaydi. Tasdiqlash usullari:
  - **GPS** — ish joyi radiusida bo'lish;
  - **kassa ekranidagi QR kod** — har 30 soniyada o'zgaradi, rasmga olib uyga olib ketib bo'lmaydi
    (kassada va qurilmaning qulf ekranida "Davomat QR" tugmasi);
  - **selfi** — old kamera bilan; ega rasmni Davomat sahifasida ko'radi.
  - Telefon tasdiqlay olmasa (bino ichida GPS yo'q) — "Kassir tasdiqlasin": kassir/egada tasdiqlash oynasi chiqadi.
  - "Ishni tugatdim" tugmasi; kassa smenasi yopilganda hammaning ish vaqti o'zi tugaydi; unutilgan kun oxirgi faollik vaqtida yopiladi.
  - Kassa yoki oshxona qurilmasida PIN bilan kirish — o'zi "keldi" bo'ladi.
- **Davomat sahifasida "Ish vaqti"**: kim soat nechida keldi va ketdi, necha soat ishladi, qanday tasdiqlandi (GPS 37 m · QR · selfi),
  kechikish (ish boshlanish vaqti sozlanadi), selfi rasmi, ochiq ish vaqtini yopish.
- **QR-menyu himoyasi**:
  - mehmon buyurtma, chaqiruv va hisobni faqat ish joyi ichida (GPS) yubora oladi — havola tarqalib ketsa ham uydan ishlamaydi;
  - "faqat band xonaga buyurtma" — ofitsant xonani ochmaguncha buyurtma o'tmaydi ("Ofitsantni chaqirish" doim ishlaydi);
  - "Barcha QR kodlarni yangilash" — eski kodlar va havolalar darhol ishlamay qoladi.
- Selfi rasmlari faqat ega va adminga ko'rinadi (ochiq havola orqali emas).

## 1.13.2 — Yangilash testi tuzatildi
- Server yarim tundan keyin (00:00–05:00) yangilansa, 2 ta test xato chiqib, yangilanish eski versiyaga qaytarilardi.
  Sabab dasturda emas, testda edi: test "ertangi kun"ni Toshkent vaqti o'rniga Grinvich vaqtida hisoblardi. Endi istalgan soatda o'tadi.

## 1.13.1 — Bosh sahifa yangilandi
- flowi.uz bosh sahifasi oxirgi o'zgarishlar bilan yangilandi:
  - tepada **"Yangi: QR-menyu va eshik do'konlari uchun bo'lim"** belgisi, menyuda "QR-menyu" va "Do'konlar" havolalari;
  - "Tanish holatmi?" bo'limiga 2 ta yangi muammo: **ish esdan chiqishi** (→ "Bugun" va Telegram eslatma) va **nasiya qarzlar** (→ qarz daftari);
  - yangi **QR-menyu** bo'limi: 4 qadam (skanerlash → tanlash → ofitsant tasdiqlaydi → oshxona) va mehmon telefoni rasmlari;
  - yangi **"Do'konlar uchun"** bo'limi: Bugun sahifasi, Mol keldi (yo'lkira bilan tannarx), kamera skaner va yorliqlar,
    o'rnatish/yetkazish ustalar bilan, sof foyda hisoboti — haqiqiy ekran rasmlari bilan;
  - Imkoniyatlar 6 tadan 15 taga: Bugun va ishlar, Telegram eslatma, QR-menyu, qarz daftari, mijozlar va keshbek, masalliq ombori, filiallar, davomat, yetkazib beruvchilar;
  - "Kimlar uchun"ga **Eshik do'koni**, ariza formasiga "Eshik do'koni" turi qo'shildi; 3 ta yangi savol-javob (skaner, QR xato buyurtma, Telegram eslatma);
  - Biznes tarifida "Qarz daftari" ko'rsatiladi; hamma yangi matnlar rus tilida ham bor.
- QR-menyu: mehmon telefonida pastki "Savat" tugmasi tor ekranda summani kesmaydigan qilindi.
- Brak (hisobdan chiqarish) ombordagi sonidan ko'p bo'lishi mumkin emas — qoldiq minusga tushmaydi.

## 1.13.0 — Kamera bilan skanerlash
- Telefon, planshet yoki noutbuk **kamerasi skaner bo'lib ishlaydi** — alohida skaner sotib olish shart emas.
  - **Sotuv**: 📷 Kamera tugmasi — kodga tutilgan mol darhol savatga tushadi ("pip" ovozi, telefon titraydi), kamera ochiq qoladi,
    keyingi molni ham skanerlash mumkin. Topilmagan kod — "Yangi mahsulot" tugmasi bilan shu kodda mahsulot ochiladi.
  - **Mahsulot qo'shish/tahrirlash**: shtrix-kod maydoni yonida 📷 — qutidagi kod o'qiladi va yoziladi.
  - **Mol keldi**: "Kamera bilan qo'shish" — skanerlangan mol ro'yxatga qo'shiladi yoki soni ortadi.
- EAN-13, EAN-8, UPC, Code-128, Code-39, ITF va QR kodlar o'qiladi. Android va kompyuterda brauzerning o'z o'qigichi,
  iPhone'da esa kerak bo'lganda yuklanadigan o'qish kutubxonasi ishlatiladi. Qorong'ida — chiroq tugmasi (telefon ruxsat bersa).
- Birinchi marta brauzer kameraga ruxsat so'raydi.

## 1.12.1 — Shtrix-kod yorliqlari
- Mahsulotlar → **Yorliq**: tanlangan mollarga shtrix-kod yorliqlari chop etiladi — do'kon nomi, mol nomi, o'lcham · rang · tur · tomon,
  narx va shtrix-kod. O'lchamlar: termo yorliq 58×40 yoki 40×30 mm, yoki A4 varaq (24 ta, 70×37 mm).
- Kodi yo'q mollarga dastur o'zi **EAN-13** kod yaratadi ("20" bilan boshlanadi — do'kon ichki mollari uchun ajratilgan,
  zavod kodlari bilan to'qnashmaydi). Har qanday skaner o'qiydi; Sotuv ekranida skanerlansa, mol savatga tushadi.
- "Har biridan omborda qancha bo'lsa" — har bir dona uchun bittadan yorliq.
- **Mol keldi**dan keyin "Yorliq chop etish" taklif qilinadi (kelgan soni bo'yicha); bitta mol uchun — mol menyusidagi ⋮ → "Shtrix-kod yorlig'i".

## 1.12.0 — Eshik do'koni va "Bugun" (kunlik ishlar)
- **"Bugun" sahifasi** (hamma bizneslar uchun): bugungi va kechikkan ishlar, bugungi savdo va sof foyda, bugungi chiqishlar
  (yetkazish, o'rnatish), kam qolgan mollar, qarzlar. Eshik do'konida dastur shu sahifadan ochiladi; katta tugmalar:
  Sotish · Mol keldi · Xarajat · Hisobot.
- **Ishlar (eslatmalar)**: bir martalik yoki takrorlanadigan (har kuni / hafta / oy), soati bilan, xodimga biriktirish mumkin.
  **Doimiy xarajat** (ijara, soliq, kommunal): har oy o'zi chiqadi, ✓ bosilganda xarajat bo'lib yoziladi.
  Dastur o'zi ham ish yozadi: yetkazish/o'rnatish sanasi, mijoz qarzini olish, yetkazib beruvchiga to'lash — ish bajarilsa
  yoki qarz yopilsa o'zi yopiladi. Kechikkan ish qizil bo'lib tepada turadi.
- **Telegram eslatma**: Sozlamalar → Telegram. Har kuni ertalab soat 8 da bugungi ishlar ro'yxati (va kechagi savdo/foyda),
  vaqti belgilangan ishdan 1 soat oldin eslatma keladi.
- **Eshik do'koni** biznes turi: mollarda o'lcham, rang, turi (MDF, metall…), ochilish tomoni, kam qolganda ogohlantirish,
  yetkazib beruvchi. Sotuv ekranida o'lcham/tur/rang bo'yicha tez filtr.
- **Mol keldi**: yetkazib beruvchidan bir nechta mol birdan; **yo'lkira** mollarga narxiga qarab bo'lib qo'shiladi va har bir
  eshikning haqiqiy tannarxi (o'rtacha) chiqadi; to'lanmagan qismi yetkazib beruvchiga qarz bo'lib yoziladi.
- **Sotuvda xizmatlar**: yetkazib berish va o'rnatish — mijozdan olinadigan va ustaga/haydovchiga beriladigan summa, usta,
  sana va soat, manzil. Avans/nasiya (qolganini qachon to'lashi bilan). Sotuvdan keyin **"Shu savdodan sof foyda"** ko'rinadi.
- **Nakladnoy** (A4) chop etish: sotuvdan keyin va Cheklar bo'limidan.
- **Ustalar va ishlar**: ustalar ro'yxati, o'lchovga yozish, rejadagi/bajarilgan ishlar, kimga qancha to'lash kerak, bir tugma bilan to'lash.
- **Brak / hisobdan chiqarish**, **sanash** (kamomad yoki ortiqcha), har bir mol harakatlari tarixi.
- **Excel'dan yuklash**: jadvalni nusxa olib joylash — ustunlar nomidan o'zi taniydi.
- **Foyda hisoboti** (do'konlar uchun): Savdo − mollar tannarxi − ustalar va yetkazish − brak − ijara, soliq, kommunal,
  ish haqi… = **sof foyda**, o'tgan davrga nisbatan; eng ko'p sotilgan va eng ko'p foyda keltirgan mollar, kam sotilgan,
  **o'lik mollar** (60 kun harakatsiz, qancha pul qotgani), ombordagi mol qiymati, qarzlar, kunlar bo'yicha savdo, Excel.
  Har bir raqam yonidagi ⓘ uni bir gap bilan tushuntiradi.
- **Qarzlar** sahifasi: bizga qarz (mijozlar) va biz qarzmiz (yetkazib beruvchilar, ustalar) — bitta joyda, to'lov tugmalari bilan.
- Tariflar: **Qarz daftari endi Biznes tarifida ham** bor (saqlangan tariflarga bir marta o'zi qo'shiladi).
- Do'kondagi oddiy "Kirim" ham endi o'rtacha tannarx va harakatlar tarixi bilan yoziladi (kassa yozuvi: "Mol xaridi").

## 1.11.0 — QR-menyu: mijoz stoldan buyurtma beradi
- **Har bir xona/stol uchun QR kod** (Sozlamalar → QR-menyu). Kod ichida maxfiy kalit bor — xona raqamini taxmin qilib
  boshqa xonaga buyurtma berib bo'lmaydi. Kod tarqalib ketsa, bitta tugma bilan yangilanadi (eskisi darhol ishlamay qoladi).
  **Chop etish**: A4 varaqqa 4 tadan stol kartasi — logotip, joy nomi, xona, QR kod, o'zbek va rus tilida yozuv.
- **Mijoz telefonida menyu** (login va ilova kerak emas): xona nomi, ofitsant va kassir ismi, bo'limlar, qidiruv,
  taom rasmlari va tavsifi, narx, tayyor bo'lish vaqti. Tugagan taomlar ko'rinmaydi. O'zbek va rus tilida.
- **Buyurtma so'rovi**: mijoz taomlarni tanlab (har biriga izoh bilan) "Ofitsantga yuborish" ni bosadi. Bu hali chek emas:
  xona ofitsanti va kassirga ovozli xabar keladi, ular ko'rib, kerak bo'lsa miqdorni kamaytirib **tasdiqlaydi** — shundan
  keyingina chek ochiladi va taomlar oshxonaga boradi. Yoki sabab bilan **rad etadi**. Mijoz holatni o'z telefonida ko'radi.
- **"Ofitsantni chaqirish"** va **"Hisob"** tugmalari: mijoz o'z hisobini (taomlar, xizmat haqi, jami) ko'radi va hisob so'raydi.
- Himoya: bir xonadan bir vaqtda ko'pi bilan 2 ta tasdiqlanmagan buyurtma, 15 daqiqada javob berilmagan so'rov o'zi bekor bo'ladi,
  bir manzildan juda ko'p so'rov qabul qilinmaydi. Boshliq QR buyurtmani o'chirib qo'yishi yoki vaqt belgilashi mumkin (masalan 10:00–23:00).
- Menyu → taom: **rasm** va **qisqa tavsif** (mijoz uchun). Rasm telefonga moslab avtomatik kichraytiriladi.
- Tariflar: QR-menyu (ko'rish) — barcha tariflarda; QR orqali buyurtma, chaqiruv, hisob — Biznes va Pro'da.
  Ilgari saqlangan tariflarga bu bo'limlar o'zi qo'shiladi.

## 1.10.0 — Arizalar va Telegram bot
- flowi.uz bosh sahifasida **"Ariza qoldiring"** anketasi (o'zbek/rus): ism, telefon, biznes nomi va turi, xodimlar soni,
  shahar, qo'ng'iroq uchun qulay vaqt, tarif, izoh. Narxlardagi "Ulanish" tugmasi tarifni anketada o'zi tanlaydi.
- Ariza avval serverga yoziladi, keyin **Telegram botingizga** xabar keladi. Telegram ishlamay qolsa ham ariza yo'qolmaydi —
  server keyin qayta yuboradi.
- Xabar ostida tugmalar: "📞 Qo'ng'iroq qilindi", "✅ Ulandi", "✖️ Rad etildi" — holat platformada ham o'zgaradi.
- Platformada **Arizalar** bo'limi: yangi arizalar soni, shu oy, nechtasi mijozga aylangani, qidiruv, holat, izoh,
  "Biznes ochish" (ma'lumotlari o'zi to'ldiriladi, ariza "Ulandi" bo'ladi).
- **Ariza qayerdan kelgani**: havolaga `?from=instagram` kabi belgi qo'yilsa, platformada manbalar bo'yicha hisob ko'rinadi.
- Botni ulash platformadagi ✈ tugmasidan: token → "O'zimning Telegramimga" yoki "Guruhga". Bir martalik kod bilan ulanadi,
  tugmalarni faqat ulangan chat bosa oladi. Token kodda emas, serverdagi bazada saqlanadi.
- Spamdan himoya: bitta manzildan soatiga 5 tadan ortiq ariza qabul qilinmaydi, robotlar uchun yashirin maydon,
  bir xil raqamdan qayta bosilsa ikkinchi ariza ochilmaydi.

## 1.9.1
- flowi.uz bosh sahifasi endi doim ochiladi: shu brauzerda dasturga kirilgan bo'lsa ham avtomatik dasturga o'tkazib yubormaydi.
  Dastur o'z havolasidan (flowi.uz/c/kod) yoki telefondagi belgidan ochiladi.
- iPhone/iPad (Safari): kirish ekranida bir marta maslahat chiqadi — "Ulashish" (□↑) → "Bosh ekranga". Belgi to'g'ri
  biznes sahifasidan qo'shiladi. × bosilsa boshqa chiqmaydi; Android va kompyuterda ko'rinmaydi.

## 1.9.0 — Pro: qarz daftari, mijozlar va keshbek, ombor va tex-karta, filiallar
- **Qarz daftari**: to'lov oynasida mijozni tanlab, "Qolganini qarzga yozish" — chek yopiladi, qolgan summa mijoz qarziga
  yoziladi. Moliya → Mijozlar → Qarzdorlar: kim qancha qarz, har bir chek va to'lov tarixi. Qarz qaytarilganda
  "Qarz to'lovi" tugmasi — pul kassaga tushadi (foydaga ikki marta qo'shilmaydi).
- **Mijozlar bazasi va keshbek**: mijoz telefon yoki ism bilan topiladi yoki shu yerning o'zida qo'shiladi. Har to'lovdan
  bonus yig'iladi (Sozlamalar → Muassasa → Keshbek, standart 3%); keyingi tashrifda "Bonusdan foydalanish" bilan chekdan ayiriladi.
  Tashriflar soni, jami xarid, oxirgi tashrif ko'rinadi.
- **Masalliq ombori va tex-karta**: Moliya → Ombor — guruch, go'sht, yog' kabi masalliqlar, qoldiq, minimal qoldiq, qiymat.
  Kirim (bir nechta masalliq birdan, xohlasa "Mahsulotlar" xarajati bo'lib yoziladi), hisobdan chiqarish (sabab bilan),
  sanoq (inventarizatsiya), harakatlar tarixi. Menyu → taom → **Tex-karta**: bir porsiyaga masalliqlar; tannarx va foyda
  foizi o'zi hisoblanadi. Chek yopilganda masalliqlar ombordan o'zi ayiriladi, qaytarilganda qaytadi; kam qolsa ogohlantiradi.
  Oshpaz ham Ombor bo'limini ko'radi (kirim va hisobdan chiqarish).
- **Filiallar hisoboti**: platformada filialni asosiy biznesga bog'lang (tahrirlash → "Asosiy biznes"). Asosiy biznes
  egasi Moliya → Filiallar sahifasida hamma filial savdosi, cheklar, naqd/karta, qarz, chiqim va foydani bitta jadvalda ko'radi.
- Hisobot → To'lov turlari: "Qarzga", "Bonus bilan", "Xodim hisobiga" ham ko'rsatiladi.
- Bu to'rt bo'lim Pro tarifida. Ilgari saqlangan tariflarga yangi bo'limlar o'zi qo'shiladi; mavjud ma'lumot o'zgarmaydi,
  yangi jadvallar avtomatik yaratiladi.

## 1.8.3
- Telefonga o'rnatilgan FLOWI belgisi qaysi biznesniki ekanini bilmasa (iPhone'da bo'lishi mumkin), endi bosh sahifaga
  o'tib ketmaydi — qurilmani ulash oynasi biznes kodi bilan ochiladi; kod bir marta kiritiladi.
- Yangilash skripti (deploy/update.sh) git buyruqlarini dastur foydalanuvchisi nomidan ishlatadi.

## 1.8.2
- iPhone: biznes sahifasini "Bosh ekranga qo'shish" endi o'sha biznesni ochadi (oldin flowi.uz bosh sahifasi ochilardi).
  Har bir biznes havolasi o'z ilova belgisiga ega — nomi biznes nomi bilan.

## 1.8.1
- Platforma paneli endi `/planeta` manzilida (masalan, flowi.uz/planeta). Eski `/platform` manzili bosh sahifani ochadi.
  Serverda `PLATFORM_PATH` o'rnatilsa, o'sha manzil ishlatiladi.

## 1.8.0 — Davomat, xodim xarajatlari, kunlik to'lov va avans
- **Davomat** sahifasi (Xodimlar → Davomat, yoki Moliya → Davomat): har bir xodim uchun katta tugmalar —
  Keldi / Kelmadi / Dam olish / Kasal; kun tanlab o'tgan kunlarni ham to'g'rilash mumkin. Dasturga kirgan xodim o'zi "Keldi" bo'ladi.
  Boshliq va admin belgilaydi. Ish haqi sahifasidagi oylik jadvalda ham katakni bosib: ✓ → ✕ → D → K → bo'sh.
- **Kunlik ishchi kechqurun pulini oladi:** Davomatda har kunlik xodim yonida "To'lash 120 000 so'm" — bugun ishlagani
  minus bugungi xarajatlari (ovqat, ichimlik). Admin faqat shu kungi qoldiqni bera oladi, boshliq istalganini.
- **Oylik xodimga avans:** Ish haqi sahifasida "Avans" tugmasi (oylikning yarmi taklif qilinadi). 15-sanadan keyin
  avans berilmagan oylikchilar haqida eslatma chiqadi. Avans va to'lov kassada "Ish haqi" xarajati bo'lib yoziladi.
- **Xodim xarajati** (ovqat, ichimlik, boshqa) — ish haqidan ushlanadi, jarimadan alohida ko'rinadi.
- **Kassada "Xodim hisobiga"**: xodim yegan ovqat chekini kassir xodimni tanlab yopadi — summa o'sha xodimning
  ish haqidan avtomatik ushlanadi, xizmat haqisiz; kassaga naqd tushmaydi, hisobotda alohida ko'rinadi.
  Narxini boshliq tanlaydi: menyu narxida yoki tannarxda (Sozlamalar → Muassasa → Xodimlar ovqati).
  Xodim ovqatidan ofitsantga foiz yozilmaydi.
- Eski ish haqi yozuvlari yangi bazaga o'zgarishsiz ko'chiriladi.

## 1.7.0 — flowi.uz bosh sahifasi
- Saytning bosh sahifasi (flowi.uz) endi FLOWI haqida: nima qiladi, qanday ishlaydi (dasturning haqiqiy rasmlari bilan),
  imkoniyatlar, xavfsizlik, kimlar uchun, narxlar, savollar va bog'lanish. O'zbek va rus tilida, telefonga moslashgan.
- Narxlar platformadagi "Tariflar"dan avtomatik olinadi: narxni o'zgartirsangiz, saytda ham o'zi o'zgaradi.
  "Bog'lanish" tugmalari platformadagi yordam kontaktiga (Telegram yoki telefon) olib boradi.
- Dasturning kirish oynasi saytda ko'rinmaydi: biznes faqat o'z havolasi orqali ochiladi — flowi.uz/c/<kod>.
  Bu havolada "Kod" maydoni yo'q, faqat boshliq logini va paroli. Ulangan kassa va planshetlar saytni ochsa, o'z dasturiga o'tadi.
- Telefon/planshetga o'rnatilgan ilova belgisi ham o'z biznesini ochadi.

## 1.6.1 — Bitta ofitsant, bitta qurilma
- Start va Biznes tariflarida bitta ofitsant hisobi bir vaqtda faqat bitta qurilmada ochiq turadi: boshqa telefon yoki
  planshetdan kirsa, avvalgisi o'zi chiqadi va u yerda "Bu hisob boshqa qurilmada ochildi" deb yoziladi.
  Yuborilgan buyurtmalar joyida qoladi, yuborilmagan savat o'sha qurilmada saqlanib turadi. Pro'da cheklov yo'q.
- Kassir, boshliq va admin cheklanmaydi. Umumiy planshetda navbat bilan PIN terib ishlash avvalgidek.
- Platformada "Tariflar" oynasida har bir tarif uchun "Bir ofitsant bir vaqtda nechta qurilmada" sozlanadi (0 = cheksiz).
- Hisob almashib ishlatilsa (7 kunda 3 marta va undan ko'p, ishlab turgan qurilmadan), platformadagi biznes kartasida
  "Hisob almashib ishlatilyapti: Ali (5 marta)" ogohlantirishi chiqadi. Boshliqning "Amallar tarixi"da ham ko'rinadi.
- Tuzatildi: sessiya tugaganda ochiq qolgan oyna xodimlar ekrani ustida qolib ketmaydi.

## 1.6.0 — Tariflar
- Uchta tarif: **Start** (199 000, 5 xodim), **Biznes** (349 000, 15 xodim, moliya, bronlar, Excel, amallar tarixi),
  **Pro** (599 000, cheksiz xodim). Qo'shimcha filial — 149 000. Yillik to'lov — 10 oy narxida. Yangi biznesga 14 kun bepul sinov.
- Platformada "Tariflar" oynasi: har bir tarifning nomi, narxi, xodim limiti va bo'limlarini, filial narxini,
  yillik to'lov oylarini, kechikish va sinov kunlarini o'zingiz o'zgartirasiz — barcha bizneslarga darhol qo'llanadi.
- Har bir biznesga tarif tanlanadi; kerak bo'lsa maxsus narx yoki "filial" belgisi. Kartada tarif, oylik narx
  va xodimlar soni (masalan, 4/5); yuqorida oylik tushum tariflar bo'yicha.
- Boshliqda: Sozlamalar → "Mening tarifim" (tarif, muddat, xodimlar, tarifdagi bo'limlar). Tarifga kirmagan bo'lim
  bosilsa — tarifni yangilash uchun bog'lanish oynasi.
- Ma'lumot hech qachon o'chmaydi: tarif pasaysa faqat yangi xodim qo'shish to'xtaydi. Muddat tugagach 3 kun ishlayveradi,
  keyin "faqat ko'rish" rejimi (hamma narsani ko'rish va Excelga yuklash mumkin); to'lov bo'lishi bilan davom etadi.
- Avvaldan bor bizneslar "Biznes" tarifiga o'tkazildi (hech narsa yopilmadi).

## 1.5.3
- Qaytarildi: "Moliya" bo'limi (Hisobot, Kirim-chiqim, Ish haqi) dizayn yangilanishida tasodifan yo'qolib qolgan edi.
  Endi u yuqori menyuning o'ng chetida "Moliya" yozuvi bilan turadi; telefonda — Sozlamalar sahifasining tepasida.

## 1.5.2
To'liq tekshiruv (noldan o'rnatish, 96 ta API tekshiruvi, yuklama testi, brauzerda 4 xil biznes turi):
- Juda katta so'rov endi aniq "So'rov juda katta" javobini oladi (oldin ulanish uzilib qolardi).
- Telefonda stop-list: narx bir necha qatorga bo'linmaydi, "Tugadi" tugmasi ekranga sig'adi.
- Jadvallardagi summalar bir qatorda turadi.

## 1.5.1
- Boshliq va admin ish stolida parol qo'ymaguncha parolsiz kiradi (ekranda "parol qo'ying" eslatmasi turadi).
- 12 ta yangi chiroyli fon rasmi (jami 28 ta): shahar chiroqlari, tumanli tog'lar, qumtepalar, shimol yog'dusi,
  dengizdagi quyosh botishi, choyxona chiroqlari, tumanli o'rmon, somon yo'li, kechki Samarqand va boshqalar.

## 1.5.0
- Chek yozuvlari qalin, qora shriftda — termoprinterda xira chiqmaydi.
- Chek tepasida logotip (yoqish/o'chirish, chek uchun alohida oq-qora logotip; PNG va JPG).
- Taomni qisman bekor qilish (5 tadan 2 tasini); bekor qilingan taom darhol buyurtma printeridan chiqadi.
- Chop etish oynasisiz ishlash uchun Windows kassa yorlig'i (`start.bat` ham shunday ochadi).
- Ish stoli uchun 16 ta tayyor rasmdan istalganini tanlash.
- Ekran klaviaturasi sensorli ekranlarda yaxshiroq aniqlanadi; kirish sahifasida klaviatura tugmasi.
- PIN xato kiritilganda bloklash sozlanadi: necha marta, necha daqiqa yoki umuman bloklanmasin.
- Xona turlari nomini o'zgartirish va yangi tur qo'shish.
- Versiya raqami ekran chetida.

## 1.4.0
- Yangi dizayn: bo'limlar tepada, holat qatori pastda, ixcham xona va taom tugmalari, cheklar tarixi ikki panelda.
- Ekran klaviaturasi.

## 1.3.0
- Biznes turlari (fast food, do'kon, kiyim), qaytarish, kompyuterdagi papkaga zaxira, to'lov eslatmasi, buyurtma printeri.
