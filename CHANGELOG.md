# FLOWI — versiyalar

Har bir yangilanishda versiya raqami oshadi va ekran chetida (pastki qator, ish stoli, platforma) ko'rinadi.

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
