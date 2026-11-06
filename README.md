# 🚀 e'lonber.uz - Startap E'lonlar va Savdo Platformasi

**e'lonber.uz** — O'zbekistondagi zamonaviy, tezkor va xavfsiz e'lonlar va onlayn savdo veb-platformasi. Foydalanuvchilar o'z tovarlari yoki xizmatlarini bemalol reklama qilishi, xaridlar amalga oshirishi va administrator bilan real vaqtda bog'lanishi mumkin.

---

## 🌟 Asosiy Imkoniyatlar

1. **📱 Real vaqtda barcha qurilmalarda ko'rinish (Real-time Sync):**
   - Istalgan foydalanuvchi yangi e'lon qo'shsa yoki xarid qilsa, do'stining telefonida yoki boshqa brauzerda sahifani yangilamasdan (WebSocket orqali) darhol ko'rinadi.
   - Bir xil Wi-Fi tarmog'idagi telefon orqali mahalliy tarmoq IP manzili orqali ochish mumkin.

2. **👑 Bosh Administrator Maxsus Paneli:**
   - **Admin telefon raqami:** `+998 99-083-26-96`
   - Ushbu raqam kiritilganda **hech qanday SMS kod yoki parol talab qilinmaydi**, darhol Admin huquqi bilan tizimga kiritiladi!
   - Oddiy foydalanuvchilarga Admin paneli mutlaqo ko'rinmaydi.
   - **Foydalanuvchilarni kuzatish:** Har bir foydalanuvchining ism-familiyasi, telefoni, "Profili" tugmasi orqali u nima e'lon qo'yganini va nima sotib olganini ko'rish.
   - **🔒 PRO Qulfcha tizimi:**
     - Profil yonida agar PRO yo'q bo'lsa **Qizil qulfcha (🔒)** turadi (1 ta bepul e'lon).
     - Admin qizil qulfchani bossa, u darhol **Yashil qulfchaga (🔓)** aylanadi va foydalanuvchiga **5 ta bepul e'lon qo'yish imkoniyati** ochiladi!
   - **Adminga onlayn murojaatlar:** Foydalanuvchilar saytdan turib yozgan xabarlarga bevosita paneldan javob qaytarish.

3. **👤 Foydalanuvchilar uchun qulaylik:**
   - **Ro'yxatdan o'tish:** Telefon raqamini kiritganda 6 xonali SMS kod bildirishnomasi chiqadi, kod kiritilib ism-familiya va parol bilan ro'yxatdan o'tiladi.
   - **Boshqa telefondan kirish:** "Menda hisob bor (Kirish)" tugmasi orqali istalgan qurilmadan o'z username/telefoni va paroli orqali kirish mumkin.
   - **1 ta bepul e'lon limiti:** Har bir yangi foydalanuvchiga 1 ta bepul e'lon beriladi.
   - **⚡ PRO Versiya (2 000 so'm):** Sozlamalardan PRO sotib olish so'rovi yuborilganda adminga xabar boradi va admin tasdiqlagach 5 ta e'lon imkoni ochiladi.
   - **🛒 Savat va Xarid:** Mahsulotni savatga qo'shish va to'g'ridan-to'g'ri sotib olish.

4. **🎨 Zamonaviy Skromniy Dizayn:**
   - Nozik va chiroyli Glassmorphism (blur effektlari).
   - **🌙 Night mode (Tungi qora rejim)** va **☀️ Day mode (Kunduzgi toza rejim)** o'tkazgich.
   - Mobil moslashuvchan pastki navigatsiya paneli (Bottom Navigation Bar) va markazdagi ko'tarilgan **`+` (Plus)** e'lon berish tugmasi.

---

## 💻 Loyihani Ishga Tushirish

### 1-usul (Eng osoni):
Foydalanuvchi Ish stolidagi `e'lonber.uz` papkasiga kirib, **`start.bat`** faylini ikki marta bosing!
Avtomatik ravishda server ishga tushadi va brauzer ochiladi.

### 2-usul (Buyruqlar satri orqali):
```bash
npm start
```

Brauzerda ochish:
- Kompyuterda: `http://localhost:3000`
- Do'stingiz yoki o'zingizning telefoningizda (bir xil Wi-Fi bo'lsa): `http://192.168.100.156:3000`

---

## 📂 Fayllar Tuzilishi
- `server.js` - Express backend, WebSocket server, API va rasm yuklash.
- `public/index.html` - Asosiy veb-sahifa va barcha modallar.
- `public/css/style.css` - Glassmorphism, Night/Day mode stillari.
- `public/js/app.js` - Real-time e'lonlar, auth, savat va chat logikasi.
- `public/js/admin.js` - Admin paneli, foydalanuvchilar monitoringi, PRO qulfchalar.
- `data/` - users.json, listings.json, messages.json, orders.json (doimiy ma'lumotlar).
- `start.bat` - Bir marta bosishda ishga tushirish skripti.
