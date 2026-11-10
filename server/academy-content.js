'use strict';
/*
 * FLOWI Akademiya — the lessons every business gets until the platform owner edits them.
 * A module holds lessons; a lesson is a few short cards (a picture, a heading, 2–3 sentences, "do" and "don't")
 * and three questions. The final test draws its questions from all the lessons.
 * c = the index of the right answer; why = the short reason shown after answering.
 */
module.exports = {
  version: 1,
  modules: [
    {
      id: 'greet', icon: '👋', color: '#e8f8ef', title: 'Kutib olish va kuzatish', free: true,
      lessons: [
        {
          id: 'greet-1', title: 'Birinchi 30 soniya',
          cards: [
            { e: '🚪', h: 'Mehmonni eshikda kutib oling', t: "Mehmon kirishi bilan uni ko'ring va 10 soniya ichida yoniga boring. Mehmon o'zi joy qidirib yurmasligi kerak.", ok: "Kulib, ko'zga qarab salom bering", no: "Telefonga qarab o'tirib qolmang" },
            { e: '🙂', h: 'Salom — xizmatning boshlanishi', t: "\"Assalomu alaykum, xush kelibsiz!\" — iliq ovozda, shoshilmasdan. Kattalarga qo'lni ko'krakka qo'yib salom berish odobdan.", ok: "Mehmonlar soni va bron bor-yo'qligini so'rang", no: "\"Nima kerak?\" deb so'ramang" },
            { e: '⏱', h: 'Band bo\'lsangiz ham e\'tibor bering', t: "Boshqa stolda bo'lsangiz, mehmonga bosh irg'ab yoki \"Hozir kelaman\" deb ishora qiling. Kutish — e'tiborsizlikdan ko'ra yaxshiroq.", ok: "Bir daqiqada qaytib keling", no: "Ko'rmaganga olmang" },
          ],
          quiz: [
            { q: "Mehmon eshikdan kirdi. Qancha vaqt ichida yoniga borish kerak?", a: ["5 daqiqa ichida", "10 soniya ichida", "Mehmon chaqirganda", "Stol bo'shaganda"], c: 1, why: "Birinchi taassurot birinchi soniyalarda paydo bo'ladi. Mehmon o'zini kutilgan his qilishi kerak." },
            { q: "Qaysi salom to'g'ri?", a: ["\"Nima kerak?\"", "\"Joy yo'q\"", "\"Assalomu alaykum, xush kelibsiz!\"", "\"Ha, kiring\""], c: 2, why: "Iliq va hurmatli salom mehmonga \"sizni kutgan edik\" degan ma'noni beradi." },
            { q: "Siz boshqa stolga xizmat qilyapsiz, yangi mehmon kirdi. Nima qilasiz?", a: ["Ko'rmaganga olaman", "Ishora qilib, \"Hozir kelaman\" deyman", "Ishni tashlab ketaman", "Boshqa ofitsantni so'kaman"], c: 1, why: "Mehmonga uni ko'rganingizni bildirish kifoya — u xotirjam kutadi." },
          ],
        },
        {
          id: 'greet-2', title: 'Joyga o\'tqazish',
          cards: [
            { e: '🪑', h: 'Mehmonni joygacha kuzatib boring', t: "Mehmondan bir qadam oldinda, sekin yuring. Xonani yoki stolni ko'rsatib, \"Marhamat\" deng.", ok: "Kattalarga to'rdan joy taklif qiling", no: "Uzoqdan qo'l bilan ko'rsatib qo'ymang" },
            { e: '👨‍👩‍👧', h: 'Kim bilan kelganiga qarang', t: "Bolali oilaga — tinchroq va xavfsiz joy, ko'pchilikka — katta xona, juftlikka — sokin burchak. Iloji bo'lsa mehmondan qaysi joy qulayligini so'rang.", ok: "Bolalar uchun stulcha taklif qiling", no: "Bo'sh joy bor bo'lsa ham eshik oldiga o'tqazmang" },
            { e: '📖', h: 'Menyu va birinchi taklif', t: "Mehmon o'tirgach, menyuni ochib bering va choy taklif qiling: \"Choy olib kelaymi — ko'k choymi, qora choymi?\"", ok: "Bugungi maxsus taomni aytib qo'ying", no: "Menyuni stolga tashlab ketmang" },
          ],
          quiz: [
            { q: "Mehmonni joyga qanday kuzatasiz?", a: ["Uzoqdan qo'l bilan ko'rsataman", "Bir qadam oldinda yurib, joygacha olib boraman", "O'zi topadi", "Orqasidan yuraman"], c: 1, why: "Kuzatib borish — hurmat belgisi va mehmon adashmaydi." },
            { q: "Kichik bolali oilaga qaysi joy mos?", a: ["Eshik oldi", "Oshxona yoni", "Tinchroq va xavfsiz joy", "Tamaki chekiladigan joy"], c: 2, why: "Bolali oilaga xotirjamlik va xavfsizlik muhim." },
            { q: "Mehmon o'tirdi. Birinchi nima qilasiz?", a: ["Hisobni olib kelaman", "Menyuni berib, choy taklif qilaman", "Ketib qolaman", "Telefonni tekshiraman"], c: 1, why: "Choy — choyxonada mehmondo'stlikning birinchi belgisi." },
          ],
        },
        {
          id: 'greet-3', title: 'Bron va kutayotgan mehmon',
          cards: [
            { e: '📅', h: 'Bron bilan kelgan mehmon', t: "\"Kimning nomiga bron qilingan edi?\" deb so'rang, ro'yxatdan topib, xonani tayyor holda ko'rsating.", ok: "Xona oldindan tozalangan va tayyor bo'lsin", no: "Bron qilingan xonaga boshqalarni o'tqazmang" },
            { e: '⌛', h: 'Joy yo\'q bo\'lsa', t: "To'g'ridan-to'g'ri \"joy yo'q\" demang. Taxminiy kutish vaqtini ayting va kutish joyi bo'lsa choy taklif qiling.", ok: "\"Taxminan 15 daqiqada xona bo'shaydi\"", no: "Mehmonni eshik oldida tik qoldirmang" },
            { e: '📞', h: 'Telefondagi bron', t: "Ism, telefon, sana, vaqt va mehmonlar sonini aniq yozing va qaytarib o'qing: \"Shanba, soat 19:00, 8 kishi — to'g'rimi?\"", ok: "Bronni darhol dasturga kiriting", no: "Qog'ozga yozib, yo'qotib qo'ymang" },
          ],
          quiz: [
            { q: "Bo'sh joy yo'q. Nima deysiz?", a: ["\"Joy yo'q, keting\"", "Taxminiy kutish vaqtini aytaman va choy taklif qilaman", "Hech narsa demayman", "Bron qilingan xonaga o'tqazaman"], c: 1, why: "Aniq vaqt va e'tibor mehmonni ushlab qoladi." },
            { q: "Telefonda bron olayotganda nimani qaytarib o'qiysiz?", a: ["Faqat ismni", "Sana, vaqt va mehmonlar sonini", "Hech narsani", "Menyuni"], c: 1, why: "Qaytarib o'qish xatoni oldini oladi." },
            { q: "Bron qilingan xona bo'sh turibdi, boshqa mehmon keldi. To'g'ri yo'l?", a: ["Bron qilingan xonaga o'tqazaman", "Bron vaqti va boshliq bilan aniqlashtiraman", "Mehmonni qaytaraman", "Ikkalasini birga o'tqazaman"], c: 1, why: "Bronni buzish — boshqa mehmonga va'dani buzish. Avval aniqlashtiring." },
          ],
        },
        {
          id: 'greet-4', title: 'Kuzatib qolish',
          cards: [
            { e: '🙏', h: 'Xayrlashuv ham xizmat', t: "Mehmon turganda yoniga boring: \"Rahmat, yana kelib turing!\" Kattalarni eshikkacha kuzatib qo'ying.", ok: "Unutilgan narsa yo'qligini tekshiring", no: "Hisob to'langach, mehmonni unutib qo'ymang" },
            { e: '💬', h: 'Fikrini so\'rang', t: "\"Hammasi yoqdimi?\" degan oddiy savol kamchilikni bilish va mehmonni qaytarish imkoniyati.", ok: "Shikoyat bo'lsa — rahmat aytib, boshliqqa yetkazing", no: "Bahslashmang" },
            { e: '🔁', h: 'Doimiy mehmon', t: "Doimiy mehmonning ismini va sevimli taomini eslab qoling. \"Sizga har doimgidek ko'k choymi?\" — bu mehmonni yana olib keladi.", ok: "Ismini aytib murojaat qiling", no: "Har safar notanishdek muomala qilmang" },
          ],
          quiz: [
            { q: "Mehmon hisobni to'lab turdi. Nima qilasiz?", a: ["Stolni yig'ishga shoshilaman", "Rahmat aytib, xayrlashaman", "Hech narsa", "Choychaqa so'rayman"], c: 1, why: "Oxirgi taassurot ham birinchisi kabi esda qoladi." },
            { q: "Mehmonning \"Taom tuzli edi\" degan fikriga to'g'ri javob?", a: ["\"Yo'q, tuzli emas\"", "\"Rahmat, aytganingiz uchun — oshpazga yetkazaman\"", "Indamayman", "\"Boshqalar maqtaydi\""], c: 1, why: "Fikr — sovg'a. Bahs mehmonni yo'qotadi." },
            { q: "Doimiy mehmonni qaytarishning eng oson yo'li?", a: ["Chegirma so'rash", "Ismini va sevimli taomini eslab qolish", "Ko'proq taom sotish", "Tezroq ketkazish"], c: 1, why: "Odamlar o'zlarini taniydigan joyga qaytadi." },
          ],
        },
      ],
    },
    {
      id: 'talk', icon: '💬', color: '#e8f0ff', title: 'Muloqot madaniyati', free: true,
      lessons: [
        {
          id: 'talk-1', title: 'Gapirish odobi',
          cards: [
            { e: '🗣', h: '"Siz" deb murojaat qiling', t: "Yoshidan qat'i nazar har bir mehmonga \"Siz\" deb murojaat qiling. \"Aka\", \"opa\", \"ota\", \"ona\" — hurmat bilan.", ok: "\"Marhamat\", \"Iltimos\", \"Rahmat\" so'zlari", no: "\"Sen\", \"ey\", \"bratan\" demang" },
            { e: '🔉', h: 'Ovoz va ohang', t: "Baland gapirmang, lekin aniq gapiring. Mehmon so'raganini ikki marta so'ratmang. Jilmayish ovozga ham o'tadi.", ok: "Mehmonga qarab gapiring", no: "Xonaning narigi chetidan baqirmang" },
            { e: '🤐', h: 'Ortiqcha gap yo\'q', t: "Mehmonlar suhbatiga aralashmang, shaxsiy gaplarni eshitmagandek bo'ling. Ish joyida hamkasblar bilan baland ovozda kulishmang.", ok: "Kerak bo'lsa: \"Kechirasiz, xalaqit beraymi?\"", no: "Mehmonlar haqida boshqalarga gapirmang" },
          ],
          quiz: [
            { q: "Yosh yigit mehmonga qanday murojaat qilasiz?", a: ["\"Sen\"", "\"Bratan\"", "\"Siz\"", "\"Ey\""], c: 2, why: "Hurmat hammaga birdek — yoshidan qat'i nazar." },
            { q: "Mehmonlar suhbatlashib o'tirishibdi, sizga savol berish kerak. Nima deysiz?", a: ["Gapini bo'lib, baland so'rayman", "\"Kechirasiz, xalaqit beraymi?\"", "Kutaman, ketib qolishadi", "Hamkasbimni yuboraman"], c: 1, why: "Odobli kirish mehmonni bezovta qilmaydi." },
            { q: "Qaysi xatti-harakat noto'g'ri?", a: ["Mehmonga qarab gapirish", "Aniq gapirish", "Xonaning narigi chetidan baqirish", "\"Rahmat\" deyish"], c: 2, why: "Baqirish butun xonani bezovta qiladi." },
          ],
        },
        {
          id: 'talk-2', title: 'Tashqi ko\'rinish',
          cards: [
            { e: '👔', h: 'Toza forma — birinchi reklama', t: "Forma toza, dazmollangan bo'lsin. Oyoq kiyim toza. Mehmon sizni ko'rib, oshxona tozaligini tasavvur qiladi.", ok: "Har smenaga toza kiyim", no: "Dog'li fartuk bilan chiqmang" },
            { e: '🧼', h: 'Shaxsiy gigiena', t: "Qo'llar toza, tirnoqlar kalta. Soch tartibli. O'tkir atir sepmang — taom hidiga xalaqit beradi.", ok: "Har ishdan keyin qo'l yuvish", no: "Kuchli atir va sigaret hidi" },
            { e: '🧍', h: 'Qaddi-qomat', t: "Tik turing, qo'lni cho'ntakka solmang, devorga suyanmang. Qo'l ko'ksida bog'liq turish ham yopiq ko'rinadi.", ok: "Mehmonlar zaliga e'tibor bilan qarab turing", no: "Mehmon oldida esnamang, cho'zilmang" },
          ],
          quiz: [
            { q: "Nima uchun ofitsantning tozaligi muhim?", a: ["Faqat chiroyli bo'lishi uchun", "Mehmon u orqali oshxona tozaligini baholaydi", "Boshliq so'ragani uchun", "Muhim emas"], c: 1, why: "Ofitsant — zalning \"yuzi\"." },
            { q: "Ish vaqtida qaysi biri mumkin emas?", a: ["Kalta tirnoq", "Kuchli atir sepish", "Toza forma", "Tartibli soch"], c: 1, why: "O'tkir hid taom ta'mini buzadi va ba'zi mehmonlarni bezovta qiladi." },
            { q: "Bo'sh paytda qanday turasiz?", a: ["Devorga suyanib", "Qo'l cho'ntakda", "Tik, zalga qarab", "Telefonda o'tirib"], c: 2, why: "Mehmon chaqirishi bilan ko'rishingiz kerak." },
          ],
        },
        {
          id: 'talk-3', title: 'Telefon va ish vaqti',
          cards: [
            { e: '📵', h: 'Shaxsiy telefon — cho\'ntakda', t: "Zalda shaxsiy telefonda o'tirmang, gaplashmang. Mehmon telefonga qarab turgan ofitsantni chaqirishga uyaladi.", ok: "Muhim qo'ng'iroq — tanaffusda, zaldan tashqarida", no: "Mehmon oldida video ko'rmang" },
            { e: '📲', h: 'Ish telefoni — faqat ish uchun', t: "FLOWI ochiq telefon buyurtma va xabarlar uchun. Unda boshqa narsa bilan chalg'imang.", ok: "\"Tayyor\" xabarini darhol ko'ring", no: "Ish telefonida o'yin o'ynamang" },
            { e: '⏰', h: 'O\'z vaqtida kelish', t: "Smenaga 10–15 daqiqa oldin keling: kiyining, zalni tekshiring, stop-listni ko'ring. Kechikish — hamkasbga yuk.", ok: "Kech qolsangiz oldindan xabar bering", no: "Indamay kechikmang" },
          ],
          quiz: [
            { q: "Shaxsiy qo'ng'iroq keldi, zal to'la. Nima qilasiz?", a: ["Zalda gaplashaman", "Tanaffusda, zaldan tashqarida qayta qo'ng'iroq qilaman", "Mehmon oldida gaplashaman", "O'chirib tashlayman va unutaman"], c: 1, why: "Ish vaqti — mehmonniki." },
            { q: "Smenaga qachon kelish kerak?", a: ["Aynan boshlanishida", "10–15 daqiqa oldin", "Yarim soat keyin", "Mehmon kelganda"], c: 1, why: "Tayyorgarlikka vaqt kerak: kiyinish, zal, stop-list." },
            { q: "Ish telefonidagi FLOWI nima uchun?", a: ["O'yin uchun", "Buyurtma va tayyor taom xabarlari uchun", "Ijtimoiy tarmoq uchun", "Musiqa uchun"], c: 1, why: "Tayyor taom xabarini o'tkazib yubormaslik — tez xizmat." },
          ],
        },
        {
          id: 'talk-4', title: 'Jamoa bilan ishlash',
          cards: [
            { e: '🤝', h: 'Bir-biringizga yordam bering', t: "Hamkasbingizning stoli chaqirayotgan bo'lsa va u band bo'lsa — yaqinlashib so'rang yoki unga yetkazing. Mehmon uchun hammangiz bitta jamoa.", ok: "\"Sizning 5-xonangiz chaqiryapti\"", no: "\"Bu meniki emas\" demang" },
            { e: '👨‍🍳', h: 'Oshxona bilan hurmatda', t: "Oshpazga baqirmang. Kechikkan taom haqida xotirjam so'rang. Xato bo'lsa — mehmon oldida emas, keyin hal qiling.", ok: "Buyurtmani aniq va to'liq yuboring", no: "Mehmon oldida oshpazni ayblamang" },
            { e: '🧾', h: 'Smenani topshirish', t: "Ketishdan oldin ochiq stollar, kutilayotgan taomlar va maxsus iltimoslarni keyingi ofitsantga aniq aytib bering.", ok: "\"3-xonada yubiley, tort 21:00 da\"", no: "Ochiq stolni indamay tashlab ketmang" },
          ],
          quiz: [
            { q: "Hamkasbingizning stoli chaqiryapti, u band. Nima qilasiz?", a: ["\"Meniki emas\" deyman", "Yaqinlashib so'rayman yoki hamkasbimga yetkazaman", "Ko'rmaganga olaman", "Boshliqqa shikoyat qilaman"], c: 1, why: "Mehmon kim xizmat qilishini emas, xizmat bo'lishini kutadi." },
            { q: "Taom kechikdi. Oshpaz bilan qanday gaplashasiz?", a: ["Baqiraman", "Mehmon oldida ayblayman", "Xotirjam so'rayman", "Gaplashmayman"], c: 2, why: "Asabiylik ishni tezlashtirmaydi, faqat buzadi." },
            { q: "Smena tugadi, 2 ta stol ochiq. To'g'ri yo'l?", a: ["Indamay ketaman", "Keyingi ofitsantga hammasini aniq topshiraman", "Mehmonlarni haydayman", "Hisobni yopib qo'yaman"], c: 1, why: "Topshirilmagan stol — unutilgan mehmon." },
          ],
        },
      ],
    },
    {
      id: 'table', icon: '🫖', color: '#fff1de', title: 'Dasturxon va choy odobi', free: false,
      lessons: [
        {
          id: 'table-1', title: 'Dasturxon tuzash',
          cards: [
            { e: '🧺', h: 'Toza dasturxon', t: "Mehmon kelguncha dasturxon toza, dog'siz va tekis bo'lsin. Non, shirinlik va mevalar chiroyli joylashtiriladi.", ok: "Har mehmondan keyin to'liq almashtirish yoki tozalash", no: "Oldingi mehmon ushoqlari bilan qoldirmang" },
            { e: '🍞', h: 'Non — muqaddas', t: "Nonni teskari qo'ymang, yerga tushirmang. Non dasturxonga birinchi qo'yiladi va oxirida yig'iladi.", ok: "Nonni ikki qo'llab, hurmat bilan qo'ying", no: "Non ustiga idish qo'ymang" },
            { e: '🍽', h: 'Idishlar joylashuvi', t: "Har mehmonga piyola, likopcha va kerak bo'lsa qoshiq-sanchqi. Idishlar toza va darz ketmagan bo'lsin.", ok: "Idishni chetidan ushlang", no: "Piyolaning ichidan barmoq bilan ushlamang" },
          ],
          quiz: [
            { q: "Non bilan qanday muomala qilinadi?", a: ["Teskari qo'yish mumkin", "Hurmat bilan, to'g'ri qo'yiladi va yerga tushirilmaydi", "Ustiga idish qo'yiladi", "Oxirida qo'yiladi"], c: 1, why: "Non — o'zbek dasturxonining eng hurmatli ne'mati." },
            { q: "Darz ketgan piyolani nima qilasiz?", a: ["Mehmonga beraman", "Ishlatmayman, almashtiraman", "Burib qo'yaman", "Yuvaman va beraman"], c: 1, why: "Darz ketgan idish — xavfli va hurmatsizlik belgisi." },
            { q: "Piyolani qanday ushlaysiz?", a: ["Ichidan barmoq bilan", "Chetidan yoki tagidan", "Ikki barmoq bilan ichidan", "Farqi yo'q"], c: 1, why: "Mehmon labi tegadigan joyga barmoq tegmasligi kerak." },
          ],
        },
        {
          id: 'table-2', title: 'Choy quyish',
          cards: [
            { e: '🫖', h: 'Choy qaytarish', t: "Choy damlangach, uch marta piyolaga quyib, qaytadan choynakka qaytariladi — choy yaxshi damlanadi.", ok: "Choynak qopqog'ini ushlab quying", no: "Choyni piyolaga to'kib-sochmang" },
            { e: '🍵', h: 'Piyolani yarmigacha to\'ldiring', t: "Piyolaga yarmidan sal ko'proq quyiladi. To'la piyola qadimdan \"tezroq iching-u keting\" degan ma'noni beradi.", ok: "Kam-kamdan, tez-tez quyib turing", no: "Piyolani limmo-lim to'ldirmang" },
            { e: '👴', h: 'Avval kattaga', t: "Choyni avval davraning eng kattasiga, keyin qolganlarga uzating. Piyolani o'ng qo'l bilan, chap qo'lni ko'ksiga qo'yib uzatish — hurmat.", ok: "O'ng qo'l bilan uzating", no: "Piyolani tepasidan ushlab uzatmang" },
          ],
          quiz: [
            { q: "Piyolaga qancha choy quyiladi?", a: ["Limmo-lim", "Yarmidan sal ko'proq", "Bir qultum", "Farqi yo'q"], c: 1, why: "To'la piyola — an'anada \"ketavering\" degan ishora." },
            { q: "Choy birinchi kimga uzatiladi?", a: ["Eng yoshga", "Eng kattaga", "Buyurtma berganga", "Eshik oldidagiga"], c: 1, why: "Kattaga hurmat — o'zbek dasturxonining qoidasi." },
            { q: "Choy damlangach nima qilinadi?", a: ["Darhol quyiladi", "Uch marta qaytariladi", "Muzlatiladi", "Shakar solinadi"], c: 1, why: "Qaytarish choyni bir xil va yaxshi damlaydi." },
          ],
        },
        {
          id: 'table-3', title: 'Taom olib kelish va yig\'ish',
          cards: [
            { e: '🍲', h: 'Taomni qanday qo\'yish', t: "Taomni mehmonning o'ng tomonidan qo'ying. Issiq taomni ogohlantiring: \"Ehtiyot bo'ling, issiq\".", ok: "Kim nima buyurtma qilganini eslab qoling", no: "\"Lag'mon kimniki?\" deb baqirmang" },
            { e: '🧹', h: 'Bo\'sh idishni yig\'ish', t: "Bo'sh likopchani mehmon tugatgach, so'rab yig'ing: \"Olib ketsam bo'ladimi?\" Davra hali yeyayotgan bo'lsa shoshilmang.", ok: "Dasturxonni toza tuting", no: "Hali yeyayotgan mehmonning idishini olmang" },
            { e: '🔄', h: 'Choy va nonni kuzating', t: "Choynak bo'shasa yoki non tugasa — mehmon so'ramasdan yangisini taklif qiling.", ok: "\"Yana bir choynak olib kelaymi?\"", no: "Mehmon chaqirguncha kutmang" },
          ],
          quiz: [
            { q: "Taom kimniki ekanini bilmasangiz?", a: ["Baland ovozda so'rayman", "Buyurtmada joyini belgilab, eslab qolaman", "Istalgan joyga qo'yaman", "Stol o'rtasiga qo'yaman"], c: 1, why: "Kim nima olganini bilish — professional xizmat belgisi." },
            { q: "Mehmon hali yeyapti, likopchasi yarim bo'sh. Nima qilasiz?", a: ["Olib ketaman", "Tugatguncha kutaman", "Boshqa likopchaga solaman", "So'ramasdan yig'aman"], c: 1, why: "Shoshirish mehmonni \"keting\" deganga o'xshaydi." },
            { q: "Choynak bo'shab qoldi. To'g'ri yo'l?", a: ["Mehmon chaqirguncha kutaman", "O'zim taklif qilaman", "Hisobni olib kelaman", "Indamayman"], c: 1, why: "Oldindan sezish — eng yaxshi xizmat." },
          ],
        },
        {
          id: 'table-4', title: 'Bayram va katta davralar',
          cards: [
            { e: '🎉', h: 'Katta davrani oldindan tayyorlash', t: "Bronda nechta odam, qanday tadbir, maxsus iltimoslar (tort, sham, musiqa) borligini aniqlang va xonani oldindan tayyorlang.", ok: "Tadbir oldidan hammasini yana bir tekshiring", no: "Mehmon kelgandan keyin stul qidirmang" },
            { e: '🍢', h: 'Taomni bir vaqtda chiqarish', t: "Katta davraga taom bir vaqtda chiqishi kerak. Oshxonaga oldindan ayting, kerak bo'lsa hamkasbdan yordam so'rang.", ok: "Ikki ofitsant birga olib chiqing", no: "Yarimtasi yeb, yarimtasi kutib o'tirmasin" },
            { e: '🎂', h: 'Tabriklash lahzasi', t: "Tort yoki sovg'a chiqarish vaqtini tadbir egasi bilan kelishing. Shu lahzada chiroqni, musiqani tayyorlang.", ok: "Tadbir egasiga \"tayyor\" deb ishora qiling", no: "Tortni kutilmaganda olib chiqib qo'ymang" },
          ],
          quiz: [
            { q: "30 kishilik bron bor. Qachon tayyorlanasiz?", a: ["Mehmonlar kelganda", "Oldindan, xonani to'liq tayyorlab", "Taom buyurtma qilinganda", "Kerak emas"], c: 1, why: "Katta tadbirda kutilmagan holatlar ko'p — tayyorgarlik ularni kamaytiradi." },
            { q: "Katta davraga taom qanday chiqariladi?", a: ["Tayyor bo'lgani bilan bittadan", "Imkon qadar bir vaqtda", "Faqat so'ralganda", "Oxirida hammasi"], c: 1, why: "Hamma birga yeyishni boshlashi kerak." },
            { q: "Tort chiqarish vaqti qanday belgilanadi?", a: ["O'zim xohlaganda", "Tadbir egasi bilan kelishib", "Oshpaz aytganda", "Eng oxirida"], c: 1, why: "Tabrik — tadbirning eng muhim lahzasi, egasi boshqaradi." },
          ],
        },
      ],
    },
    {
      id: 'menu', icon: '📋', color: '#f3e8ff', title: 'Menyu va tavsiya qilish', free: false,
      lessons: [
        {
          id: 'menu-1', title: 'Menyuni bilish',
          cards: [
            { e: '📖', h: 'Har bir taomni biling', t: "Har bir taomning tarkibi, hajmi, tayyorlanish vaqti va narxini biling. \"Bilmayman\" — eng yomon javob.", ok: "Yangi taomni avval o'zingiz tatib ko'ring", no: "Taxmin bilan javob bermang" },
            { e: '⏳', h: 'Tayyorlanish vaqti', t: "Qozon kabob 40–50 daqiqa, salat 10 daqiqa. Uzoq tayyorlanadigan taomni oldindan ayting — mehmon rejalashtiradi.", ok: "\"Bu taom 45 daqiqada tayyor bo'ladi\"", no: "Kechikishni yashirmang" },
            { e: '🚫', h: 'Stop-list', t: "Smena boshida tugagan taomlar ro'yxatini ko'ring. Mehmon tanlagandan keyin \"yo'q ekan\" deyish — noqulay.", ok: "Tugagan taom o'rniga muqobilini taklif qiling", no: "Yo'q taomni buyurtmaga yozmang" },
          ],
          quiz: [
            { q: "Mehmon taom tarkibini so'radi, bilmaysiz. Nima qilasiz?", a: ["Taxmin bilan aytaman", "\"Aniqlab kelaman\" deb oshpazdan so'rayman", "\"Bilmayman\" deyman", "Boshqa taomni maqtayman"], c: 1, why: "Noto'g'ri ma'lumot (ayniqsa allergiyada) xavfli bo'lishi mumkin." },
            { q: "Uzoq tayyorlanadigan taom buyurtma qilinmoqda. Nima qilasiz?", a: ["Hech narsa demayman", "Tayyorlanish vaqtini oldindan aytaman", "Buyurtmani olmayman", "Tezroq deb aldayman"], c: 1, why: "Ochiq ma'lumot — kutishni osonlashtiradi." },
            { q: "Smena boshida nimani tekshirish kerak?", a: ["Telefonni", "Stop-listni", "Ob-havoni", "Hech narsani"], c: 1, why: "Tugagan taomni sotib qo'ymaslik uchun." },
          ],
        },
        {
          id: 'menu-2', title: 'Tavsiya qilish',
          cards: [
            { e: '⭐', h: 'Tanlovni osonlashtiring', t: "\"Nima tavsiya qilasiz?\" desa, 2–3 ta taomni aniq ayting: \"Bizning qozon kabobimiz mashhur, lag'monni ham maqtashadi\".", ok: "O'zingiz yoqtirgan taomni samimiy maqtang", no: "\"Hammasi yaxshi\" demang" },
            { e: '➕', h: 'Qo\'shimcha taklif', t: "Asosiy taomga mos qo'shimcha: kabobga salat, oshga achchiq-chuchuk, choyga shirinlik. Bu mehmonga ham, choyxonaga ham foyda.", ok: "\"Kabobga achchiq-chuchuk olib kelaymi?\"", no: "Majburlamang, bir marta taklif yetadi" },
            { e: '👥', h: 'Miqdorni to\'g\'ri maslahat bering', t: "4 kishiga 10 ta shashlik kam bo'lishi yoki 3 ta katta lagan ko'p bo'lishi mumkin. Halol maslahat ishonch uyg'otadi.", ok: "\"Bu porsiya 2–3 kishiga yetadi\"", no: "Kerak bo'lmaganni ko'p sotmang" },
          ],
          quiz: [
            { q: "Mehmon \"Nima tavsiya qilasiz?\" dedi. Eng yaxshi javob?", a: ["\"Hammasi yaxshi\"", "2–3 ta aniq taomni nomlab tavsiya qilish", "\"Bilmayman\"", "Eng qimmatini aytish"], c: 1, why: "Aniq tavsiya tanlovni osonlashtiradi." },
            { q: "Qo'shimcha taklif necha marta qilinadi?", a: ["Har 5 daqiqada", "Bir marta, majburlamasdan", "Hech qachon", "Mehmon rozi bo'lguncha"], c: 1, why: "Taklif — xizmat, majburlash — bezovtalik." },
            { q: "Mehmonlar kerakdan ko'p buyurtma qilmoqda. Nima qilasiz?", a: ["Indamayman — savdo ko'payadi", "Halol maslahat beraman", "Yana qo'shaman", "Boshliqni chaqiraman"], c: 1, why: "Ishonch — keyingi tashriflardan kelgan foyda." },
          ],
        },
        {
          id: 'menu-3', title: 'Allergiya va maxsus iltimoslar',
          cards: [
            { e: '⚠️', h: 'Allergiya — jiddiy', t: "Mehmon allergiyasini aytsa (yong'oq, sut, gluten…), buni buyurtmaga izoh qilib yozing va oshpazga og'zaki ham ayting.", ok: "Ishonchingiz komil bo'lmasa — tavsiya qilmang", no: "\"Ozgina bo'lsa hech narsa qilmaydi\" demang" },
            { e: '🌶', h: '"Achchiqsiz", "piyozsiz"', t: "Maxsus iltimoslarni FLOWI'da taomga izoh qilib yozing — oshxona ekranida va qog'ozida chiqadi.", ok: "Izohni yuborishdan oldin yozing", no: "Yodda saqlab, unutib qo'ymang" },
            { e: '🧒', h: 'Bolalar uchun', t: "Bolalarga yumshoq, achchiq bo'lmagan taomlar va kichik porsiya taklif qiling. Issiq choyni bolaning yoniga qo'ymang.", ok: "\"Bolaga achchiqsiz qilaylikmi?\"", no: "Issiq idishni bola qo'li yetadigan joyga qo'ymang" },
          ],
          quiz: [
            { q: "Mehmon yong'oqqa allergiyasi borligini aytdi. Nima qilasiz?", a: ["E'tibor bermayman", "Izoh yozaman va oshpazga og'zaki ham aytaman", "\"Ozgina bo'lsa bo'ladi\" deyman", "Taomni rad etaman"], c: 1, why: "Allergiya — hayot uchun xavfli bo'lishi mumkin." },
            { q: "\"Piyozsiz\" iltimosi FLOWI'da qanday yoziladi?", a: ["Taomga izoh qilib, yuborishdan oldin", "Yozilmaydi, eslab qolinadi", "Yuborilgandan keyin", "Hisobga yoziladi"], c: 0, why: "Izoh oshxona ekranida va qog'ozida chiqadi — unutilmaydi." },
            { q: "Issiq choynakni qayerga qo'ymaslik kerak?", a: ["Stol o'rtasiga", "Bola qo'li yetadigan joyga", "Kattaning yoniga", "Patnisga"], c: 1, why: "Bolalar xavfsizligi — birinchi o'rinda." },
          ],
        },
        {
          id: 'menu-4', title: 'Buyurtmani to\'g\'ri olish',
          cards: [
            { e: '✍️', h: 'Tartib bilan oling', t: "Avval kattalardan, keyin qolganlardan. Har birining tanlovini aniq yozing.", ok: "Kim nima olganini belgilab boring", no: "Bir vaqtda hamma bilan gaplashmang" },
            { e: '🔁', h: 'Qaytarib o\'qing', t: "Buyurtma oxirida qisqa qaytaring: \"2 ta lag'mon, 10 ta shashlik, 1 achchiq-chuchuk, 2 choynak ko'k choy — to'g'rimi?\"", ok: "Soni va izohlarni aniqlashtiring", no: "Shoshib, tasdiqlatmasdan yubormang" },
            { e: '⏱', h: 'Kutish vaqtini ayting', t: "Buyurtmadan keyin: \"Salat 10 daqiqada, kabob 25 daqiqada tayyor bo'ladi\". Mehmon nimani kutayotganini biladi.", ok: "Kechiksa — oldindan ogohlantiring", no: "\"Hozir-hozir\" deb aldamang" },
          ],
          quiz: [
            { q: "Buyurtma oxirida nima qilinadi?", a: ["Darhol oshxonaga yuguraman", "Buyurtmani qaytarib o'qiyman", "Hisobni olib kelaman", "Hech narsa"], c: 1, why: "Qaytarib o'qish xatolarni oshxonaga yetmasdan to'xtatadi." },
            { q: "Kimdan birinchi buyurtma olinadi?", a: ["Eng yoshdan", "Kattalardan", "Kim birinchi gapirsa", "Farqi yo'q"], c: 1, why: "Hurmat tartibi xizmatda ham saqlanadi." },
            { q: "Taom kechikmoqda. To'g'ri yo'l?", a: ["\"Hozir-hozir\" deyman", "Mehmonni oldindan ogohlantirib, aniq vaqt aytaman", "Indamayman", "Boshqa taom olib kelaman"], c: 1, why: "Halollik kutishni yengillashtiradi." },
          ],
        },
      ],
    },
    {
      id: 'flowi', icon: '📱', color: '#e0f7fa', title: "FLOWI'da ishlash", free: false, site: false,
      lessons: [
        {
          id: 'flowi-1', title: 'Xona ochish va buyurtma urish',
          cards: [
            { e: '🏠', h: 'Xonani oching', t: "\"Xonalar\" bo'limida mehmon o'tirgan xonani bosing. Kerak bo'lsa mehmonlar sonini \"+\" bilan to'g'rilang.", ok: "Har doim to'g'ri xonani tanlang", no: "Boshqa xonaga urib qo'ymang" },
            { e: '👆', h: 'Taomni tanlang', t: "Kategoriyani bosing yoki qidiruvga taom nomini yozing. Taom bosilganda chekka tushadi — hali oshxonaga ketmagan.", ok: "Soni \"+\" va \"−\" bilan to'g'rilanadi", no: "Bir taomni 10 marta bosib chalkashtirmang" },
            { e: '📤', h: '"Yuborish" ni bosing', t: "Hammasi to'g'ri bo'lsa pastdagi ko'k \"Yuborish\" tugmasini bosing — taom oshxona ekraniga va qog'oziga chiqadi.", ok: "Yuborishdan oldin chekni bir ko'zdan kechiring", no: "Yubormasdan ketib qolmang" },
          ],
          quiz: [
            { q: "Taomni bosdingiz. U oshxonaga ketdimi?", a: ["Ha, darhol", "Yo'q, \"Yuborish\" bosilgandan keyin ketadi", "Faqat boshliq yuboradi", "5 daqiqadan keyin o'zi ketadi"], c: 1, why: "Yuborilmagan taom faqat sizning ekraningizda turadi." },
            { q: "Menyudan taomni tez topish uchun?", a: ["Hamma kategoriyani ko'rib chiqish", "Qidiruvga nomini yozish", "Oshpazdan so'rash", "Boshliqni chaqirish"], c: 1, why: "Qidiruv hamma kategoriyalar bo'yicha qidiradi." },
            { q: "Yuborishdan oldin nima qilinadi?", a: ["Chekni ko'zdan kechiriladi", "Telefon o'chiriladi", "Hisob yopiladi", "Hech narsa"], c: 0, why: "Xatoni yuborishdan oldin tuzatish oson." },
          ],
        },
        {
          id: 'flowi-2', title: 'Izoh va qo\'shimcha tanlov',
          cards: [
            { e: '✎', h: 'Izoh yozish', t: "Yuborilmagan taom qatorini bosing → \"Izoh\" → masalan \"achchiq bo'lmasin\". Izoh oshxonaga taom bilan birga boradi.", ok: "Izohni yuborishdan oldin yozing", no: "Yuborilgan taomga izoh qo'shib bo'lmaydi" },
            { e: '🧂', h: 'Qo\'shimcha tanlov', t: "Ba'zi taomlarda tanlov bor (masalan, achchiq/oddiy, katta/kichik). Taom bosilganda oyna chiqadi — to'g'risini tanlang.", ok: "Mehmondan aniq so'rang", no: "Taxmin bilan tanlamang" },
            { e: '➕', h: 'Yana bitta', t: "Yuborilgan taom yonidagi \"+\" yana bittasini qo'shadi. U yangi qator bo'lib \"Yuborish\" ni kutadi, yuborilgach eski qatorga qo'shiladi.", ok: "\"+\" dan keyin \"Yuborish\" ni unutmang", no: "Taomni qaytadan qidirib o'tirmang" },
          ],
          quiz: [
            { q: "Yuborilgan taomga izoh qo'shish mumkinmi?", a: ["Ha, istalgan vaqt", "Yo'q — izoh yuborishdan oldin yoziladi", "Faqat boshliq", "Faqat kechqurun"], c: 1, why: "Izoh taom bilan birga oshxonaga ketadi." },
            { q: "Yuborilgan taomdan yana bitta kerak. Eng tez yo'l?", a: ["Menyudan qidiraman", "Qator yonidagi \"+\" ni bosib, \"Yuborish\"", "Oshpazga aytaman", "Yangi xona ochaman"], c: 1, why: "\"+\" xuddi shu taomni tanlovi bilan qo'shadi." },
            { q: "\"+\" bosgandan keyin taom oshxonaga ketadimi?", a: ["Ha, darhol", "Yo'q, \"Yuborish\" ni bosish kerak", "Boshliq tasdiqlasa", "Ertaga"], c: 1, why: "Har qanday yangi taom \"Yuborish\" orqali ketadi." },
          ],
        },
        {
          id: 'flowi-3', title: 'Tayyor taom va "Oldim"',
          cards: [
            { e: '🔔', h: 'Taom tayyor', t: "Oshpaz taomni tayyor qilganda telefoningizga xabar va ovoz keladi, xonada qator yashil bo'ladi.", ok: "Xabarni darhol ko'ring", no: "Tayyor taomni sovutib qo'ymang" },
            { e: '✋', h: '"Oldim" tugmasi', t: "Taomni oshxonadan olganingizda \"Tayyor\" bo'limida yoki qatorni bosib \"Oldim\" ni bosing. Bir nechta bo'lsa — \"Hammasini oldim\".", ok: "Taomni olganingiz zahoti bosing", no: "Bosmasdan qoldirmang — oshxona kutib turadi" },
            { e: '🕒', h: 'Nima uchun muhim', t: "\"Oldim\" bosilmasa, boshliq va oshxona taom mehmonga yetmagan deb o'ylaydi. Hisobotda xizmat tezligi ham shundan hisoblanadi.", ok: "Har bir taomni o'z vaqtida belgilang", no: "Smena oxirida hammasini birdan bosmang" },
          ],
          quiz: [
            { q: "Taom tayyor bo'lganini qanday bilasiz?", a: ["Oshpaz baqiradi", "Telefonga xabar keladi va qator yashil bo'ladi", "Taxmin qilaman", "Boshliq aytadi"], c: 1, why: "FLOWI tayyor taom haqida darhol xabar beradi." },
            { q: "\"Oldim\" qachon bosiladi?", a: ["Smena oxirida", "Taomni oshxonadan olganingiz zahoti", "Mehmon to'laganda", "Hech qachon"], c: 1, why: "Shunda hamma taom mehmonga yetganini ko'radi." },
            { q: "Bir nechta taom tayyor. Eng tez yo'l?", a: ["Har birini alohida qidiraman", "\"Hammasini oldim\" tugmasi", "Kutaman", "Boshliqqa aytaman"], c: 1, why: "Bitta bosish bilan hammasi belgilanadi." },
          ],
        },
        {
          id: 'flowi-4', title: 'Hisob va bekor qilish',
          cards: [
            { e: '🧾', h: 'Hisob so\'rash', t: "Mehmon hisob so'rasa, xonada \"Hisob\" tugmasini bosing — kassaga xabar boradi. Chek chiqarish huquqingiz bo'lsa \"Chek\" ni bosing.", ok: "Hisobni kutdirmang", no: "Summani og'zaki taxmin qilmang" },
            { e: '🔒', h: 'Kamaytirish va bekor qilish', t: "Yuborilgan taomni kamaytirish yoki bekor qilish faqat ruxsat bilan. Qulf belgisi bo'lsa — boshliq yoki kassirga ayting.", ok: "Bekor qilish sababini aniq yozing", no: "Xato urilgan taomni yashirmang" },
            { e: '🤝', h: 'Xato bo\'lsa', t: "Noto'g'ri taom urib yuborsangiz, darhol oshxona va kassirga ayting — taom tayyorlanmasdan to'xtatiladi. Kech aytilgan xato — isrof.", ok: "\"5-xonaga xato urildi, bekor qilish kerak\"", no: "\"Bilmay qoldim\" deb kechiktirmang" },
          ],
          quiz: [
            { q: "Mehmon hisob so'radi. FLOWI'da nima qilasiz?", a: ["\"Hisob\" tugmasini bosaman", "Summani og'zaki aytaman", "Xonani yopaman", "Hech narsa"], c: 0, why: "Kassa darhol xabar oladi va chek tayyorlanadi." },
            { q: "\"−\" tugmasida qulf belgisi bor. Nima degani?", a: ["Dastur buzilgan", "Kamaytirish faqat boshliq ruxsati bilan", "Taom tugagan", "Internet yo'q"], c: 1, why: "Yuborilgan taomni kamaytirish nazorat ostida." },
            { q: "Xato taom urib yubordingiz. Nima qilasiz?", a: ["Indamayman", "Darhol oshxona va kassirga aytaman", "Mehmonga baribir beraman", "Ertaga aytaman"], c: 1, why: "Tez aytilsa, taom tayyorlanmasdan to'xtaydi." },
          ],
        },
      ],
    },
    {
      id: 'hard', icon: '😤', color: '#fdecec', title: 'Qiyin mijoz va shikoyat', free: false,
      lessons: [
        {
          id: 'hard-1', title: 'Shikoyatni tinglash',
          cards: [
            { e: '👂', h: 'Avval tinglang', t: "Mehmon gapirayotganda bo'lmang, oqlanmang. Oxirigacha eshiting — ko'pincha u faqat eshitilishni xohlaydi.", ok: "Bosh irg'ab, ko'zga qarab tinglang", no: "\"Yo'q, unday emas\" deb gapini bo'lmang" },
            { e: '🙇', h: 'Uzr so\'rang', t: "Kim aybdor bo'lishidan qat'i nazar: \"Noqulaylik uchun uzr so'raymiz\". Uzr — aybni tan olish emas, hurmat.", ok: "Samimiy, xotirjam ohangda", no: "Oshpazni yoki hamkasbni ayblamang" },
            { e: '🛠', h: 'Yechim taklif qiling', t: "\"Taomni darhol almashtirib beraymi?\" yoki \"Isitib keltiraymi?\" Tez yechim — shikoyatni minnatdorchilikka aylantiradi.", ok: "Va'da bergan vaqtda bajaring", no: "Bajara olmaydigan va'dani bermang" },
          ],
          quiz: [
            { q: "Mehmon taom sovuq kelganidan shikoyat qildi. Birinchi nima qilasiz?", a: ["Oshxonada hamma band ekanini tushuntiraman", "Boshliqni chaqiraman", "Uzr so'rab, taomni darhol isitib/almashtirib kelaman", "Chekdan olib tashlayman"], c: 2, why: "Avval uzr va tez yechim. Boshliq — agar mehmon baribir norozi bo'lsa." },
            { q: "Mehmon shikoyat qilayotganda nima qilmaslik kerak?", a: ["Tinglash", "Gapini bo'lib oqlanish", "Bosh irg'ash", "Uzr so'rash"], c: 1, why: "Gapni bo'lish mehmonni yanada asabiylashtiradi." },
            { q: "Uzr so'rash nimani anglatadi?", a: ["Aybni bo'yinga olishni", "Mehmonga hurmatni", "Zaiflikni", "Pul qaytarishni"], c: 1, why: "Uzr — vaziyatni yumshatadigan hurmat belgisi." },
          ],
        },
        {
          id: 'hard-2', title: 'Asabiy mehmon',
          cards: [
            { e: '🧊', h: 'Xotirjam qoling', t: "Mehmon baqirsa ham ovozingizni ko'tarmang. Sekin, past ovozda gapirish vaziyatni sovitadi.", ok: "Chuqur nafas oling, gapni shaxsiy qabul qilmang", no: "Javob qaytarib baqirmang" },
            { e: '🚶', h: 'Boshqalardan uzoqroq', t: "Agar suhbat uzayotgan bo'lsa, xotirjam joyga taklif qiling: \"Keling, shu yerda gaplashaylik\" — boshqa mehmonlar bezovta bo'lmaydi.", ok: "Boshliq yoki adminni chaqiring", no: "Butun zal oldida tortishmang" },
            { e: '🛑', h: 'Chegarani biling', t: "Haqorat, tahdid yoki mast holda tajovuz bo'lsa — o'zingiz hal qilmang. Darhol boshliq yoki qo'riqchini chaqiring.", ok: "Xavfsizligingizni birinchi o'ringa qo'ying", no: "Jismoniy to'qnashuvga kirmang" },
          ],
          quiz: [
            { q: "Mehmon baland ovozda baqiryapti. Siz?", a: ["Men ham baqiraman", "Past va xotirjam ovozda gapiraman", "Ketib qolaman", "Kulaman"], c: 1, why: "Xotirjam ovoz qarshi tomonni ham tinchlantiradi." },
            { q: "Mast mehmon sizga tahdid qilyapti. To'g'ri yo'l?", a: ["O'zim hal qilaman", "Darhol boshliq yoki qo'riqchini chaqiraman", "Javob qaytaraman", "Unga ichimlik beraman"], c: 1, why: "Xavfli vaziyatni yolg'iz hal qilishga urinmang." },
            { q: "Janjal uzaymoqda, zal to'la. Nima qilasiz?", a: ["Hamma oldida davom ettiraman", "Mehmonni xotirjam joyga taklif qilaman", "Musiqani baland qo'yaman", "Indamayman"], c: 1, why: "Boshqa mehmonlarning dam olishini saqlash kerak." },
          ],
        },
        {
          id: 'hard-3', title: 'Hisob bo\'yicha tortishuv',
          cards: [
            { e: '🧾', h: 'Chekni birga ko\'ring', t: "Mehmon \"Bu ko'p\" desa — chekni birga, qatorma-qator ko'rib chiqing. Ko'pincha savol bitta taom ustida bo'ladi.", ok: "Har bir qatorni xotirjam tushuntiring", no: "\"Dastur shunday hisobladi\" deb qo'ya qolmang" },
            { e: '🔍', h: 'Xato bo\'lsa — tan oling', t: "Haqiqatan xato urilgan bo'lsa, uzr so'rang va kassir yoki boshliq orqali to'g'rilang.", ok: "Bekor qilish sababini yozing", no: "Xatoni yashirmang" },
            { e: '💯', h: 'Xizmat haqi', t: "Xizmat haqi foizi chekda alohida ko'rsatiladi. Mehmon so'rasa, hurmat bilan tushuntiring.", ok: "\"Xizmat haqi 10%, chekda alohida yozilgan\"", no: "Xizmat haqi haqida bahslashmang — boshliqni chaqiring" },
          ],
          quiz: [
            { q: "Mehmon \"Hisob ko'p\" dedi. Birinchi qadam?", a: ["\"Dastur shunday hisoblagan\"", "Chekni birga qatorma-qator ko'rib chiqaman", "Chegirma beraman", "E'tibor bermayman"], c: 1, why: "Ko'pincha savol bitta qatorda — birga ko'rish tez hal qiladi." },
            { q: "Chekda haqiqatan xato bor. Nima qilasiz?", a: ["Yashiraman", "Uzr so'rab, ruxsat bilan to'g'rilayman", "Mehmon to'lasin", "Keyingi mehmonga qo'shaman"], c: 1, why: "Halollik — choyxona obro'si." },
            { q: "Xizmat haqi haqida mehmon bahslashmoqda. Siz?", a: ["Bahslashaman", "Hurmat bilan tushuntiraman, kerak bo'lsa boshliqni chaqiraman", "Olib tashlayman", "Indamayman"], c: 1, why: "Narx siyosatini boshliq hal qiladi." },
          ],
        },
        {
          id: 'hard-4', title: 'Shikoyatdan keyin',
          cards: [
            { e: '📝', h: 'Boshliqqa yetkazing', t: "Har bir shikoyatni (hatto hal bo'lgan bo'lsa ham) boshliqqa ayting. Takrorlanadigan muammo shunday aniqlanadi.", ok: "Qisqa: qaysi xona, nima bo'ldi, nima qildingiz", no: "\"Hal bo'ldi-ku\" deb yashirmang" },
            { e: '💡', h: 'Xulosa chiqaring', t: "\"Nima uchun shunday bo'ldi?\" Taom sovib qoldimi — demak, \"Oldim\" ni kech bosganmiz yoki tayyor xabarini o'tkazib yuborganmiz.", ok: "O'z xatoingizdan o'rganing", no: "Har doim boshqalarni ayblamang" },
            { e: '😊', h: 'Kayfiyatni qaytaring', t: "Shikoyat qilgan mehmon ketishidan oldin unga yana bir bor e'tibor bering: \"Endi hammasi joyidami?\" Ko'pincha u eng sodiq mehmonga aylanadi.", ok: "Iliq xayrlashing", no: "U mehmondan qochmang" },
          ],
          quiz: [
            { q: "Shikoyat hal bo'ldi. Boshliqqa aytish kerakmi?", a: ["Yo'q, hal bo'ldi-ku", "Ha, qisqacha aytaman", "Faqat pul qaytarilsa", "Faqat so'rasa"], c: 1, why: "Takrorlanadigan muammolar shunday topiladi." },
            { q: "Shikoyat qilgan mehmon ketyapti. Siz?", a: ["Undan qochaman", "\"Endi hammasi joyidami?\" deb iliq xayrlashaman", "Hech narsa demayman", "Hisobni ikki marta tekshiraman"], c: 1, why: "Yaxshi hal qilingan shikoyat — sodiq mehmon." },
            { q: "Taom sovib qolgan bo'lsa, sabab ko'pincha nima?", a: ["Mehmon kech keldi", "Tayyor xabari kech ko'rilgan yoki taom kech olingan", "Ob-havo", "Idish"], c: 1, why: "Tayyor taomni darhol olib chiqish — sizning qo'lingizda." },
          ],
        },
      ],
    },
    {
      id: 'clean', icon: '🧼', color: '#e8f8ef', title: 'Gigiena va tozalik', free: false,
      lessons: [
        {
          id: 'clean-1', title: 'Qo\'l va idish',
          cards: [
            { e: '🧴', h: 'Qo\'l yuvish', t: "Ishni boshlashdan oldin, hojatxonadan keyin, pul ushlagandan keyin, iflos idish yig'gandan keyin — sovun bilan 20 soniya.", ok: "Toza sochiq yoki qog'oz bilan arting", no: "Fartukka artmang" },
            { e: '🍽', h: 'Toza va iflos alohida', t: "Iflos idishni toza idish yoki taom bilan bir patnisda olib yurmang.", ok: "Iflos idish — alohida patnisda", no: "Bir qo'lda iflos, bir qo'lda taom" },
            { e: '🥄', h: 'Tushgan qoshiq', t: "Yerga tushgan qoshiq, sanchqi yoki non darhol almashtiriladi — mehmon ko'z oldida ham.", ok: "\"Hozir yangisini olib kelaman\"", no: "Artib qaytarib bermang" },
          ],
          quiz: [
            { q: "Pul ushlagandan keyin taom olib chiqishdan oldin?", a: ["Hech narsa", "Qo'lni yuvaman", "Fartukka artaman", "Qo'lqop kiyaman, yuvmayman"], c: 1, why: "Pul — eng iflos narsalardan biri." },
            { q: "Mehmonning qoshig'i yerga tushdi. Siz?", a: ["Artib beraman", "Darhol yangisini olib kelaman", "Mehmon o'zi oladi", "Indamayman"], c: 1, why: "Yerga tushgan narsa — iflos." },
            { q: "Iflos idish va taomni birga olib yurish mumkinmi?", a: ["Ha", "Yo'q", "Faqat tez bo'lsa", "Faqat kechqurun"], c: 1, why: "Iflos idishdan taomga mikrob o'tadi." },
          ],
        },
        {
          id: 'clean-2', title: 'Stol va zal tozaligi',
          cards: [
            { e: '🧽', h: 'Stolni tozalash', t: "Mehmon ketgach: idishlarni yig'ing, ushoqlarni tozalang, stolni dezinfeksiya qiluvchi vosita bilan arting va quriting.", ok: "Har stol uchun toza latta", no: "Bitta latta bilan butun zalni artmang" },
            { e: '🪟', h: 'Zalni kuzating', t: "Polda to'kilgan suv, sochilgan ushoq, to'lgan axlat qutisi — darhol tozalanadi. To'kilgan suv — sirpanish xavfi.", ok: "\"Ehtiyot bo'ling, ho'l\" belgisini qo'ying", no: "\"Keyin tozalayman\" demang" },
            { e: '🚻', h: 'Hojatxona', t: "Mehmon hojatxonaga qarab choyxonani baholaydi. Smena davomida bir necha marta tekshiring.", ok: "Sovun, qog'oz doim bo'lsin", no: "Tozalashni faqat kechqurunga qoldirmang" },
          ],
          quiz: [
            { q: "Polga suv to'kildi. Nima qilasiz?", a: ["Keyin tozalayman", "Darhol tozalab, ogohlantiruvchi belgi qo'yaman", "Ustiga latta tashlayman", "Indamayman"], c: 1, why: "Ho'l pol — yiqilish va jarohat xavfi." },
            { q: "Bir latta bilan hamma stolni artish to'g'rimi?", a: ["Ha, tejamkor", "Yo'q, toza latta ishlatiladi", "Faqat kunduzi", "Ha, agar quruq bo'lsa"], c: 1, why: "Iflos latta mikrobni stoldan stolga tashiydi." },
            { q: "Hojatxona qachon tekshiriladi?", a: ["Faqat kechqurun", "Smena davomida bir necha marta", "Hech qachon", "Mehmon shikoyat qilganda"], c: 1, why: "Hojatxona tozaligi — butun joy obro'si." },
          ],
        },
        {
          id: 'clean-3', title: 'Kasal bo\'lsangiz',
          cards: [
            { e: '🤒', h: 'Kasal holda ishlamang', t: "Isitma, ich ketishi, qusish yoki kuchli yo'tal bo'lsa — boshliqqa ayting. Siz mehmon va hamkasblarni yuqtirishingiz mumkin.", ok: "Oldindan xabar bering", no: "Kasallikni yashirib ishga chiqmang" },
            { e: '🩹', h: 'Jarohat', t: "Qo'lda kesilgan joy bo'lsa — plastir bilan yoping va ustidan qo'lqop kiying.", ok: "Birinchi yordam qutisi qayerdaligini biling", no: "Ochiq jarohat bilan taom ushlamang" },
            { e: '😷', h: 'Aksirish va yo\'tal', t: "Aksirganda yoki yo'talganda tirsakka qarab, mehmon va taomdan uzoqlashing. Keyin qo'l yuving.", ok: "Ro'molcha yoki tirsak", no: "Taom ustida aksirmang" },
          ],
          quiz: [
            { q: "Ertalab isitmangiz bor. Nima qilasiz?", a: ["Indamay ishga boraman", "Boshliqqa oldindan xabar beraman", "Dori ichib, hech kimga aytmayman", "Tushdan keyin boraman"], c: 1, why: "Kasallik mehmonlarga va jamoaga yuqishi mumkin." },
            { q: "Barmog'ingiz kesildi. Ishni davom ettirish uchun?", a: ["Hech narsa qilmayman", "Plastir va ustidan qo'lqop", "Faqat yuvaman", "Fartuk bilan bog'layman"], c: 1, why: "Ochiq jarohat — taomga infeksiya yo'li." },
            { q: "Aksirish kelyapti, qo'lingizda taom. Siz?", a: ["Taom ustida aksiraman", "Taomdan burilib, tirsakka aksiraman va keyin qo'l yuvaman", "Qo'lga aksiraman va davom etaman", "Mehmonga beraman"], c: 1, why: "Taomni himoya qilish — birinchi qoida." },
          ],
        },
        {
          id: 'clean-4', title: 'Xavfsizlik',
          cards: [
            { e: '🔥', h: 'Issiq idish va choy', t: "Issiq choynak va laganlarni ikki qo'llab, kerak bo'lsa sochiq bilan ushlang. Yo'lda \"Ehtiyot bo'ling, issiq!\" deng.", ok: "Yo'lni oldindan ko'ring", no: "Ko'p narsani bir martada ko'tarmang" },
            { e: '🧯', h: 'Yong\'in va favqulodda holat', t: "O't o'chirgich va favqulodda chiqish joyini biling. Gaz hidi kelsa — darhol boshliqqa ayting.", ok: "Chiqish yo'llarini to'smang", no: "Vahima qilmang, ko'rsatma bering" },
            { e: '👶', h: 'Bolalar xavfsizligi', t: "Zalda yugurayotgan bolalarni ko'rsangiz — issiq narsa olib o'tayotganda sekinlashing va ota-onasiga xushmuomalalik bilan ayting.", ok: "\"Ehtiyot bo'laylik, issiq choy olib yuribmiz\"", no: "Bolaga baqirmang" },
          ],
          quiz: [
            { q: "Gaz hidi kelyapti. Birinchi nima qilasiz?", a: ["E'tibor bermayman", "Darhol boshliqqa aytaman", "Sham yoqaman", "Mehmonlarga aytmayman"], c: 1, why: "Gaz — hayot uchun xavf." },
            { q: "Favqulodda chiqish yo'liga stul qo'yish mumkinmi?", a: ["Ha, joy yo'q bo'lsa", "Yo'q, hech qachon", "Faqat bayramda", "Qisqa vaqtga"], c: 1, why: "Xavf paytida har soniya muhim." },
            { q: "Issiq lagan olib ketyapsiz, yo'lda bola yugurmoqda. Siz?", a: ["Tezlashaman", "Sekinlashib, ehtiyotkorlik bilan aylanib o'taman", "Bolaga baqiraman", "Laganni yerga qo'yaman"], c: 1, why: "Kuyish — eng ko'p uchraydigan jarohat." },
          ],
        },
      ],
    },
    {
      id: 'pay', icon: '💵', color: '#fff4dc', title: "Hisob va to'lov odobi", free: false,
      lessons: [
        {
          id: 'pay-1', title: 'Hisobni berish',
          cards: [
            { e: '🧾', h: 'Hisobni tez olib keling', t: "Mehmon hisob so'rasa, 2–3 daqiqa ichida chekni olib keling. Kutilgan hisob — butun kechaning yomon yakuni.", ok: "Chekni papka yoki likopchada bering", no: "Chekni stolga tashlab ketmang" },
            { e: '👤', h: 'Kimga berish', t: "Hisobni kim so'ragan bo'lsa yoki davra kattasiga bering. Agar bilmasangiz — stol o'rtasiga qo'yib, \"Marhamat, hisobingiz\" deng.", ok: "Xotirjam kutib turing yoki keyinroq keling", no: "Mehmon ustida turib shoshirmang" },
            { e: '➗', h: 'Bo\'lib to\'lash', t: "Mehmonlar alohida to'lamoqchi bo'lsa, kassirga ayting — FLOWI'da hisobni bo'lish mumkin.", ok: "\"Kim qaysi qismini to'laydi?\" deb so'rang", no: "Og'zaki hisoblab chalkashtirmang" },
          ],
          quiz: [
            { q: "Mehmon hisob so'radi. Qancha vaqtda olib kelasiz?", a: ["15 daqiqada", "2–3 daqiqa ichida", "Mehmon yana so'raganda", "Smena oxirida"], c: 1, why: "Hisobni kutish — eng asabiylashtiradigan kutish." },
            { q: "Hisobni kimga berasiz, bilmasangiz?", a: ["Eng yoshga", "Stol o'rtasiga qo'yib, \"Marhamat\" deyman", "Hech kimga", "Eshik oldidagiga"], c: 1, why: "Noqulay vaziyatdan qochish uchun." },
            { q: "Mehmonlar alohida to'lamoqchi. Siz?", a: ["Og'zaki hisoblayman", "Kassirga aytaman — hisob bo'linadi", "Rad etaman", "Teng bo'laman"], c: 1, why: "Dastur xatosiz bo'ladi." },
          ],
        },
        {
          id: 'pay-2', title: 'Naqd pul va qaytim',
          cards: [
            { e: '💵', h: 'Pulni sanab oling', t: "Mehmon bergan pulni uning ko'z oldida sanang: \"200 ming oldim\". Bu keyingi tortishuvlarning oldini oladi.", ok: "Summani ovoz chiqarib ayting", no: "Pulni sanamasdan cho'ntakka solmang" },
            { e: '🪙', h: 'Qaytimni aniq bering', t: "Qaytimni tez va to'liq olib keling. \"Qaytim kerakmi?\" deb so'ramang — bu choychaqa so'rashga o'xshaydi.", ok: "Qaytimni likopchada bering", no: "Qaytimni \"yaxlitlab\" qoldirmang" },
            { e: '💳', h: 'Karta va o\'tkazma', t: "Karta yoki Click/Payme bilan to'lov bo'lsa — to'lov o'tganini tekshirmaguncha mehmonni kuzatmang.", ok: "Muvaffaqiyatli to'lovni tasdiqlang", no: "\"O'tdi shekilli\" deb qo'ya qolmang" },
          ],
          quiz: [
            { q: "Mehmon naqd pul berdi. To'g'ri yo'l?", a: ["Sanamay cho'ntakka solaman", "Ko'z oldida sanab, summani aytaman", "Kassaga indamay beraman", "Keyin sanayman"], c: 1, why: "Ochiq sanash — ikki tomon uchun himoya." },
            { q: "\"Qaytim kerakmi?\" deb so'rash to'g'rimi?", a: ["Ha, har doim", "Yo'q — qaytimni aniq olib kelaman", "Faqat kam bo'lsa", "Faqat chet ellikdan"], c: 1, why: "Bu savol choychaqa talab qilishdek eshitiladi." },
            { q: "Karta bilan to'lovda nima tekshiriladi?", a: ["Hech narsa", "To'lov muvaffaqiyatli o'tgani", "Kartaning rangi", "Mehmonning ismi"], c: 1, why: "O'tmagan to'lov — choyxonaga zarar." },
          ],
        },
        {
          id: 'pay-3', title: 'Choychaqa',
          cards: [
            { e: '🙏', h: 'Choychaqa — mukofot, talab emas', t: "Yaxshi xizmatga mehmon o'zi rozi bo'lib beradi. Hech qachon so'ramang va ishora qilmang.", ok: "Har qanday summaga samimiy \"Rahmat\"", no: "Kam bergan mehmonga norozi qaramang" },
            { e: '⚖️', h: 'Qoidaga amal qiling', t: "Choychaqa qanday taqsimlanishini (o'zingizdami, umumiymi) boshliq belgilaydi. Qoidaga halol amal qiling.", ok: "Shubha bo'lsa — boshliqdan so'rang", no: "Umumiy choychaqani yashirmang" },
            { e: '⭐', h: 'Eng yaxshi choychaqa usuli', t: "Tez, e'tiborli va samimiy xizmat. Mehmonning ismini eslab qolish, choyni o'z vaqtida yangilash — choychaqani o'zi olib keladi.", ok: "Har bir mehmonga bir xil e'tibor", no: "Faqat \"boy\" ko'ringan mehmonga yugurmang" },
          ],
          quiz: [
            { q: "Choychaqa so'rash mumkinmi?", a: ["Ha, xizmat yaxshi bo'lsa", "Yo'q, hech qachon", "Faqat bayramda", "Ishora bilan mumkin"], c: 1, why: "Choychaqa — mehmonning ixtiyori." },
            { q: "Mehmon juda kam choychaqa qoldirdi. Siz?", a: ["Norozi qarayman", "Samimiy \"Rahmat\" deyman", "Qaytarib beraman", "Hamkasbga shikoyat qilaman"], c: 1, why: "Har qanday minnatdorchilik — minnatdorchilik." },
            { q: "Ko'proq choychaqa olishning to'g'ri yo'li?", a: ["So'rash", "Faqat boy mehmonlarga xizmat qilish", "Hammaga tez, samimiy xizmat", "Qaytimni bermaslik"], c: 2, why: "Yaxshi xizmat — eng ishonchli usul." },
          ],
        },
        {
          id: 'pay-4', title: 'Halollik',
          cards: [
            { e: '🤲', h: 'Har bir taom chekda', t: "Mehmonga berilgan har bir narsa — choy, non, taom — FLOWI'ga urilishi kerak. Urilmagan taom — o'g'irlik bilan teng.", ok: "Bepul narsani ham boshliq ruxsati bilan", no: "\"Tanishim\" deb chekka urmasdan bermang" },
            { e: '🔐', h: 'Login — shaxsiy', t: "FLOWI login va PIN-kodingizni hech kimga bermang. Sizning nomingizdan qilingan har bir amal sizniki hisoblanadi.", ok: "PIN ni boshqalar ko'rmasin", no: "Hamkasbingizga loginingizni bermang" },
            { e: '📊', h: 'Hammasi ko\'rinib turadi', t: "Bekor qilingan taomlar, o'chirilgan cheklar — boshliq hisobotida ko'rinadi. Halol ishlash — eng oson yo'l.", ok: "Xato bo'lsa — darhol ochiq ayting", no: "Xatoni yashirishga urinmang" },
          ],
          quiz: [
            { q: "Tanishingiz keldi, \"choy chekka urilmasin\" dedi. Siz?", a: ["Urmayman", "Uraman yoki boshliqdan ruxsat so'rayman", "Yarmini uraman", "Keyin uraman"], c: 1, why: "Har bir berilgan narsa hisobda bo'lishi kerak." },
            { q: "Hamkasbingiz loginingizni so'radi. Siz?", a: ["Beraman", "Bermayman — har kim o'z loginida ishlaydi", "Faqat bugun beraman", "PIN ni aytaman"], c: 1, why: "Sizning loginingizdagi har bir amal — sizning javobgarligingiz." },
            { q: "Bekor qilingan taomlarni boshliq ko'radimi?", a: ["Yo'q", "Ha, hisobotda ko'rinadi", "Faqat oy oxirida", "Faqat so'rasa"], c: 1, why: "FLOWI har bir amalni yozib boradi." },
          ],
        },
      ],
    },
  ],
};
