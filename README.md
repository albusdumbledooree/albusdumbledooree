# Choyxona Pro — restoran va choyxonalar uchun boshqaruv tizimi

Buyurtma qabul qilish, oshxona ekrani, kassa, kirim-chiqim va kunlik / haftalik / oylik hisobotlar — bitta tizimda.
Telefon, planshet va kompyuterda brauzer orqali ishlaydi (telefonga ilova sifatida o'rnatish mumkin — PWA).

**Bitta sayt — ko'p choyxona.** Sayt egasi `/platform` sahifasida choyxonalarni qo'shadi va har biriga boshliq login-parolini beradi.
Boshliq o'z choyxonasiga xodimlarni o'zi qo'shadi. Har bir choyxonaning ma'lumotlari alohida faylda saqlanadi va boshqalariga ko'rinmaydi.

## Platforma (sayt egasi uchun)

1. `https://sayt/platform` ni oching. Birinchi kirish: `superadmin` / `super123` → **darhol parolni o'zgartiring** (🔒 Parol).
2. **➕ Yangi choyxona**: nomi, kodi (masalan `navruz`), boshliq ismi, login va parol, to'langan muddat, oylik narx.
   "Namuna menyu va xonalar" belgilansa, choyxona tayyor menyu bilan ochiladi.
3. Chiqqan matnni (havola + kod + login + parol) **Nusxa olish** bilan Telegram orqali boshliqqa yuboring.
4. Boshliq `https://sayt/c/navruz` havolasini ochadi (kod avtomatik to'ladi), kiradi va **Xodimlar** bo'limida
   admin, kassir, ofitsant va oshpazlarni qo'shadi. Xodimlar ham shu havola orqali kiradi.

Platformadagi boshqa amallar:

| Tugma | Vazifasi |
|---|---|
| **+1 oy** | To'langan muddatni bir oyga uzaytirish (to'lov qabul qilinganda) |
| 🔑 | Boshliq parolini unutsa — yangi parol berish |
| ⛔ **Bloklash** | To'lov qilinmasa: barcha xodimlar darhol chiqariladi, kirish yopiladi. Ma'lumotlar o'chmaydi, ✅ bilan qayta ochiladi |
| 🔗 | Choyxona kirish havolasini nusxalash |

Har bir choyxona bo'yicha xodimlar, xonalar, oxirgi 30 kundagi cheklar va savdo, oxirgi faollik ko'rinadi.
Muddat 5 kundan kam qolganda boshliqning ekranida eslatma chiqadi.

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
| `PLATFORM_USER`, `PLATFORM_PASSWORD` | Birinchi ishga tushishda platforma administratori (standart `superadmin` / `super123`) |
| `SEED_DEMO=0` | `demo` kodli sinov choyxonasi yaratilmasin |
| `TRUST_PROXY=1` | Caddy/Nginx orqasida ishlaganda mijozning haqiqiy IP manzilini olish |

### Sinov hisoblari

Choyxona kodi: **`demo`** (havola: `http://localhost:3000/c/demo`).

| Lavozim | Login | Parol |
|---|---|---|
| Boshliq | `ega` | `ega123` |
| Admin | `admin` | `admin123` |
| Kassir | `kassir` | `kassir123` |
| Ofitsant | `jasur`, `bobur` | `1234` |
| Oshpaz | `oshpaz` | `1234` |

Platforma: `http://localhost:3000/platform` — `superadmin` / `super123`.

> ⚠️ Haqiqiy ishga tushirishda `SEED_DEMO=0` ishlating va platforma parolini o'zgartiring.

## Buyurtma jarayoni

1. **Ofitsant** tizimga kiradi — o'ziga biriktirilgan banket xonalari raqamlari rangli kartalar ko'rinishida chiqadi
   (yashil — bo'sh, sariq — band, miltillovchi — taom tayyor, binafsha — hisob so'ralgan, ko'k — bron).
2. Xonani bosadi → menyudan taom tanlaydi (har bir taomda **taxminiy tayyor bo'lish vaqti** — oshxona navbatini hisobga olgan holda) → izoh yozishi mumkin → **"Oshxonaga yuborish"**.
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
| Ish haqi, bonus, jarima, davomat | ✅ | | | | |
| O'z ish haqini ko'rish | | ✅ | ✅ | ✅ | ✅ |

Ofitsant faqat oshpaz hali qabul qilmagan taomni bekor qila oladi. Barcha bekor qilishlar sababi bilan yoziladi.

## Moliya va hisobotlar

- **Hisobot**: bugun, kecha, shu hafta, oxirgi 7 kun, shu oy, o'tgan oy yoki ixtiyoriy davr.
  Savdo, cheklar soni, o'rtacha chek, mehmonlar, xizmat haqi, chegirmalar, to'lov turlari, boshqa kirim, xarajatlar kategoriyalar bo'yicha,
  **sof foyda**, taomlar tannarxi va marja, eng ko'p sotilgan taomlar, ofitsantlar va xonalar bo'yicha savdo, oshxona tezligi,
  bekor qilingan taomlar, kunlik/soatlik grafik. **Excel (CSV)** ga yuklab olish va chop etish.
- **Kirim-chiqim**: xarajatlar (mahsulot, go'sht, ish haqi, ijara, kommunal, gaz...) va qo'shimcha kirimlar; kategoriyalar sozlamalarda o'zgartiriladi.
- **Kassa smenasi (Z-hisobot)**: smena ochishda kassadagi naqd, yopishda sanalgan naqd kiritiladi — tizim kutilgan summa bilan farqni ko'rsatadi.

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
- 🌙 Qorong'i mavzu, telefon uchun moslashgan dizayn, PWA (bosh ekranga o'rnatish)

## Internetga chiqarish (hamma joydan kirish)

Tavsiya: kichik VPS server (1 CPU, 1 GB RAM, Ubuntu 24.04 — oyiga ~5$) + domen (masalan `choyxona.uz`).

1. Domenning **A yozuvini** server IP manziliga yo'naltiring.
2. Serverda:
   ```bash
   # Node.js 22 va Caddy (HTTPS uchun)
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo bash -
   sudo apt install -y nodejs caddy git
   # Dastur
   sudo useradd -r -m -d /opt/choyxona choyxona
   sudo -u choyxona git clone -b claude/restaurant-management-system-0i70j3 \
     https://github.com/albusdumbledooree/albusdumbledooree.git /opt/choyxona
   # Xizmat (avtomatik ishga tushadi, qulasa qayta yonadi)
   sudo cp /opt/choyxona/deploy/choyxona.service /etc/systemd/system/
   sudo systemctl enable --now choyxona
   # HTTPS: deploy/Caddyfile ichida domeningizni yozing
   sudo cp /opt/choyxona/deploy/Caddyfile /etc/caddy/Caddyfile
   sudo systemctl reload caddy
   ```
3. `https://domeningiz/platform` ni oching, `superadmin` / `super123` bilan kiring va **darhol parolni o'zgartiring**.
   Xizmat `SEED_DEMO=0` bilan ishlaydi — sinov choyxonasi yaratilmaydi. Keyin "Yangi choyxona" bilan mijozlarni qo'shing.
4. Kunlik zaxira nusxa — platforma va barcha choyxonalar bazasi (har kecha 03:00, oxirgi 30 kun saqlanadi):
   ```bash
   echo '0 3 * * * cd /opt/choyxona && node --no-warnings scripts/backup.js' | sudo -u choyxona crontab -
   ```
   Nusxalar `/opt/choyxona/data/backups/` da. Vaqti-vaqti bilan boshqa joyga ham ko'chirib qo'ying.
5. Yangilash: `cd /opt/choyxona && sudo -u choyxona git pull && sudo systemctl restart choyxona`.

**Faqat choyxona ichida ishlatish** (internetsiz): bitta kompyuterda `npm start` (yoki `start.bat`), so'ng `/platform` da choyxona yarating, xodimlar shu Wi-Fi orqali
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
public/      Brauzer ilovasi (HTML/CSS/JS, kutubxonasiz)
test/        API integratsion testlari (node:test)
```
