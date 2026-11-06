const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
const multer = require('multer');
const { WebSocketServer } = require('ws');
const cors = require('cors');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const UPLOAD_DIR = path.join(__dirname, 'public', 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Multer storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOAD_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    cb(null, 'photo-' + uniqueSuffix + ext);
  }
});
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// JSON Helpers
function readJson(filename) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    if (!fs.existsSync(filePath)) return [];
    const data = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Error reading JSON:', filename, err);
    return [];
  }
}

function writeJson(filename, data) {
  try {
    const filePath = path.join(DATA_DIR, filename);
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
    return true;
  } catch (err) {
    console.error('Error writing JSON:', filename, err);
    return false;
  }
}

// Active connections & Admin Online tracking
const activeClients = new Map(); // ws -> { userId, role }
let isGlobalAdminOnline = false;

function checkAdminOnlineStatus() {
  let found = false;
  for (const [_, info] of activeClients.entries()) {
    if (info && (info.role === 'admin' || info.userId === 'user_admin_001')) {
      found = true;
      break;
    }
  }
  if (isGlobalAdminOnline !== found) {
    isGlobalAdminOnline = found;
    broadcast('ADMIN_STATUS', { online: isGlobalAdminOnline });
  }
  return isGlobalAdminOnline;
}

// WebSocket broadcast
function broadcast(type, payload) {
  const message = JSON.stringify({ type, payload, timestamp: new Date() });
  wss.clients.forEach(client => {
    if (client.readyState === 1) { // OPEN
      client.send(message);
    }
  });
}

wss.on('connection', ws => {
  activeClients.set(ws, { userId: null, role: null });

  ws.send(JSON.stringify({
    type: 'WELCOME',
    message: "e'lonber.uz serveriga ulandingiz!",
    adminOnline: isGlobalAdminOnline
  }));

  ws.on('message', message => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'IDENTIFY') {
        activeClients.set(ws, { userId: data.userId, role: data.role });
        checkAdminOnlineStatus();
      }
    } catch (e) {
      console.error('WS message error:', e);
    }
  });

  ws.on('close', () => {
    activeClients.delete(ws);
    checkAdminOnlineStatus();
  });
});

// Admin phone helper
function normalizePhone(p) {
  if (!p) return '';
  return p.replace(/[\s\-\+\(\)]/g, '');
}
const ADMIN_PHONE_NORMALIZED = normalizePhone('+998 99-083-26-96'); // 998990832696

// --- STATUS API ---
app.get('/api/status/admin', (req, res) => {
  res.json({ online: isGlobalAdminOnline });
});

// --- AUTH API ---

// Foydalanuvchi hisob ochish / Ro'yxatdan o'tish
app.post('/api/auth/register', (req, res) => {
  const { username, fullName, phone, password } = req.body;
  if (!fullName || !phone || !password) {
    return res.status(400).json({ error: "Barcha maydonlarni to'ldiring!" });
  }

  const users = readJson('users.json');
  const cleanPhone = normalizePhone(phone);
  const userHandle = username ? username.trim().toLowerCase() : ('user_' + cleanPhone.slice(-4));

  // Check if phone already registered
  const exists = users.find(u => normalizePhone(u.phone) === cleanPhone);
  if (exists) {
    return res.status(400).json({ error: "Ushbu telefon raqami allaqachon ro'yxatdan o'tgan! 'Menda hisob bor (Kirish)' tugmasi orqali kiring." });
  }

  const isAdmin = cleanPhone === ADMIN_PHONE_NORMALIZED || userHandle === 'admin';

  const newUser = {
    id: 'user_' + Date.now(),
    username: userHandle,
    fullName: fullName.trim(),
    phone: phone.trim(),
    password: password,
    role: isAdmin ? 'admin' : 'user',
    pro: isAdmin ? true : false,
    maxAds: isAdmin ? 9999 : 1, // Standard 1 bepul e'lon
    createdAt: new Date().toISOString()
  };

  users.push(newUser);
  writeJson('users.json', users);

  broadcast('USER_REGISTERED', {
    id: newUser.id,
    fullName: newUser.fullName,
    phone: newUser.phone,
    pro: newUser.pro
  });

  res.json({
    success: true,
    user: {
      id: newUser.id,
      username: newUser.username,
      fullName: newUser.fullName,
      phone: newUser.phone,
      role: newUser.role,
      pro: newUser.pro,
      maxAds: newUser.maxAds
    }
  });
});

