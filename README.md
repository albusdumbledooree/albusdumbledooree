# Choyxona Pro — restoran va choyxonalar uchun boshqaruv tizimi

Buyurtma qabul qilish, oshxona ekrani, kassa, kirim-chiqim va kunlik / haftalik / oylik hisobotlar — bitta tizimda.
Telefon, planshet va kompyuterda brauzer orqali ishlaydi (telefonga ilova sifatida o'rnatish mumkin — PWA).

## Ishga tushirish

Faqat **Node.js 22.5+** kerak — qo'shimcha kutubxona o'rnatish shart emas (ma'lumotlar bazasi: o'rnatilgan SQLite).

```bash
npm start            # http://localhost:3000
PORT=8080 npm start  # boshqa port
npm test             # avtomatik testlar
```

Restorandagi barcha qurilmalar bitta Wi-Fi tarmoqda bo'lsa, ofitsantlar telefonda `http://<kompyuter-IP>:3000` manzilini ochadi.
Ma'lumotlar `data/choyxona.db` faylida saqlanadi (zaxira nusxa uchun shu faylni nusxalang).

| Muhit o'zgaruvchisi | Ma'nosi |
|---|---|
| `PORT` | Port (standart 3000) |
| `DB_FILE` | Baza fayli yo'li |
| `TZ` | Vaqt mintaqasi (standart `Asia/Tashkent`) |
| `OWNER_PASSWORD` | Birinchi ishga tushishda ega paroli (standart `ega123`) |
| `SEED_DEMO=0` | Sinov xodimlari, xonalar va menyusiz bo'sh baza |

### Sinov hisoblari

| Lavozim | Login | Parol |
|---|---|---|
| Ega | `ega` | `ega123` |
| Admin | `admin` | `admin123` |
| Kassir | `kassir` | `kassir123` |
| Ofitsant | `jasur`, `bobur` | `1234` |
| Oshpaz | `oshpaz` | `1234` |

> ⚠️ Haqiqiy ishga tushirishdan oldin parollarni o'zgartiring yoki `SEED_DEMO=0` bilan bo'sh baza yarating.

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

| Imkoniyat | Ega | Admin | Kassir | Ofitsant | Oshpaz |
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

Ofitsant faqat oshpaz hali qabul qilmagan taomni bekor qila oladi. Barcha bekor qilishlar sababi bilan yoziladi.

## Moliya va hisobotlar

- **Hisobot**: bugun, kecha, shu hafta, oxirgi 7 kun, shu oy, o'tgan oy yoki ixtiyoriy davr.
  Savdo, cheklar soni, o'rtacha chek, mehmonlar, xizmat haqi, chegirmalar, to'lov turlari, boshqa kirim, xarajatlar kategoriyalar bo'yicha,
  **sof foyda**, taomlar tannarxi va marja, eng ko'p sotilgan taomlar, ofitsantlar va xonalar bo'yicha savdo, oshxona tezligi,
  bekor qilingan taomlar, kunlik/soatlik grafik. **Excel (CSV)** ga yuklab olish va chop etish.
- **Kirim-chiqim**: xarajatlar (mahsulot, go'sht, ish haqi, ijara, kommunal, gaz...) va qo'shimcha kirimlar; kategoriyalar sozlamalarda o'zgartiriladi.
- **Kassa smenasi (Z-hisobot)**: smena ochishda kassadagi naqd, yopishda sanalgan naqd kiritiladi — tizim kutilgan summa bilan farqni ko'rsatadi.

## Qo'shimcha zamonaviy imkoniyatlar

- ⚡ Real vaqt rejimida yangilanish (sahifani yangilash shart emas)
- 🔊 Ovozli xabarlar (ayol ovozi, tezlik va ovozni tanlash), tovush signali, telefon tebranishi, tizim bildirishnomalari
- ⛔ Stop-list va **qoldiq hisobi**: masalan "Manti — 20 porsiya" deb kiritilsa, tugaganda avtomatik yopiladi
- ⏱ Taxminiy tayyor bo'lish vaqti oshxona yuklamasi va oshpazlar soniga qarab hisoblanadi; kechikkan taomlar qizil rangda
- 📅 Banket bronlari: mijoz, telefon, mehmonlar soni, avans (avans kirim sifatida yoziladi), ustma-ust bron tekshiruvi
- ↔ Chekni boshqa xonaga ko'chirish
- 🖨 80 mm termo-printer uchun chek
- 🕵️ Amallar tarixi: chegirma, bekor qilish, narx o'zgarishi kim tomonidan qachon qilinganini nazorat qilish
- 🌙 Qorong'i mavzu, telefon uchun moslashgan dizayn, PWA (bosh ekranga o'rnatish)

## Texnik tuzilma

```
server/
  index.js   HTTP server, statik fayllar, marshrutlash
  api.js     Barcha biznes-mantiq va huquqlar
  db.js      SQLite sxemasi va boshlang'ich ma'lumotlar
  events.js  Server-Sent Events (jonli yangilanishlar)
  util.js    Parol xeshlash (scrypt), kiritishni tekshirish
public/      Brauzer ilovasi (HTML/CSS/JS, kutubxonasiz)
test/        API integratsion testlari (node:test)
```
