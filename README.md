# Maktab sayti - admin panel

Mavjud statik sayt (HTML/CSS/JS) ustiga qo'shilgan backend va boshqaruv paneli.
Admin panel orqali sayt **istalgan matnni, rasmni, havolani va yozuv animatsiyasini** o'zgartirishingiz mumkin.
Hech narsani kodga qo'lda kirmasdan, brauzerdan tahrirlaysiz.

## Talablar

- Node.js 18 yoki undan yangi versiya

## O'rnatish va ishga tushirish

```bash
npm install
ADMIN_USER=admin ADMIN_PASSWORD="kuchli-parol-123" npm start
```

Tarjima lug'atlarini yangilash: `npm run build-i18n`

- Sayt:            http://localhost:3000/
- Admin panel:     http://localhost:3000/admin/

`ADMIN_PASSWORD` berilmasa, birinchi ishga tushirishda parol konsolga chiqariladi (uni saqlab qo'ying).
Admin hisobi `data/admin.json` faylida saqlanadi (parol bcrypt bilan shifrlangan).

## Admin panelda nima qilish mumkin

- **Sahifalar ro'yxati** - chapda barcha sahifalar; qaysi blokda o'zgarish borligi ko'rsatiladi.
- **Matn** - istalgan sarlavha, paragraf, menyu yoki tugma matnini tahrirlash (HTML teglar: `<strong>`, `<br>`).
- **Rasm** - "Rasmni almashtirish" tugmasi orqali rasm kutubxonasidan tanlash yoki yangi rasm yuklash.
  JPG, PNG, GIF, WEBP qabul qilinadi (10 MB gacha). Fayl haqiqatan rasm ekani tekshiriladi.
- **Havola** - telefon (`tel:+998...`), email (`mailto:`), ijtimoiy tarmoq va sahifa manzillari.
- **Animatsiya** - yozilib boriladigan matnlar (Typed.js). Har qator alohida jumla bo'ladi.
- **Asliga qaytarish** - har qanday o'zgarishni bir bosishda asl holatga qaytarish.
- **Qidiruv va filtr** - matn, rasm, havola yoki animatsiya bo'yicha.

Har bir saqlash darhol saytda ko'rinadi (keshlanmaydi).

## Qanday ishlaydi

1. `npm run annotate` (bir marta, allaqachon bajarilgan) HTML fayllarga tahrirlanadigan joylarni belgiladi:
   `<img data-edit="index.html:i-001">`, `<h1 data-edit="navs/team.html:t-004">`, `<a data-edit-href="...">` va hokazo.
2. Asl HTML fayllar o'zgarmaydi. Admin panelda kiritilgan qiymatlar `data/content.json` da saqlanadi.
3. Server sahifani so'rov kelganda o'qiydi va saqlangan qiymatlarni qo'yib yuboradi.

Shu sababli, sayt fayllarini yangilasangiz ham, admin panelda kiritilgan o'zgarishlar saqlanib qoladi.

## Tillar (uz / ru / en)

- O'zbekcha - asosiy til, manzil: `/` (masalan `/navs/team.html`)
- Ruscha - `/ru/` (masalan `/ru/navs/team.html`)
- Inglizcha - `/en/` (masalan `/en/navs/team.html`)

Har bir sahifada yuqori menyuda UZ | RU | EN havolalari bor.

Tarjimalar:
- `i18n/source.js` - barcha matnlar uchun asl o'zbekcha matn, ruscha va inglizcha tarjima jadvali.
- `npm run build-i18n` - shu jadvaldan `i18n/ru.json` va `i18n/en.json` ni yaratadi (matn saytdagi asl matn bilan mos kelishini tekshiradi).
  Yangi matn qo'shsangiz, `source.js` ga qator qo'shing va buyruqni qayta ishga tushiring.

Admin panelda yuqoridagi UZ / RU / EN tablar orqali har bir tilni alohida tahrirlaysiz.
Tarjimasi yo'q matn o'zbekcha yoki standart tarjimada ko'rinadi. Admin tomonidan kiritilgan matn har doim standart tarjimadan ustun turadi.
Rasm va havolalar tildan mustaqil emas: har bir til uchun alohida saqlanadi (ruscha sahifada rasm almashtirsangiz, u faqat ruscha sahifada o'zgaradi).

## Parolni o'zgartirish

- Admin panelning "Parolni o'zgartirish" tugmasi orqali, yoki
- Terminaldan: `npm run set-password -- "yangiParol123"`

## Serverga joylashtirish (production)

- HTTPS bo'lsa: `COOKIE_SECURE=1`
- Nginx yoki boshqa proksi orqasida ishlasa: `TRUST_PROXY=1`
- Sessiya kalitini o'zingiz belgilang: `SESSION_SECRET=uzun-tasodifiy-matn`
- Jarayonni doimiy ishlatish uchun PM2 yoki systemd tavsiya etiladi.
- Zaxira: `data/` papkasi (o'zgarishlar va admin hisobi) va `site/uploads/` papkasi (yuklangan rasmlar).

## Cheklovlar

- CSS yoki JavaScript ichidagi fon rasmlari (`background-image`) va JS ichidagi matnlar admin paneldan tahrirlanmaydi.
- Yangi bo'lim yoki yangi sahifa qo'shish uchun HTML kodiga o'zgartirish kerak. Keyin `npm run annotate` ni ishga tushiring (u faqat belgilanmagan fayllarga ishlaydi).
- HTML tuzilmasini (elementlar tartibini) o'zgartirsangiz, ba'zi kalitlar o'zgarishi mumkin. Bunday holatda `data/content.json` faylini tekshiring.
- Sessiyalar xotirada saqlanadi: server qayta ishga tushsa, admin qayta kirishi kerak.
- Bitta admin hisobi qo'llab-quvvatlanadi.
- Admin ishonchli foydalanuvchi deb hisoblanadi. Kiritilgan HTML'dan skript, iframe va `on*` atributlari olib tashlanadi, lekin bu to'liq himoya emas.

## Fayllar tuzilishi

```
server.js              Express server, admin API, sahifalarni render qilish
lib/site.js            HTML o'qish, bloklarni yig'ish, qiymatlarni qo'yish
lib/store.js           data/content.json bilan ishlash
lib/auth.js            Admin login va parol
scripts/annotate.js    HTML fayllarga data-edit belgilarini qo'yish (bir marta)
scripts/set-password.js Parolni terminaldan o'zgartirish
admin/                 Admin panel (index.html, app.js, style.css)
site/                  Maktab sayti (frontend)
site/uploads/          Admin orqali yuklangan rasmlar
data/                  Kontent va admin ma'lumotlari (avtomatik yaratiladi)
```