// Kirish (Login) - Parol bilan yoki Admin maxsus kirishi
app.post('/api/auth/login', (req, res) => {
  const { loginInput, password } = req.body;
  if (!loginInput) {
    return res.status(400).json({ error: "Telefon raqam yoki usernameni kiriting!" });
  }

  const cleanInput = normalizePhone(loginInput);
  const users = readJson('users.json');

  // ADMIN MAXSUS TEKSHIRUVI:
  if (cleanInput === ADMIN_PHONE_NORMALIZED || loginInput.trim().toLowerCase() === 'admin') {
    let adminUser = users.find(u => normalizePhone(u.phone) === ADMIN_PHONE_NORMALIZED || u.role === 'admin');
    if (!adminUser) {
      adminUser = {
        id: 'user_admin_001',
        username: 'admin',
        fullName: 'Bosh Administrator',
        phone: '+998 99-083-26-96',
        password: 'admin',
        role: 'admin',
        pro: true,
        maxAds: 9999,
        createdAt: new Date().toISOString()
      };
      users.push(adminUser);
      writeJson('users.json', users);
    }
    return res.json({
      success: true,
      message: "Xush kelibsiz, Hurmatli Bosh Administrator!",
      user: {
        id: adminUser.id,
        username: adminUser.username,
        fullName: adminUser.fullName,
        phone: adminUser.phone,
        role: 'admin',
        pro: true,
        maxAds: 9999
      }
    });
  }

  // Oddiy foydalanuvchi tekshiruvi
  const user = users.find(u => {
    return normalizePhone(u.phone) === cleanInput ||
           (u.username && u.username.toLowerCase() === loginInput.trim().toLowerCase());
  });

  if (!user) {
    return res.status(404).json({ error: "Foydalanuvchi topilmadi. Iltimos ro'yxatdan o'ting!" });
  }

  if (user.password !== password) {
    return res.status(401).json({ error: "Parol noto'g'ri kiritildi!" });
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      pro: user.pro || false,
      maxAds: user.maxAds || 1
    }
  });
});

// SMS kod orqali tezkor kirish (Telefon raqam bilan)
app.post('/api/auth/login-by-phone', (req, res) => {
  const { phone } = req.body;
  if (!phone) {
    return res.status(400).json({ error: "Telefon raqamini kiriting!" });
  }

  const cleanInput = normalizePhone(phone);
  const users = readJson('users.json');

  // Admin tekshiruvi
  if (cleanInput === ADMIN_PHONE_NORMALIZED) {
    let adminUser = users.find(u => normalizePhone(u.phone) === ADMIN_PHONE_NORMALIZED || u.role === 'admin');
    if (!adminUser) {
      adminUser = {
        id: 'user_admin_001',
        username: 'admin',
        fullName: 'Bosh Administrator',
        phone: '+998 99-083-26-96',
        password: 'admin',
        role: 'admin',
        pro: true,
        maxAds: 9999,
        createdAt: new Date().toISOString()
      };
      users.push(adminUser);
      writeJson('users.json', users);
    }
    return res.json({
      success: true,
      user: {
        id: adminUser.id,
        username: adminUser.username,
        fullName: adminUser.fullName,
        phone: adminUser.phone,
        role: 'admin',
        pro: true,
        maxAds: 9999
      }
    });
  }

  let user = users.find(u => normalizePhone(u.phone) === cleanInput);

  if (!user) {
    // Ro'yxatdan o'tmagan bo'lsa tezkor hisob ochiladi
    user = {
      id: 'user_' + Date.now(),
      username: 'user_' + cleanInput.slice(-4),
      fullName: 'Foydalanuvchi (' + phone.trim() + ')',
      phone: phone.trim(),
      password: 'PASS_' + cleanInput.slice(-4),
      role: 'user',
      pro: false,
      maxAds: 1,
      createdAt: new Date().toISOString()
    };
    users.push(user);
    writeJson('users.json', users);
  }

  res.json({
    success: true,
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      pro: user.pro || false,
      maxAds: user.maxAds || 1
    }
  });
});

