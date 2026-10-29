# FLOWI — choyxona, restoran, fast food va do'konlar uchun boshqaruv tizimi

Buyurtma qabul qilish, oshxona ekrani, kassa, kirim-chiqim va kunlik / haftalik / oylik hisobotlar — bitta tizimda.
Biznes turlari: **choyxona, restoran/kafe, fast food, do'kon (oziq-ovqat), kiyim-kechak** — har biriga ekranlar o'zi moslashadi.
Telefon, planshet va kompyuterda brauzer orqali ishlaydi (ish stoli va telefonga ilova sifatida o'rnatiladi — PWA).
Tillar: **o'zbekcha** (asosiy), **русский**, **English**.

**Bitta sayt — ko'p choyxona.** Sayt egasi `/planeta` sahifasida choyxonalarni qo'shadi va har biriga boshliq login-parolini beradi.
Boshliq o'z choyxonasiga xodimlarni o'zi qo'shadi. Har bir choyxonaning ma'lumotlari alohida faylda saqlanadi va boshqalariga ko'rinmaydi.

## Platforma (sayt egasi uchun)

Platforma manzili faqat sizga ma'lum bo'lsin: serverda `PLATFORM_PATH=/maxfiy-manzil` deb o'rnating
(standart `/planeta`). Choyxona sahifalarida platformaga hech qanday havola yo'q.

1. `https://sayt/planeta` ni oching. Birinchi kirish: `superadmin` / `super123` → **darhol parolni o'zgartiring** (kalit tugmasi).
2. **Yangi biznes**: biznes turi, nomi, kodi (masalan `navruz`), boshliq ismi, login va parol, to'langan muddat, oylik narx.
   "Namuna ma'lumotlar" belgilansa, tayyor menyu (yoki do'kon uchun mahsulotlar) bilan ochiladi.
3. Chiqqan matnni (havola + kod + login + parol) **Nusxa olish** bilan Telegram orqali boshliqqa yuboring.
4. Boshliq `https://sayt/c/navruz` havolasini ochadi (kod avtomatik to'ladi), kiradi va **Xodimlar** bo'limida
   admin, kassir, ofitsant va oshpazlarni qo'shadi. Xodimlar ham shu havola orqali kiradi.

Platformadagi boshqa amallar:

| Tugma | Vazifasi |
|---|---|
| **Kirish** | Biznesni uning boshlig'i ko'radigan ekran bilan yangi oynada ochish: menyu, xodimlar, xonalar, sozlamalar — hammasini tahrirlash mumkin. Kirish biznesning amallar tarixiga yoziladi |
| **Tahrirlash** | Nomi, biznes turi, boshliq, telefon, muddat, narx, bo'limlar (paket), oshxona rejimi, yordam kontakti, izoh |
| **+1 oy** | To'langan muddatni bir oyga uzaytirish (to'lov qabul qilinganda) |
| ⋮ → Parol | Boshliq parolini unutsa — yangi parol berish |
| ⋮ → Zaxiradan tiklash | Serverdagi kunlik nusxalardan birini tanlab, biznesni o'sha holatga qaytarish |
| ⋮ → Bloklash | To'lov qilinmasa: barcha xodimlar darhol chiqariladi, kirish yopiladi. Ma'lumotlar o'chmaydi, qayta faollashtiriladi |
| ⋮ → Havola | Kirish havolasini nusxalash |
| Yuqoridagi yordam tugmasi | Hamma bizneslarning ish stolida chiqadigan "To'lov va yordam: @username" qatori. Har biznes uchun alohida ham yozish mumkin |

**Biznes turlari:**

| Turi | Asosiy ekran | Nima o'zgaradi |
|---|---|---|
| Choyxona, restoran | Xonalar (bo'limlar/qavatlar bo'yicha) | Ofitsant, oshxona, xizmat haqi, bronlar |
| Fast food | **Sotuv** + ochiq buyurtmalar | Pul oldindan olinadi, buyurtma raqami chekda katta chiqadi, taom oshxonaga boradi |
| Do'kon, kiyim-kechak | **Sotuv** (shtrix-kod skaneri) | Oshxona va xonalar yo'q; mahsulot: shtrix-kod, qoldiq, o'lcham/rang (kiyim), "Kirim" (tovar keldi), qaytarish |

**Bo'limlarni yoqish/o'chirish (paketlar).** ✏️ oynasida har bir choyxona uchun bo'limlarni belgilaysiz:
Stop-list, Hisobotlar, Kirim-chiqim, Ish haqi, Bronlar, Cheklar tarixi, Amallar tarixi.
O'chirilgan bo'lim choyxonaning menyusidan darhol yo'qoladi va server ham uni yopadi. Xonalar, buyurtma, menyu, kassa va xodimlar doim ishlaydi.

**Oshxona rejimi** (har choyxona uchun):

| Rejim | Nima bo'ladi |
|---|---|
| To'liq | Oshpaz "Qabul qilish" → "Tayyor" bosadi, ofitsantga ovozli xabar boradi. Tayyor bo'lmaguncha chek yopilmaydi |
| Faqat xabar | Buyurtma oshxona ekranida ko'rinadi / chop etiladi, qabul qilish shart emas, chek istalgan vaqtda yopiladi |
| O'chiq | Oshxonaga hech narsa bormaydi, taom darhol "berildi" bo'ladi, oshxona bo'limi yo'qoladi |

Har bir choyxona bo'yicha xodimlar, xonalar, oxirgi 30 kundagi cheklar va savdo, oxirgi faollik ko'rinadi.
Muddat 5 kundan kam qolganda boshliqning ekranida eslatma chiqadi.

### Eshik do'koni va "Bugun"
Biznes turi **Eshik do'koni**: mollar o'lcham/rang/tur/tomon bilan; **Mol keldi** (yo'lkira tannarxga bo'linadi, yetkazib beruvchi qarzi);
sotuvda yetkazish va o'rnatish (ustaga beriladigan haq bilan), avans/nasiya, nakladnoy; ustalar va ishlar; brak va sanash;
Excel'dan yuklash; **Foyda hisoboti** (sof foyda, ko'p/kam sotilgan, o'lik mollar). "Bugun" sahifasi va **Ishlar** (takrorlanadigan,
doimiy xarajatlar) barcha bizneslarda bor; ertalabki Telegram eslatma — Sozlamalar → Telegram (platforma boti ulangan bo'lishi kerak).

### QR-menyu (mijoz stoldan buyurtma beradi)
Sozlamalar → **QR-menyu**: har bir xona uchun QR kod, "Hammasini chop etish" (A4, 4 ta karta). Mijoz skanerlaydi —
`/q/<kalit>` sahifasida menyu (rasmlar bilan) ochiladi, login kerak emas. Mijoz yuborgan buyurtma **so'rov** bo'lib keladi:
xona ofitsanti yoki kassir tasdiqlagandan keyingina chek ochiladi. "Ofitsantni chaqirish" va "Hisob" tugmalari ham bor.
Taom rasmi va tavsifi: Menyu → taomni tahrirlash. Buyurtma vaqtini cheklash yoki o'chirish: shu QR-menyu bo'limida.

### Arizalar va Telegram bot
Bosh sahifadagi "Ariza qoldiring" anketasi to'ldirilsa, ariza avval serverga (platform.db) yoziladi, keyin Telegram botingizga xabar boradi.
Platformada **Arizalar** bo'limi: holat (Yangi / Qo'ng'iroq qilindi / Ulandi / Rad etildi), izoh, "Biznes ochish".

Botni ulash: Telegramda @BotFather → `/newbot` → tokenni platformadagi ✈ (Telegram bot) tugmasiga joylang →
"O'zimning Telegramimga" yoki "Guruhga" tugmasini bosing. Xabar ostidagi tugmalar holatni platformada ham o'zgartiradi.
Telegram vaqtincha ishlamasa, arizalar yo'qolmaydi — server ulanish tiklanganda qayta yuboradi.
Reklama havolasiga belgi qo'ying (`https://flowi.uz/?from=instagram`) — arizaning manbasi platformada ko'rinadi.

## Ishga tushirish (kompyuterda)

**Windows — eng oson yo'l (git va buyruqlar shart emas):**

1. https://nodejs.org saytidan **LTS** versiyani yuklab o'rnating (hamma "Next" ni bosing). O'rnatgandan keyin kompyuterni qayta yoqing.
2. Dasturni ZIP qilib yuklab oling:
   https://github.com/albusdumbledooree/albusdumbledooree/archive/refs/heads/claude/restaurant-management-system-0i70j3.zip
   (yoki GitHub sahifasida yashil **Code → Download ZIP** tugmasi).
3. ZIP ustida o'ng tugma → **Extract All** (Hammasini chiqarish). ZIP ichidan to'g'ridan-to'g'ri ochmang.
4. Ochilgan papkadagi **`start.bat`** faylini ikki marta bosing. Qora oyna ochiladi va brauzerda dastur chiqadi.
   Oynani yopmang — yopsangiz dastur to'xtaydi.
5. Windows "Firewall" ruxsat so'rasa — **Allow / Ruxsat berish** ni bosing (telefonlar ulanishi uchun).
   Qora oynada ko'rsatilgan `http://192.168....:3000` manzilini telefonlarda oching.

**macOS:** xuddi shunday, lekin `start.command` faylini ikki marta bosing.

**Buyruq qatori orqali** (dasturchilar uchun): `npm start` → http://localhost:3000, testlar: `npm test`.

Ma'lumotlar `data/` papkasida saqlanadi (zaxira: `npm run backup`). Eski versiyadagi `data/choyxona.db` avtomatik ravishda `asosiy` kodli choyxona bo'ladi.

**Ko'p uchraydigan xatolar:**

| Xato | Yechim |
|---|---|
| `'node' is not recognized` / `node topilmadi` | Node.js o'rnatilmagan yoki kompyuter qayta yoqilmagan |
| `'git' is not recognized` | Git kerak emas — yuqoridagi ZIP usulidan foydalaning |
| `npm.ps1 cannot be loaded ... running scripts is disabled` | PowerShell cheklovi — `start.bat` ni ishlating |
| `Node.js versiyasi eski` | nodejs.org dan yangi LTS versiyani o'rnating |
| `port band` | Dastur allaqachon ochiq — brauzerda http://localhost:3000 ni oching |
| Telefondan ochilmayapti | Telefon va kompyuter bitta Wi-Fi da bo'lsin; Firewall'da Node.js ga ruxsat bering |

| Muhit o'zgaruvchisi | Ma'nosi |
|---|---|
| `PORT` | Port (standart 3000) |
| `DATA_DIR` | Bazalar papkasi (standart `data/`: `platform.db` va `tenants/<kod>.db`) |
| `TZ` | Vaqt mintaqasi (standart `Asia/Tashkent`) |
| `PLATFORM_PATH` | Platforma panelining maxfiy manzili (standart `/planeta`) |
| `PLATFORM_USER`, `PLATFORM_PASSWORD` | Birinchi ishga tushishda platforma administratori (standart `superadmin` / `super123`) |
| `SEED_DEMO=0` | `demo` kodli sinov choyxonasi yaratilmasin |
| `TRUST_PROXY=1` | Caddy/Nginx orqasida ishlaganda mijozning haqiqiy IP manzilini olish |

### Sinov hisoblari

Choyxona kodi: **`demo`** (havola: `http://localhost:3000/c/demo`).

**Qurilmani ulash** (kassa kompyuteri, planshet, telefon): kod `demo`, boshliq `ega` / `ega123`.
Shundan keyin ekranda soat va xodimlar ro'yxati turadi, xodim ismini bosib PIN kiritadi:

| Xodim | PIN | Login / parol (faqat boshliq va admin — qurilma ulash uchun) |
|---|---|---|
| Boshliq | `1234` | `ega` / `ega123` |
| Administrator | `5555` | `admin` / `admin123` |
| Kassir Dilnoza | `4444` | `kassir` / `kassir123` |
| Ofitsant Jasur | `1111` | `jasur` / `1234` |
| Ofitsant Bobur | `2222` | `bobur` / `1234` |
| Oshpaz Rustam | `3333` | `oshpaz` / `1234` |

Platforma: `http://localhost:3000/planeta` — `superadmin` / `super123`.

> ⚠️ Haqiqiy ishga tushirishda `SEED_DEMO=0` ishlating va platforma parolini o'zgartiring.

## Kirish: ish stoli va PIN

- Kassa kompyuteri yoki planshetni **boshliq bir marta ulaydi** (o'z logini bilan). Keyin u qurilmada doim
  **soat, sana va xodimlar ro'yxati** turadi. Xodim ismini bosadi → **PIN** (1–4 raqam) kiritadi → ishlaydi.
- **"Chiqish"** (qulf belgisi) bosilsa — yana xodimlar ro'yxatiga qaytadi.
- Boshliq va admin PIN o'rniga xohlagan uzunlikdagi parol qo'ya oladi.
- **To'liq ekran** tugmasi bor; ekran o'z-o'zidan o'chib qolmaydi (Android/kompyuter; iPhone — ilova o'rnatilganda).
- **Avtomatik qulf**: Sozlamalar → Ruxsatlar, N daqiqa hech narsa bosilmasa xodimlar ro'yxatiga qaytadi.
- PIN 5 marta xato kiritilsa, o'sha xodim shu qurilmada 5 daqiqaga bloklanadi. Ulangan qurilmalar ro'yxati: Sozlamalar → Qurilmalar.
- Har bir qurilma (kompyuter, planshet, telefon) "Umumiy qurilma" sifatida bir marta ulanadi — alohida shaxsiy kirish yo'q.
- **Ish stoli foni**: Sozlamalar → Ko'rinish. Standart, **avtomatik rasm** (16 ta ichki rasm, har kuni almashadi, internet shart emas),
  istalgan **rang** yoki **o'z rasmingiz**. Fon och bo'lsa yozuvlar to'q, to'q bo'lsa oq bo'ladi — doim o'qiladi.
- **Logotip**: Sozlamalar → Ko'rinish. Ish stoli, chap menyu va chekda chiqadi.
- Ish stoli pastida platforma egasi yozgan **yordam kontakti** (Telegram username yoki telefon) chiqadi.
- iPhone'da brauzer to'liq ekranni qo'llamaydi — to'liq ekran tugmasi ilovani bosh ekranga qo'shishni ko'rsatadi.
- Ish stoli ikki bosqichli: avval soat va bitta **Kirish** tugmasi, bosilganda xodimlar ro'yxati (ixcham, ko'p xodim bitta ekranga sig'adi).
- **Ekran klaviaturasi**: sensorli kassa terminallarida (klaviaturasiz) har bir yozish maydonida o'zi chiqadi — raqam maydonlarida
  katta raqamlar paneli, matnda lotin (oʻ, gʻ) yoki kirill harflari. Qurilma menyusida yoki Sozlamalar → Mening sozlamalarim'da:
  Avtomatik / Doim yoqiq / O'chiq. Telefonda o'z klaviaturasi ishlatiladi.

## Buyurtma jarayoni

1. **Ofitsant** kiradi — o'ziga biriktirilgan banket xonalari rangli kartalar ko'rinishida chiqadi
   (yashil — bo'sh, sariq — band, miltillovchi — taom tayyor, binafsha — hisob so'ralgan, ko'k — bron).
   Pastda **"Olib ketish"** bo'limi: soboy uchun istalgancha alohida chek ochiladi (xizmat haqisiz, mijoz ismi bilan).
2. Bo'sh xonani bosganda **"Necha kishi?"** so'raladi. Chap tomonda **chek** turadi: taomlar yozilgan tartibda
   ("1-yuborish 21:45", "2-yuborish 22:10"), o'ngda menyu. Telefonda chek pastdagi tugma bilan chapdan ochiladi.
   Taom tanlanadi → **"Yuborish"** → **tasdiqlash oynasi** → oshxonaga ketadi.
3. **Oshxona ekranida** buyurtma "Yangi" ustunida ovozli signal bilan paydo bo'ladi. Oshpaz **"Qabul qilish"** ni bosadi —
   taom "Tayyorlanmoqda" holatiga o'tadi, ortga sanovchi taymer ishlaydi, kechiksa qizil bo'ladi. Ofitsantga "qabul qilindi, ~soat 14:35 da tayyor" xabari boradi.
4. Taom tayyor bo'lgach oshpaz **"Tayyor"** ni bosadi → ofitsant telefonida **ayol ovozida** "Diqqat! Uchinchi xona. Sho'rva, ikki porsiya tayyor. Olib keting." degan xabar o'qiladi, tebranish va yashil banner chiqadi.
5. Ofitsant **"Oldim"** ni bosadi — taom "Berildi" holatiga o'tadi va chekda qoladi.
6. Mehmonlar ketayotganda ofitsant **"Hisob so'rash"** ni bosadi → kassirga ovozli xabar boradi.
7. **Kassir** to'lovni qabul qiladi (naqd / karta / Click-Payme yoki aralash, xizmat haqi %, chegirma, qaytim hisoblanadi) → chek chop etiladi → chek yopiladi va savdo kirimga yoziladi.

Non, choy, ichimliklar kabi oshxonada tayyorlanmaydigan mahsulotlar darhol "berildi" bo'ladi.

## Lavozimlar va huquqlar

| Imkoniyat | Boshliq | Admin | Kassir | Ofitsant | Oshpaz |
|---|:-:|:-:|:-:|:-:|:-:|
| Admin tayinlash | ✅ | | | | |
| Kassir, ofitsant, oshpaz tayinlash | ✅ | ✅ | | | |
| Taom qo'shish, narx o'zgartirish, xonalar | ✅ | ✅ | | | |
| "Tugadi" (stop-list) | ✅ | ✅ | ✅ | | ✅ |
| Buyurtma berish | ✅ | ✅ | ✅ | ✅ (o'z xonalari) | |
| Oshxona ekrani | ✅ | ✅ | | | ✅ |
| To'lov qabul qilish, chegirma | ✅ | ✅ | ✅ | | |
| Kirim / xarajat kiritish | ✅ | ✅ | ✅ | | |
| Hisobotlar | ✅ | ✅ | ✅ | | |
| Tayyorlangan taomni bekor qilish | ✅ | ✅ | ✅ | | |
| Taomli chekni bekor qilish | ✅ | ✅ | | | |
| Kirim-chiqim yozuvini o'chirish | ✅ | | | | |
| Amallar tarixi (audit) | ✅ | ✅ | | | |
| Cheklar tarixi, Excel'ga yuklash | ✅ | ✅ | ✅ | | |
| Ish haqi, bonus, jarima, davomat | ✅ | | | | |
| O'z ish haqini ko'rish | | ✅ | ✅ | ✅ | ✅ |

**Bekor qilish:** yuborilgan taomni ofitsant faqat boshliq ruxsat bergan bo'lsa (Sozlamalar → Ruxsatlar) va boshliq bergan
**maxsus kod** bilan bekor qila oladi. Aks holda — faqat kassir yoki boshliq. Barcha bekor qilishlar sababi bilan yoziladi.

**Chek huquqlari:** Xodimlar bo'limida har bir xodim uchun alohida: *printerdan chek chiqarish* va *chekni yopish (to'lov qabul qilish)*.
Standart: kassir — ikkalasi bor; ofitsant — chek chiqaradi, yopmaydi. Har bir chek necha marta chop etilgani yoziladi.

## Moliya va hisobotlar

Hisobot, Kirim-chiqim va Ish haqi asosiy menyuda ko'rinmaydi — ular chap menyuning eng pastidagi xira **"Moliya"** tugmasi ichida
(telefonda: Sozlamalar → Moliya). Sozlamalar → Ruxsatlar'da boshliq belgilaydi:

- admin va kassir **hisobotni** ko'ra oladimi, **kirim-chiqimni** ko'ra oladimi (standart: admin — ikkalasi, kassir — faqat kirim-chiqim);
- **moliya paroli**: yoqilsa, Moliya bo'limini ochish uchun parol so'raladi (boshliqdan ham). 15 daqiqa ishlatilmasa yana yopiladi.
  Kassa (smena ochish/yopish, to'lov) parolsiz ishlayveradi.

- **Hisobot** (soddalashtirilgan): bugun, kecha, hafta, oy, o'tgan oy yoki sana tanlash. Kirim, chiqim, foyda, mehmonlar,
  kunlik/soatlik grafik, to'lov turlari, xarajatlar kategoriyalar bo'yicha, eng ko'p sotilgan taomlar, ofitsantlar. Excel'ga yuklash.
- **Kirim-chiqim**: xarajatlar (mahsulot, go'sht, ish haqi, ijara, kommunal, gaz...) va qo'shimcha kirimlar; kategoriyalar sozlamalarda o'zgartiriladi.
- **Kassa**: kassirning asosiy ekrani — xonalar va olib ketish cheklari (hisob so'ralganlari binafsha rangda).
- **Kassa smenasi (Z-hisobot)**: smena ochishda kassadagi naqd, yopishda sanalgan naqd kiritiladi — tizim kutilgan summa bilan farqni ko'rsatadi.

## Xizmat haqi

Sozlamalar → Muassasa: **foizda** (masalan 10% taomlar summasidan) yoki **odam boshiga** (masalan 5 000 so'm × 10 kishi = 50 000).
Faqat shu yerda o'zgaradi — to'lov oynasida o'zgartirib bo'lmaydi. Chekda "Xizmat haqi (10 kishi × 5 000)" va
**"10 kishi — har biriga: 25 000"** qatori chiqadi. Olib ketishda xizmat haqi olinmaydi.

## Zaxira nusxa — ma'lumot yo'qolmasligi uchun

Ma'lumotlar to'rt joyda saqlanadi:

1. **Serverda har kuni** avtomatik (server o'zi qiladi, oxirgi 30 kun): `data/backups/<sana>/`.
   `BACKUP_COPY_DIR=/mnt/ikkinchi-disk` — har nusxa shu papkaga ham ko'chiriladi; `BACKUP_HOOK="rclone copy data/backups remote:flowi"` —
   har nusxadan keyin shu buyruq bajariladi (bulutga yoki boshqa serverga yuborish uchun).
2. **Kassa kompyuteridagi papkada** (Sozlamalar → Zaxira → Papkani tanlash; Chrome yoki Edge): "FLOWI zaxira" papkasi o'zi ochiladi
   va har 3 soatda butun baza bitta `.db` fayl bo'lib yoziladi (oxirgi 60 ta saqlanadi). Brauzer qayta ochilganda ish stolida
   "Zaxira papkasiga ruxsat bering" tugmasi chiqishi mumkin — bir bosish kifoya.
3. **Kassa brauzerida** har bir yopilgan chek (internet uzilsa ham ko'rish va Excel'ga yuklash mumkin). Smena yopilganda kunlik cheklar Excel bo'lib tushadi.
4. **Qo'lda**: Sozlamalar → Zaxira → "Zaxirani yuklab olish".

**Tiklash**: boshliq Sozlamalar → Zaxira → "Zaxiradan tiklash" da `.db` faylni tanlaydi (yoki papkadagi nusxalardan biri) —
hamma narsa (menyu, xonalar, xodimlar, cheklar, kirim-chiqim) o'sha holatga qaytadi. Sayt egasi buni platformadan ham qila oladi.
Tiklashdan oldin hozirgi holat har doim `data/backups/pre-restore/` ga saqlanadi, shuning uchun tiklashni ham orqaga qaytarish mumkin.

## Cheklar tarixi

Ochilganda **bugungi** yopilgan cheklar ko'rinadi — yangi kun boshlanishi bilan ro'yxat bo'sh bo'ladi.
Filtrlar: **Kecha, 1 hafta, 1 oy, Hammasi** (birinchi chekdan beri hammasi saqlanadi) va **Sana tanlash**.
Bekor qilingan cheklar alohida, chek raqami / xona / ofitsant bo'yicha qidiruv, har bir chekni ko'rish va qayta chop etish.
**⬇ Excel'ga yuklash** — tanlangan davrdagi barcha cheklar taomlari bilan birga CSV faylga (Excel'da ochiladi).

## Ish haqi (faqat boshliq)

**Ish haqi** bo'limida har bir xodim uchun:

- **Maosh**: *oylik* (har kuni bir kunlik ulushi hisoblanadi), *kunlik* (faqat kelgan kunlar uchun) yoki *faqat foiz*.
  Ofitsantga qo'shimcha **savdodan foiz** (uning yopilgan cheklari summasidan) berish mumkin. Maosh o'zgarsa, eski kunlar eski stavkada qoladi.
- **Davomat**: xodim o'sha kuni tizimga kirsa — avtomatik "keldi" belgilanadi. Boshliq jadvaldagi katakni bosib tuzatadi.
- **Bonus** va **jarima** (jarima sababi majburiy).
- **To'lash**: berilgan pul kassada "Ish haqi" xarajati bo'lib yoziladi va hisobotga tushadi.
- **Umumiy holat**: hisoblangan + bonus − jarima − berilgan.
  Musbat bo'lsa — *choyxona qarzi* (xodimga berish kerak), manfiy bo'lsa — *avans* (xodim ortiqcha olgan).
- Xodim o'z ish haqini **Sozlamalar → Mening ish haqim** da ko'radi va to'lov/bonus/jarima yozilganda xabar oladi.
- Ishdan ketgan xodimni "Faol" emas qilsangiz, oyligi shu kundan hisoblanmaydi, qarzi esa ko'rinib turadi.

## Chek printerlari

- 58 mm yoki 80 mm termo-printerlar (Xprinter, Rongta, Sunmi va h.k.) Windows'ga **printer sifatida o'rnatilsa** ishlaydi
  (printer bilan kelgan drayverni o'rnating va uni **asosiy printer** qiling). Kenglik: Sozlamalar → Muassasa → Chek printeri kengligi.
- **Mijoz cheki**: to'lov oynasida "Chekni chop etish" yoki kassadagi 🖨 tugmasi.
- **Oshxona cheki**: Oshxona sahifasida **🖨 Avtomatik chop etish** ni yoqing — har yangi buyurtma oshxona printeriga chiqadi
  (xona, ofitsant, taom, soni, izoh; narxsiz). Har bir taomni 🖨 tugmasi bilan qayta chop etish mumkin.
- **Oynasiz chop etish**: Chrome yorlig'ida o'ng tugma → Xususiyatlar → "Объект/Target" oxiriga ` --kiosk-printing` qo'shing.
  Shunda chek dialog oynasisiz darhol chiqadi.
- Hozircha chek **fiskal emas** (soliq kassasi o'rnini bosmaydi).

## Qo'shimcha zamonaviy imkoniyatlar

- ⚡ Real vaqt rejimida yangilanish (sahifani yangilash shart emas)
- 🔊 Ovozli xabarlar (ayol ovozi, tezlik va ovozni tanlash), tovush signali, telefon tebranishi, tizim bildirishnomalari
- ⛔ Stop-list va **qoldiq hisobi**: masalan "Manti — 20 porsiya" deb kiritilsa, tugaganda avtomatik yopiladi
- ⏱ Taxminiy tayyor bo'lish vaqti oshxona yuklamasi va oshpazlar soniga qarab hisoblanadi; kechikkan taomlar qizil rangda
- 📅 Banket bronlari: mijoz, telefon, mehmonlar soni, avans (avans kirim sifatida yoziladi), ustma-ust bron tekshiruvi
- ↔ Chekni boshqa xonaga ko'chirish
- 🖨 58/80 mm termo-printer uchun mijoz va oshxona cheklari
- 🕵️ Amallar tarixi: chegirma, bekor qilish, narx o'zgarishi kim tomonidan qachon qilinganini nazorat qilish
- 🌐 Uch til: o'zbekcha, ruscha, inglizcha (ovozli xabarlar ham tanlangan tilda)
- 📲 Ish stoli / telefonga ilova sifatida o'rnatish: Sozlamalar → Mening sozlamalarim → "Ilovani o'rnatish"
- ☀️ Yorug' mavzu asosiy, qorong'i — sozlamalarda

## Internetga chiqarish (hamma joydan kirish)

Tavsiya: kichik VPS server (1 CPU, 1 GB RAM, Ubuntu 24.04 — oyiga ~5$) + domen (masalan `choyxona.uz`).

1. Domenning **A yozuvini** server IP manziliga yo'naltiring.
2. Serverda:
   ```bash
   # Node.js 22 va Caddy (HTTPS uchun)
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
   sudo apt install -y nodejs caddy git
   # Dastur
   # Dastur o'z foydalanuvchisi nomidan ishlaydi; papka bo'sh bo'lishi kerak (git clone uchun)
   sudo useradd -r -M -d /opt/choyxona -s /usr/sbin/nologin choyxona
   sudo mkdir -p /opt/choyxona && sudo chown choyxona:choyxona /opt/choyxona
   sudo -u choyxona git clone -b claude/restaurant-management-system-0i70j3 \
     https://github.com/albusdumbledooree/albusdumbledooree.git /opt/choyxona
   # Xizmat (avtomatik ishga tushadi, qulasa qayta yonadi)
   sudo cp /opt/choyxona/deploy/choyxona.service /etc/systemd/system/
   # Platformaning maxfiy manzili (o'zingiz o'ylab topgan so'z)
   sudo mkdir -p /etc/systemd/system/choyxona.service.d
   printf '[Service]\nEnvironment=PLATFORM_PATH=/maxfiy-soz\n' | sudo tee /etc/systemd/system/choyxona.service.d/manzil.conf
   sudo systemctl daemon-reload && sudo systemctl enable --now choyxona
   # HTTPS: deploy/Caddyfile ichida domeningizni yozing
   sudo cp /opt/choyxona/deploy/Caddyfile /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```
3. `https://domeningiz/planeta` ni oching, `superadmin` / `super123` bilan kiring va **darhol parolni o'zgartiring**.
   Xizmat `SEED_DEMO=0` bilan ishlaydi — sinov choyxonasi yaratilmaydi. Keyin "Yangi choyxona" bilan mijozlarni qo'shing.
4. Kunlik zaxira nusxani server o'zi oladi (`data/backups/`, oxirgi 30 kun). Boshqa joyga ham nusxa uchun
   xizmat faylida `BACKUP_COPY_DIR` yoki `BACKUP_HOOK` ni yozing (yuqoridagi "Zaxira nusxa" bo'limi).
5. **Yangilash — bitta buyruq**: `sudo /opt/choyxona/deploy/update.sh`.
   U zaxira oladi → yangi versiyani yuklaydi → testlarni o'tkazadi → xizmatni qayta yoqadi → sayt javob berayotganini tekshiradi.
   Biror qadam xato bo'lsa, o'zi eski versiyaga qaytadi. Ochiq kompyuter va telefonlar yangi versiyani o'zi yuklaydi
   (yuborilmagan buyurtma yoki ochiq oyna bo'lsa — kutib turadi, hech narsa yo'qolmaydi).

**Faqat choyxona ichida ishlatish** (internetsiz): bitta kompyuterda `npm start` (yoki `start.bat`), so'ng `/planeta` da choyxona yarating, xodimlar shu Wi-Fi orqali
`http://<kompyuter-IP>:3000` ga kiradi. Bu holda ega uydan hisobotni ko'ra olmaydi va bildirishnomalar (HTTPS talab qiladi) ishlamaydi.

Xavfsizlik: login 8 marta xato kiritilsa 10 daqiqaga bloklanadi (platformada 5 marta — 15 daqiqa); parollar scrypt bilan shifrlangan; ishdan ketgan xodimni
Xodimlar bo'limida "Faol" belgisini olib tashlab o'chiring — u darhol tizimdan chiqariladi.

## Texnik tuzilma

```
server/
  index.js     HTTP server, statik fayllar, so'rovni kerakli choyxonaga yo'naltirish
  platform.js  Platforma: choyxonalar ro'yxati, sayt egasi, har choyxona uchun alohida baza
  api.js       Bitta choyxona ichidagi biznes-mantiq va huquqlar
  payroll.js   Ish haqi: stavkalar tarixi, davomat, bonus, jarima, to'lovlar
  db.js        Choyxona bazasi sxemasi va boshlang'ich ma'lumotlar
  events.js    Server-Sent Events (jonli yangilanishlar, har choyxona alohida)
  util.js      Parol xeshlash (scrypt), kiritishni tekshirish
  backup.js    Zaxira: kunlik nusxa, bitta biznes nusxasi, tiklash uchun ro'yxat
deploy/update.sh  Bitta buyruq bilan yangilash (zaxira, test, avtomatik orqaga qaytish)
public/
  js/i18n.js, i18n-dict.js   Tarjima (o'zbek manba, rus/ingliz lug'at)
  js/icons.js                Lucide ikonkalari (ISC litsenziya), internetsiz ishlashi uchun ichiga joylangan
  js/core.js                 API, jonli xabarlar, ovoz, chop etish, ish stoli foni, yangi versiya
  js/folder.js               Kompyuterdagi papkaga avtomatik zaxira, zaxiradan tiklash
  js/lock.js                 Qurilmani ulash, ish stoli (xodimlar ro'yxati, PIN)
  js/order.js                Xonalar (bo'limlar), olib ketish, buyurtma va chek oynasi, to'lov
  js/pos.js                  Sotuv: do'kon va fast food kassasi, shtrix-kod
  bg/                        Ish stoli uchun 16 ta ichki rasm (SVG)
  brand/                     FLOWI logotipi (SVG va PNG)
  js/kitchen.js              Oshxona ekrani, stop-list
  js/manage.js               Cheklar tarixi, hisobot, kirim-chiqim, ish haqi, bronlar, menyu, xodimlar, sozlamalar
  js/app.js                  Menyu, yo'naltirish, avtomatik qulf
test/        API integratsion testlari (node:test)
```
