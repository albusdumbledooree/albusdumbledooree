# FLOWI — versiyalar

Har bir yangilanishda versiya raqami oshadi va ekran chetida (pastki qator, ish stoli, platforma) ko'rinadi.

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