// Joriy foydalanuvchi ma'lumotini yangilash
app.get('/api/auth/me/:userId', (req, res) => {
  const users = readJson('users.json');
  const user = users.find(u => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: "Topilmadi" });

  const listings = readJson('listings.json');
  const userAdsCount = listings.filter(l => l.userId === user.id).length;

  res.json({
    id: user.id,
    username: user.username,
    fullName: user.fullName,
    phone: user.phone,
    role: user.role,
    pro: user.pro,
    maxAds: user.maxAds || 1,
    currentAdsCount: userAdsCount
  });
});

// --- LISTINGS (E'lonlar) API ---

app.get('/api/listings', (req, res) => {
  let listings = readJson('listings.json');
  const { category, search, userId } = req.query;

  if (category && category !== 'all') {
    listings = listings.filter(l => l.category && l.category.toLowerCase() === category.toLowerCase());
  }

  if (search) {
    const q = search.toLowerCase();
    listings = listings.filter(l =>
      (l.title && l.title.toLowerCase().includes(q)) ||
      (l.description && l.description.toLowerCase().includes(q)) ||
      (l.city && l.city.toLowerCase().includes(q))
    );
  }

  if (userId) {
    listings = listings.filter(l => l.userId === userId);
  }

  listings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json(listings);
});

app.get('/api/listings/:id', (req, res) => {
  const listings = readJson('listings.json');
  const item = listings.find(l => l.id === req.params.id);
  if (!item) return res.status(404).json({ error: "E'lon topilmadi" });

  item.views = (item.views || 0) + 1;
  writeJson('listings.json', listings);
  res.json(item);
});

app.post('/api/listings', upload.single('photo'), (req, res) => {
  const { title, description, price, category, city, userId, authorName, authorPhone, imageUrl } = req.body;

  if (!title || !price || !userId) {
    return res.status(400).json({ error: "Sarlavha, narx va foydalanuvchi ko'rsatilishi shart!" });
  }

  const users = readJson('users.json');
  const user = users.find(u => u.id === userId);
  if (!user) {
    return res.status(401).json({ error: "Iltimos avval tizimga kiring!" });
  }

  const listings = readJson('listings.json');
  const userAds = listings.filter(l => l.userId === userId);
  const maxAds = user.maxAds || (user.pro ? 5 : 1);

  if (user.role !== 'admin' && userAds.length >= maxAds) {
    return res.status(403).json({
      error: `Sizning e'lon joylash limitingiz tugadi (${maxAds} ta). Ko'proq e'lon qo'yish uchun PRO versiyani faollashtiring (5 ta e'lon qo'shish imkoni)!`,
      limitReached: true,
      maxAds: maxAds,
      currentAds: userAds.length
    });
  }

  let finalImage = 'https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80';
  if (req.file) {
    finalImage = '/uploads/' + req.file.filename;
  } else if (imageUrl && imageUrl.trim()) {
    finalImage = imageUrl.trim();
  }

  const newAd = {
    id: 'ad_' + Date.now(),
    title: title.trim(),
    description: description ? description.trim() : '',
    price: parseFloat(price) || 0,
    category: category || 'Boshqa',
    city: city || 'Toshkent',
    image: finalImage,
    userId: user.id,
    authorName: authorName || user.fullName,
    authorPhone: authorPhone || user.phone,
    views: 1,
    createdAt: new Date().toISOString()
  };

  listings.unshift(newAd);
  writeJson('listings.json', listings);

  broadcast('NEW_LISTING', newAd);

  res.json({
    success: true,
    message: "E'loningiz muvaffaqiyatli chop etildi!",
    listing: newAd,
    remainingAds: Math.max(0, maxAds - (userAds.length + 1))
  });
});

app.delete('/api/listings/:id', (req, res) => {
  const { userId } = req.body;
  let listings = readJson('listings.json');
  const itemIndex = listings.findIndex(l => l.id === req.params.id);

  if (itemIndex === -1) {
    return res.status(404).json({ error: "E'lon topilmadi" });
  }

  const users = readJson('users.json');
  const user = users.find(u => u.id === userId);

  if (!user || (listings[itemIndex].userId !== userId && user.role !== 'admin')) {
    return res.status(403).json({ error: "Siz bu e'lonni o'chira olmaysiz!" });
  }

  const deletedItem = listings.splice(itemIndex, 1)[0];
  writeJson('listings.json', listings);

  broadcast('DELETE_LISTING', { id: deletedItem.id });

  res.json({ success: true, message: "E'lon muvaffaqiyatli o'chirildi" });
});

// --- CHAT VA XABARLAR TIZIMI (Dialoglar, O'qilmaganlar soni, Galochkalar) ---

// 1. Foydalanuvchi yoki Admin uchun o'qilmagan xabarlar soni
app.get('/api/messages/unread-counts/:userId', (req, res) => {
  const userId = req.params.userId;
  const messages = readJson('messages.json');
  const isAdmin = userId === 'admin' || userId === 'user_admin_001';

  let totalUnread = 0;
  const byPartner = {};

  messages.forEach(m => {
    // Agar xat adminga bo'lsa va joriy user admin bo'lsa
    const isForMe = isAdmin
      ? (m.receiverId === 'admin' || m.receiverId === 'user_admin_001')
      : (m.receiverId === userId);

    if (isForMe && !m.read) {
      totalUnread++;
      const partner = m.senderId;
      byPartner[partner] = (byPartner[partner] || 0) + 1;
    }
  });

  res.json({ totalUnread, byPartner });
});

// 2. Foydalanuvchi yoki Admin dialoglari ro'yxati (Har bir odam faqat BITTA bo'lib ko'rinadi)
app.get('/api/messages/dialogs/:userId', (req, res) => {
  const userId = req.params.userId;
  const isAdmin = userId === 'admin' || userId === 'user_admin_001';
  const messages = readJson('messages.json');
  const users = readJson('users.json');

  const dialogMap = new Map(); // partnerId -> dialog info

  // Barcha xabarlarni vaqti bo'yicha ko'rib chiqamiz
  messages.forEach(m => {
    let partnerId = null;
    let partnerName = null;
    let partnerPhone = null;

    if (isAdmin) {
      if (m.receiverId === 'admin' || m.receiverId === 'user_admin_001') {
        partnerId = m.senderId;
        partnerName = m.senderName;
        partnerPhone = m.senderPhone;
      } else if (m.senderId === 'admin' || m.senderId === 'user_admin_001') {
        partnerId = m.receiverId;
        partnerName = m.receiverName;
        partnerPhone = m.receiverPhone;
      }
    } else {
      if (m.senderId === userId) {
        partnerId = m.receiverId;
        partnerName = m.receiverName;
        partnerPhone = m.receiverPhone;
      } else if (m.receiverId === userId) {
        partnerId = m.senderId;
        partnerName = m.senderName;
        partnerPhone = m.senderPhone;
      }
    }

    if (!partnerId) return;

    // Partner ma'lumotlarini boyitish
    if (!partnerName || !partnerPhone) {
      const u = users.find(x => x.id === partnerId);
      if (u) {
        partnerName = partnerName || u.fullName;
        partnerPhone = partnerPhone || u.phone;
      } else if (partnerId === 'admin' || partnerId === 'user_admin_001') {
        partnerName = "Bosh Administrator";
        partnerPhone = "+998 99-083-26-96";
      }
    }

    const isUnread = (!m.read && ((isAdmin && (m.receiverId === 'admin' || m.receiverId === 'user_admin_001')) || m.receiverId === userId));

    const existing = dialogMap.get(partnerId);
    if (!existing) {
      dialogMap.set(partnerId, {
        partnerId,
        partnerName: partnerName || 'Foydalanuvchi',
        partnerPhone: partnerPhone || '',
        lastMessage: m.text,
        lastTime: m.createdAt,
        unreadCount: isUnread ? 1 : 0
      });
    } else {
      // Oxirgi xabar vaqtini yangilash
      if (new Date(m.createdAt) > new Date(existing.lastTime)) {
        existing.lastMessage = m.text;
        existing.lastTime = m.createdAt;
      }
      if (isUnread) {
        existing.unreadCount += 1;
      }
    }
  });

  const dialogs = Array.from(dialogMap.values());
  dialogs.sort((a, b) => new Date(b.lastTime) - new Date(a.lastTime));

  res.json(dialogs);
});

// 3. Ikki tomon o'rtasidagi to'liq xabarlar tarixi
app.get('/api/messages/dialog', (req, res) => {
  const { userId, partnerId } = req.query;
  if (!userId || !partnerId) {
    return res.status(400).json({ error: "userId va partnerId talab qilinadi" });
  }

  const messages = readJson('messages.json');
  const isAdmin = userId === 'admin' || userId === 'user_admin_001';
  const partnerIsAdmin = partnerId === 'admin' || partnerId === 'user_admin_001';

  const dialogMessages = messages.filter(m => {
    if (isAdmin) {
      return (m.senderId === partnerId && (m.receiverId === 'admin' || m.receiverId === 'user_admin_001')) ||
             ((m.senderId === 'admin' || m.senderId === 'user_admin_001') && m.receiverId === partnerId);
    } else if (partnerIsAdmin) {
      return (m.senderId === userId && (m.receiverId === 'admin' || m.receiverId === 'user_admin_001')) ||
             ((m.senderId === 'admin' || m.senderId === 'user_admin_001') && m.receiverId === userId);
    } else {
      return (m.senderId === userId && m.receiverId === partnerId) ||
             (m.senderId === partnerId && m.receiverId === userId);
    }
  });

  dialogMessages.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
  res.json(dialogMessages);
});

// 4. Yangi xabar yuborish (Adminga yoki boshqa foydalanuvchiga)
app.post('/api/messages/send', (req, res) => {
  const { senderId, senderName, senderPhone, receiverId, receiverName, receiverPhone, text, product } = req.body;

  if (!senderId || !receiverId || (!text && !product)) {
    return res.status(400).json({ error: "Xabar to'liq emas!" });
  }

  const messages = readJson('messages.json');
  const newMsg = {
    id: 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    senderId,
    senderName: senderName || 'Foydalanuvchi',
    senderPhone: senderPhone || '',
    receiverId,
    receiverName: receiverName || 'Suhbatdosh',
    receiverPhone: receiverPhone || '',
    text: text ? text.trim() : '',
    product: product || null,
    read: false,
    readAt: null,
    createdAt: new Date().toISOString()
  };

  messages.push(newMsg);
  writeJson('messages.json', messages);

  // Real-time broadcast
  broadcast('NEW_CHAT_MESSAGE', newMsg);

  res.json({ success: true, message: newMsg });
});

// 5. Xabarlarni o'qildi deb belgilash (✓ -> ✓✓ ga aylanishi uchun)
app.post('/api/messages/mark-read', (req, res) => {
  const { userId, partnerId } = req.body;
  if (!userId || !partnerId) return res.status(400).json({ error: "Parametrlar yetarli emas" });

  const messages = readJson('messages.json');
  const isAdmin = userId === 'admin' || userId === 'user_admin_001';
  let markedCount = 0;

  messages.forEach(m => {
    const isTarget = isAdmin
      ? (m.senderId === partnerId && (m.receiverId === 'admin' || m.receiverId === 'user_admin_001'))
      : (m.senderId === partnerId && m.receiverId === userId);

    if (isTarget && !m.read) {
      m.read = true;
      m.readAt = new Date().toISOString();
      markedCount++;
    }
  });

  if (markedCount > 0) {
    writeJson('messages.json', messages);
    broadcast('MESSAGES_READ', { readerId: userId, partnerId });
  }

  res.json({ success: true, markedCount });
});

// 6. SAVAT / MAHSULOTNI SOTIB OLISH (To'g'ridan-to'g'ri egasining chatiga olib o'tish)
app.post('/api/cart/buy', (req, res) => {
  const { userId, listingId, note } = req.body;
  if (!userId || !listingId) {
    return res.status(400).json({ error: "userId va listingId talab qilinadi" });
  }

  const users = readJson('users.json');
  const buyer = users.find(u => u.id === userId);
  if (!buyer) return res.status(404).json({ error: "Xaridor topilmadi" });

  const listings = readJson('listings.json');
  const listing = listings.find(l => l.id === listingId);
  if (!listing) return res.status(404).json({ error: "Mahsulot topilmadi" });

  // O'z mahsulotini o'zi sotib ololmaydi
  if (listing.userId === buyer.id) {
    return res.status(400).json({ error: "Bu sizning o'z e'loningiz!" });
  }

  const seller = users.find(u => u.id === listing.userId) || {
    id: listing.userId,
    fullName: listing.authorName || 'Sotuvchi',
    phone: listing.authorPhone || ''
  };

  const productData = {
    id: listing.id,
    title: listing.title,
    price: listing.price,
    image: listing.image,
    city: listing.city || 'Toshkent'
  };

  const initialText = note
    ? `Assalomu alaykum! Men "${listing.title}" mahsulotingizni sotib olmoqchiman.\nIzoh: ${note}`
    : `Assalomu alaykum! Men sizning "${listing.title}" mahsulotingizni sotib olmoqchiman. Iltimos narxi va yetkazib berish haqida ma'lumot bersangiz.`;

  // Xabarlar ro'yxatiga avtomatik kiritish
  const messages = readJson('messages.json');
  const newMsg = {
    id: 'msg_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    senderId: buyer.id,
    senderName: buyer.fullName,
    senderPhone: buyer.phone,
    receiverId: seller.id,
    receiverName: seller.fullName,
    receiverPhone: seller.phone,
    text: initialText,
    product: productData,
    read: false,
    readAt: null,
    createdAt: new Date().toISOString()
  };

  messages.push(newMsg);
  writeJson('messages.json', messages);

  // Buyurtmalarga ham qayd etish
  const orders = readJson('orders.json');
  orders.unshift({
    id: 'ord_' + Date.now(),
    userId: buyer.id,
    userName: buyer.fullName,
    sellerId: seller.id,
    sellerName: seller.fullName,
    items: [{ id: listing.id, title: listing.title, price: listing.price, quantity: 1 }],
    totalAmount: listing.price,
    status: 'Sotuvchi bilan chatda kelishilmoqda',
    createdAt: new Date().toISOString()
  });
  writeJson('orders.json', orders);

  // Broadcast
  broadcast('NEW_CHAT_MESSAGE', newMsg);

  res.json({
    success: true,
    message: "Xarid so'rovingiz mahsulot egasiga yuborildi va sotuvchi bilan chat ochildi!",
    partner: {
      id: seller.id,
      fullName: seller.fullName,
      phone: seller.phone
    },
    product: productData
  });
});

// PRO versiya sotib olish so'rovi (Sozlamalar bo'limidan)
app.post('/api/pro/request', (req, res) => {
  const { userId } = req.body;
  const users = readJson('users.json');
  const user = users.find(u => u.id === userId);
  if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

  const messages = readJson('messages.json');
  const proRequestMsg = {
    id: 'msg_pro_' + Date.now(),
    senderId: user.id,
    senderName: user.fullName,
    senderPhone: user.phone,
    receiverId: 'admin',
    receiverName: 'Bosh Administrator',
    receiverPhone: '+998 99-083-26-96',
    text: `⚡ PRO VERSIYA SO'ROVI: Foydalanuvchi ${user.fullName} (${user.phone}) 2 000 so'mlik PRO tarifni faollashtirishni so'ramoqda (5 ta bepul e'lon).`,
    read: false,
    readAt: null,
    createdAt: new Date().toISOString()
  };

  messages.push(proRequestMsg);
  writeJson('messages.json', messages);

  broadcast('NEW_CHAT_MESSAGE', proRequestMsg);

  res.json({
    success: true,
    message: "PRO so'rovingiz adminga yuborildi! Admin tasdiqlashi bilan profilingizdagi qulfcha yashil rangga aylanadi va 5 ta bepul e'lon qo'shish imkoni beriladi."
  });
});

// --- ADMIN PANELI API ---

app.get('/api/admin/stats', (req, res) => {
  const users = readJson('users.json');
  const listings = readJson('listings.json');
  const messages = readJson('messages.json');
  const orders = readJson('orders.json');

  const proUsersCount = users.filter(u => u.pro).length;
  const unreadMessages = messages.filter(m => (m.receiverId === 'admin' || m.receiverId === 'user_admin_001') && !m.read).length;

  res.json({
    totalUsers: users.length,
    proUsersCount: proUsersCount,
    totalListings: listings.length,
    totalOrders: orders.length,
    pendingMessages: unreadMessages
  });
});

app.get('/api/admin/users', (req, res) => {
  const users = readJson('users.json');
  const listings = readJson('listings.json');
  const orders = readJson('orders.json');

  const detailedUsers = users.map(u => {
    const userAds = listings.filter(l => l.userId === u.id);
    const userOrders = orders.filter(o => o.userId === u.id);
    return {
      id: u.id,
      username: u.username,
      fullName: u.fullName,
      phone: u.phone,
      role: u.role,
      pro: u.pro || false,
      maxAds: u.maxAds || (u.pro ? 5 : 1),
      adsCount: userAds.length,
      ordersCount: userOrders.length,
      createdAt: u.createdAt
    };
  });

  res.json(detailedUsers);
});

app.get('/api/admin/users/:userId/details', (req, res) => {
  const users = readJson('users.json');
  const user = users.find(u => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

  const listings = readJson('listings.json');
  const orders = readJson('orders.json');

  const userAds = listings.filter(l => l.userId === user.id);
  const userOrders = orders.filter(o => o.userId === user.id);

  res.json({
    user: {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      phone: user.phone,
      role: user.role,
      pro: user.pro || false,
      maxAds: user.maxAds || (user.pro ? 5 : 1),
      createdAt: user.createdAt
    },
    listings: userAds,
    orders: userOrders
  });
});

app.post('/api/admin/users/:userId/toggle-pro', (req, res) => {
  const users = readJson('users.json');
  const user = users.find(u => u.id === req.params.userId);
  if (!user) return res.status(404).json({ error: "Foydalanuvchi topilmadi" });

  user.pro = !user.pro;
  if (user.pro) {
    user.maxAds = 5;
  } else {
    user.maxAds = 1;
  }

  writeJson('users.json', users);

  broadcast('USER_PRO_UPDATED', {
    userId: user.id,
    pro: user.pro,
    maxAds: user.maxAds,
    message: user.pro
      ? `Tabriklaymiz! Sizga PRO tarif berildi. Endi siz 5 tagacha e'lon joylay olasiz!`
      : `PRO status yangilandi.`
  });

  res.json({
    success: true,
    pro: user.pro,
    maxAds: user.maxAds,
    message: user.pro
      ? `${user.fullName} foydalanuvchisiga PRO berildi (Yashil qulfcha 🔓, 5 ta bepul e'lon)`
      : `${user.fullName} PRO bekor qilindi (Qizil qulfcha 🔒, 1 ta e'lon)`
  });
});

function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

// Self Keep-Alive Bot (Render.com bepul rejimida server uxlamasligi uchun)
const PING_INTERVAL_MS = 10 * 60 * 1000; // Har 10 daqiqada
function initKeepAliveBot() {
  const renderUrl = process.env.RENDER_EXTERNAL_URL;
  if (renderUrl) {
    console.log(`🤖 Uyg'otuvchi robot faollashdi: ${renderUrl} har 10 daqiqada uyg'otib turiladi.`);
    setInterval(() => {
      const client = renderUrl.startsWith('https') ? require('https') : require('http');
      client.get(`${renderUrl}/api/status/admin`, (res) => {
        console.log(`🤖 Robot saytni uyg'oq ushlab turdi. Status: ${res.statusCode}`);
      }).on('error', (e) => {
        console.warn('Robot ping:', e.message);
      });
    }, PING_INTERVAL_MS);
  }
}

function startServer(portToUse) {
  server.listen(portToUse, '0.0.0.0', () => {
    const localIp = getLocalIp();
    console.log(`====================================================`);
    console.log(`🚀 e'lonber.uz platformasi muvaffaqiyatli ishga tushdi!`);
    console.log(`💻 Kompyuter brauzerida ochish: http://localhost:${portToUse}`);
    console.log(`📱 Telefonda (bir xil Wi-Fi) ochish: http://${localIp}:${portToUse}`);
    console.log(`====================================================`);
    initKeepAliveBot();
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${portToUse} band, keyingi ${portToUse + 1} port sinab ko'rilmoqda...`);
      setTimeout(() => {
        startServer(portToUse + 1);
      }, 500);
    } else {
      console.error('Server error:', err);
    }
  });
}

startServer(PORT);
