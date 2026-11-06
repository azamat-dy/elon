// ===================================================
// e'lonber.uz - Asosiy Ilova Skripti (app.js)
// Real-time WebSockets, Xavfsiz Sessiya (Session Persistence),
// Ko'p dialogli Chat tizimi, Galochkalar (✓ va ✓✓),
// Admin Online/Offline holati, Sotuvchi bilan to'g'ridan-to'g'ri xarid
// ===================================================

const STATE = {
  currentUser: null,
  listings: [],
  cart: [],
  currentCategory: 'all',
  searchQuery: '',
  simulatedSmsCode: null,
  ws: null,
  activePartnerId: 'admin',
  activePartnerName: 'Bosh Administrator',
  activePartnerPhone: '',
  dialogs: [],
  isAdminOnline: false
};

// --- INITIALIZATION ---
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  loadStoredUser();
  initWebSocket();
  fetchListings();
  updateCartBadge();
  checkAdminStatus();

  // Har 5 soniyada unread xabarlarni yangilash
  setInterval(() => {
    if (STATE.currentUser) {
      updateUnreadBadges();
    }
  }, 5000);
});

// --- THEME (Night Mode / Day Mode) ---
function initTheme() {
  const savedTheme = localStorage.getItem('elonber_theme');
  if (savedTheme === 'dark') {
    document.body.classList.add('dark-mode');
    updateThemeUI(true);
  } else {
    document.body.classList.remove('dark-mode');
    updateThemeUI(false);
  }
}

function toggleTheme() {
  const isDark = document.body.classList.toggle('dark-mode');
  localStorage.setItem('elonber_theme', isDark ? 'dark' : 'light');
  updateThemeUI(isDark);
  showToast(isDark ? "🌙 Tungi rejim yoqildi" : "☀️ Kunduzgi rejim yoqildi");
}

function updateThemeUI(isDark) {
  const icon = document.getElementById('themeIcon');
  const label = document.getElementById('themeToggleLabel');
  const modeLabel = document.getElementById('themeModeLabel');

  if (icon) icon.innerText = isDark ? '☀️' : '🌙';
  if (label) label.innerText = isDark ? '☀️ Kunduzgi rejim' : '🌙 Tungi rejim';
  if (modeLabel) modeLabel.innerText = isDark ? 'Tungi rejim faol' : 'Kunduzgi rejim faol';
}

// --- WEBSOCKET REAL-TIME SYNC ---
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;

  try {
    STATE.ws = new WebSocket(wsUrl);

    STATE.ws.onopen = () => {
      // Identifikatsiya
      if (STATE.currentUser) {
        STATE.ws.send(JSON.stringify({
          type: 'IDENTIFY',
          userId: STATE.currentUser.id,
          role: STATE.currentUser.role
        }));
      }
    };

    STATE.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        handleRealtimeEvent(data);
      } catch (e) {
        console.error('WS parse error:', e);
      }
    };

    STATE.ws.onclose = () => {
      setTimeout(initWebSocket, 3000);
    };
  } catch (err) {
    console.warn('WebSocket connection error:', err);
  }
}

function handleRealtimeEvent(data) {
  if (data.type === 'WELCOME') {
    if (typeof data.adminOnline !== 'undefined') {
      STATE.isAdminOnline = data.adminOnline;
      updateAdminStatusUI();
    }
  }

  if (data.type === 'ADMIN_STATUS') {
    STATE.isAdminOnline = data.payload.online;
    updateAdminStatusUI();
  }

  if (data.type === 'NEW_LISTING') {
    showToast(`🔔 Yangi e'lon: "${data.payload.title}"`);
    fetchListings();
  }

  if (data.type === 'DELETE_LISTING') {
    fetchListings();
  }

  if (data.type === 'USER_PRO_UPDATED') {
    if (STATE.currentUser && STATE.currentUser.id === data.payload.userId) {
      STATE.currentUser.pro = data.payload.pro;
      STATE.currentUser.maxAds = data.payload.maxAds;
      localStorage.setItem('elonber_user', JSON.stringify(STATE.currentUser));
      updateUserUI();
      showToast(data.payload.message);
    }
  }

  // Yangi chat xabari kelganda
  if (data.type === 'NEW_CHAT_MESSAGE') {
    const msg = data.payload;
    if (!STATE.currentUser) return;

    const isForMe = (STATE.currentUser.role === 'admin' && (msg.receiverId === 'admin' || msg.receiverId === 'user_admin_001')) ||
                    (msg.receiverId === STATE.currentUser.id);

    if (isForMe) {
      showToast(`💬 ${msg.senderName}dan yangi xabar!`);
      updateUnreadBadges();

      // Agar ayni shu suhbat ochiq bo'lsa
      if (document.getElementById('chatModal').classList.contains('open') &&
          (STATE.activePartnerId === msg.senderId || (STATE.activePartnerId === 'admin' && (msg.senderId === 'admin' || msg.senderId === 'user_admin_001')))) {
        loadActiveDialogMessages();
      } else {
        loadDialogsList();
      }

      // Agar admin paneli ochiq bo'lsa
      if (typeof handleAdminNewMessage === 'function') {
        handleAdminNewMessage(msg);
      }
    }
  }

  // Xabarlar o'qilganda (Galochkalar ✓ -> ✓✓)
  if (data.type === 'MESSAGES_READ') {
    if (STATE.currentUser && (STATE.currentUser.id === data.payload.partnerId || (STATE.currentUser.role === 'admin' && data.payload.partnerId === 'admin'))) {
      if (document.getElementById('chatModal').classList.contains('open')) {
        loadActiveDialogMessages();
      }
    }
    if (typeof loadAdminActiveDialogMessages === 'function') {
      loadAdminActiveDialogMessages();
    }
  }
}

// Admin online statusini tekshirish
async function checkAdminStatus() {
  try {
    const res = await fetch('/api/status/admin');
    if (res.ok) {
      const data = await res.json();
      STATE.isAdminOnline = data.online;
      updateAdminStatusUI();
    }
  } catch (e) {}
}

function updateAdminStatusUI() {
  const statusEl = document.getElementById('chatPartnerStatus');
  const textEl = document.getElementById('chatPartnerStatusText');

  if (STATE.activePartnerId === 'admin' || STATE.activePartnerId === 'user_admin_001') {
    if (statusEl && textEl) {
      if (STATE.isAdminOnline) {
        statusEl.className = 'status-indicator online';
        textEl.innerText = 'Online';
      } else {
        statusEl.className = 'status-indicator offline';
        textEl.innerText = 'Offline';
      }
    }
  }
}

// --- AUTH & DOIMIY SESSIYA (SESSION PERSISTENCE) ---

function loadStoredUser() {
  const stored = localStorage.getItem('elonber_user');
  if (stored) {
    try {
      STATE.currentUser = JSON.parse(stored);
      updateUserUI();
      // Serverdan ham ma'lumotlarni yangilaymiz, ammo agar server xato bersa ham currentUser saqlanib qoladi!
      refreshUserData();
    } catch (e) {
      console.error('Session parse error:', e);
    }
  } else {
    updateUserUI();
  }
}

async function refreshUserData() {
  if (!STATE.currentUser || !STATE.currentUser.id) return;
  try {
    const res = await fetch(`/api/auth/me/${STATE.currentUser.id}`);
    if (res.ok) {
      const updated = await res.json();
      STATE.currentUser = { ...STATE.currentUser, ...updated };
      localStorage.setItem('elonber_user', JSON.stringify(STATE.currentUser));
      updateUserUI();
    }
  } catch (e) {
    // Xato bo'lsa hech narsa qilinmaydi, sessiya saqlanib qoladi!
  }
}

function updateUserUI() {
  const authHeaderWrap = document.getElementById('authHeaderWrap');
  const adminHeaderBtn = document.getElementById('adminHeaderBtn');
  const userProBanner = document.getElementById('userProStatusBanner');
  const settingsUserName = document.getElementById('settingsUserName');
  const settingsUserPhone = document.getElementById('settingsUserPhone');
  const settingsAdsLimit = document.getElementById('settingsAdsLimit');
  const settingsLockBadge = document.getElementById('settingsLockBadge');
  const logoutBtn = document.getElementById('logoutBtn');
  const btnBuyPro = document.getElementById('btnBuyPro');

  if (STATE.currentUser) {
    const u = STATE.currentUser;
    const isPro = u.pro || u.role === 'admin';

    authHeaderWrap.innerHTML = `
      <div style="display: flex; align-items: center; gap: 8px;">
        <span style="font-size: 13px; font-weight: 700;">${escapeHtml(u.fullName.split(' ')[0])}</span>
        ${isPro ? '<span class="badge-pro">PRO ⚡</span>' : ''}
      </div>
    `;

    if (u.role === 'admin') {
      adminHeaderBtn.style.display = 'inline-flex';
    } else {
      adminHeaderBtn.style.display = 'none';
    }

    if (settingsUserName) settingsUserName.innerText = u.fullName + (u.role === 'admin' ? ' (Admin)' : '');
    if (settingsUserPhone) settingsUserPhone.innerText = u.phone;
    if (settingsAdsLimit) {
      const maxCount = u.maxAds || (isPro ? 5 : 1);
      settingsAdsLimit.innerText = `E'lon limitingiz: ${maxCount} ta ${isPro ? '(PRO faol)' : '(Bepul)'}`;
    }

    if (settingsLockBadge) {
      if (isPro) {
        settingsLockBadge.innerText = '🔓 PRO Faol (5 ta e\'lon)';
        settingsLockBadge.style.background = 'var(--success-color)';
        if (btnBuyPro) btnBuyPro.style.display = 'none';
      } else {
        settingsLockBadge.innerText = '🔒 PRO Yo\'q (1 ta e\'lon)';
        settingsLockBadge.style.background = 'var(--danger-color)';
        if (btnBuyPro) btnBuyPro.style.display = 'block';
      }
    }

    if (userProBanner) {
      userProBanner.style.display = (!isPro && u.role !== 'admin') ? 'block' : 'none';
    }

    if (logoutBtn) logoutBtn.style.display = 'block';

    updateUnreadBadges();
  } else {
    authHeaderWrap.innerHTML = `
      <button class="btn-header" onclick="openAuthModal('login')">
        <span>👤</span>
        <span>Kirish</span>
      </button>
    `;
    adminHeaderBtn.style.display = 'none';
    if (userProBanner) userProBanner.style.display = 'none';
    if (settingsUserName) settingsUserName.innerText = 'Mehmon (Kirilmagan)';
    if (settingsUserPhone) settingsUserPhone.innerText = 'E\'lon joylash uchun hisobingizga kiring';
    if (settingsAdsLimit) settingsAdsLimit.innerText = 'E\'lon limitingiz: 1 ta bepul';
    if (logoutBtn) logoutBtn.style.display = 'none';
  }
}

// O'qilmagan xabarlar soni (Qizil dumaloq nishonchalar)
async function updateUnreadBadges() {
  if (!STATE.currentUser) return;
  const targetId = STATE.currentUser.role === 'admin' ? 'admin' : STATE.currentUser.id;

  try {
    const res = await fetch(`/api/messages/unread-counts/${targetId}`);
    if (!res.ok) return;
    const data = await res.json();

    const chatBadge = document.getElementById('chatBadge');
    if (chatBadge) {
      if (data.totalUnread > 0) {
        chatBadge.innerText = data.totalUnread;
        chatBadge.style.display = 'flex';
      } else {
        chatBadge.style.display = 'none';
      }
    }

    // Admin uchun
    const adminHeaderUnread = document.getElementById('adminHeaderUnread');
    const adminTabUnread = document.getElementById('adminTabUnread');
    if (STATE.currentUser.role === 'admin') {
      if (adminHeaderUnread) {
        if (data.totalUnread > 0) {
          adminHeaderUnread.innerText = data.totalUnread;
          adminHeaderUnread.style.display = 'inline-block';
        } else {
          adminHeaderUnread.style.display = 'none';
        }
      }
      if (adminTabUnread) {
        if (data.totalUnread > 0) {
          adminTabUnread.innerText = data.totalUnread;
          adminTabUnread.style.display = 'inline-block';
        } else {
          adminTabUnread.style.display = 'none';
        }
      }
    }
  } catch (e) {}
}

function openAuthModal(tab = 'register') {
  switchAuthTab(tab);
  openModal('authModal');
}

function switchAuthTab(tab) {
  const regBtn = document.getElementById('tabRegisterBtn');
  const logBtn = document.getElementById('tabLoginBtn');
  const regSec = document.getElementById('authRegisterSection');
  const logSec = document.getElementById('authLoginSection');

  if (tab === 'register') {
    regBtn.classList.add('active');
    logBtn.classList.remove('active');
    regSec.style.display = 'block';
    logSec.style.display = 'none';
  } else {
    logBtn.classList.add('active');
    regBtn.classList.remove('active');
    logSec.style.display = 'block';
    regSec.style.display = 'none';
  }
}

// 1-QADAM: SMS kod olish
function proceedRegStep1() {
  const phone = document.getElementById('regPhone').value.trim();
  if (!phone || phone.length < 9) {
    alert("Iltimos, to'g'ri telefon raqamingizni kiriting!");
    return;
  }

  const clean = phone.replace(/[\s\-\+\(\)]/g, '');
  if (clean === '998990832696' || clean === '990832696') {
    showToast("👑 Xush kelibsiz, Hurmatli Administrator!");
    performAdminLogin();
    return;
  }

  STATE.simulatedSmsCode = Math.floor(100000 + Math.random() * 900000).toString();

  const modalCodeEl = document.getElementById('modalSmsCodeText');
  if (modalCodeEl) modalCodeEl.innerText = STATE.simulatedSmsCode;

  const regCodeInput = document.getElementById('regCode');
  if (regCodeInput) regCodeInput.value = STATE.simulatedSmsCode;

  document.getElementById('regStep1').style.display = 'none';
  document.getElementById('regStep2').style.display = 'block';

  showToast(`📲 SMS tasdiqlash kodingiz: ${STATE.simulatedSmsCode}`);
}

function autoFillSms() {
  if (STATE.simulatedSmsCode) {
    document.getElementById('regCode').value = STATE.simulatedSmsCode;
    showToast("SMS kod kiritildi!");
  }
}

function backToRegStep1() {
  document.getElementById('regStep1').style.display = 'block';
  document.getElementById('regStep2').style.display = 'none';
}

// 2-QADAM: Ro'yxatdan o'tishni yakunlash
async function submitRegistration() {
  const phone = document.getElementById('regPhone').value.trim();
  const code = document.getElementById('regCode').value.trim();
  const fullName = document.getElementById('regFullName').value.trim();
  const username = document.getElementById('regUsername').value.trim();
  const password = document.getElementById('regPassword').value.trim();

  if (!code || code !== STATE.simulatedSmsCode) {
    alert("SMS kod noto'g'ri kiritildi!");
    return;
  }
  if (!fullName || !password) {
    alert("Ism-familiya va parolni kiriting!");
    return;
  }

  try {
    const res = await fetch('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, fullName, username, password })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Xatolik yuz berdi");
      return;
    }

    STATE.currentUser = data.user;
    localStorage.setItem('elonber_user', JSON.stringify(data.user));

    closeModal('authModal');
    updateUserUI();
    showToast(`🎉 Xush kelibsiz, ${data.user.fullName}!`);
  } catch (err) {
    alert("Xatolik: " + err.message);
  }
}

// KIRISH (LOGIN)
let loginIsSmsMode = false;
let loginSimulatedCode = null;

function handleLoginInput(val) {
  const clean = val.replace(/[\s\-\+\(\)]/g, '');
  const passGroup = document.getElementById('loginPasswordGroup');
  const btnSubmit = document.getElementById('btnLoginSubmit');
  const btnToggle = document.getElementById('btnToggleLoginMode');

  if (clean === '998990832696' || clean === '990832696') {
    if (passGroup) passGroup.style.display = 'none';
    if (btnToggle) btnToggle.style.display = 'none';
    if (btnSubmit) btnSubmit.innerText = "👑 Administrator sifatida kirish";
  } else {
    if (!loginIsSmsMode && passGroup) passGroup.style.display = 'block';
    if (btnToggle) btnToggle.style.display = 'block';
    if (btnSubmit) btnSubmit.innerText = loginIsSmsMode ? "Tasdiqlash va Kirish" : "Kirish";
  }
}

function toggleLoginSmsMode() {
  const phone = document.getElementById('loginInput').value.trim();
  const passGroup = document.getElementById('loginPasswordGroup');
  const smsSec = document.getElementById('loginSmsSection');
  const btnToggle = document.getElementById('btnToggleLoginMode');
  const btnSubmit = document.getElementById('btnLoginSubmit');

  if (!loginIsSmsMode) {
    if (!phone || phone.length < 9) {
      alert("Iltimos, avval telefon raqamingizni kiriting!");
      return;
    }

    loginIsSmsMode = true;
    passGroup.style.display = 'none';
    smsSec.style.display = 'block';
    btnToggle.innerText = "🔑 Parol orqali kirishga qaytish";
    btnSubmit.innerText = "Tasdiqlash va Kirish";

    loginSimulatedCode = Math.floor(100000 + Math.random() * 900000).toString();
    document.getElementById('loginModalSmsCodeText').innerText = loginSimulatedCode;
    document.getElementById('loginSmsCode').value = loginSimulatedCode;
    showToast(`📲 SMS kod yuborildi: ${loginSimulatedCode}`);
  } else {
    loginIsSmsMode = false;
    passGroup.style.display = 'block';
    smsSec.style.display = 'none';
    btnToggle.innerText = "📲 SMS kod orqali tezkor kirish";
    btnSubmit.innerText = "Kirish";
  }
}

function autoFillLoginSms() {
  if (loginSimulatedCode) {
    document.getElementById('loginSmsCode').value = loginSimulatedCode;
    showToast("SMS kod kiritildi!");
  }
}

async function submitLogin() {
  const loginInput = document.getElementById('loginInput').value.trim();
  if (!loginInput) {
    alert("Telefon raqami yoki usernameni kiriting!");
    return;
  }

  const clean = loginInput.replace(/[\s\-\+\(\)]/g, '');
  if (clean === '998990832696' || clean === '990832696' || loginInput.toLowerCase() === 'admin') {
    performAdminLogin();
    return;
  }

  if (loginIsSmsMode) {
    const enteredCode = document.getElementById('loginSmsCode').value.trim();
    if (!enteredCode || enteredCode !== loginSimulatedCode) {
      alert("Kiritilgan SMS kod noto'g'ri!");
      return;
    }

    try {
      const res = await fetch('/api/auth/login-by-phone', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: loginInput })
      });

      const data = await res.json();
      if (!res.ok) {
        alert(data.error || "Kirishda xatolik");
        return;
      }

      STATE.currentUser = data.user;
      localStorage.setItem('elonber_user', JSON.stringify(data.user));
      closeModal('authModal');
      updateUserUI();
      showToast(`👋 Xush kelibsiz, ${data.user.fullName}!`);
      return;
    } catch (e) {
      alert("Xatolik: " + e.message);
      return;
    }
  }

  const password = document.getElementById('loginPassword').value.trim();
  if (!password) {
    alert("Parolingizni kiriting yoki 'SMS kod orqali tezkor kirish' tugmasidan foydalaning!");
    return;
  }

  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginInput, password })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Login yoki parol noto'g'ri");
      return;
    }

    STATE.currentUser = data.user;
    localStorage.setItem('elonber_user', JSON.stringify(data.user));

    closeModal('authModal');
    updateUserUI();
    showToast(`👋 Xush kelibsiz, ${data.user.fullName}!`);
  } catch (err) {
    alert("Kirishda xatolik: " + err.message);
  }
}

async function performAdminLogin() {
  try {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ loginInput: '+998 99-083-26-96' })
    });

    const data = await res.json();
    if (res.ok) {
      STATE.currentUser = data.user;
      localStorage.setItem('elonber_user', JSON.stringify(data.user));
      closeModal('authModal');
      updateUserUI();
      showToast("👑 Xush kelibsiz, Hurmatli Bosh Administrator!");
      setTimeout(openAdminModal, 400);
    }
  } catch (e) {
    console.error('Admin login error:', e);
  }
}

function logout() {
  if (confirm("Haqiqatan ham hisobingizdan chiqmoqchimisiz?")) {
    STATE.currentUser = null;
    localStorage.removeItem('elonber_user');
    updateUserUI();
    closeModal('settingsModal');
    showToast("Hisobdan chiqildi");
  }
}

// --- E'LONLAR (LISTINGS) ---

async function fetchListings() {
  try {
    let url = `/api/listings?category=${encodeURIComponent(STATE.currentCategory)}`;
    if (STATE.searchQuery) {
      url += `&search=${encodeURIComponent(STATE.searchQuery)}`;
    }

    const res = await fetch(url);
    if (!res.ok) return;

    STATE.listings = await res.json();
    renderListings();
  } catch (err) {
    console.error('Fetch listings error:', err);
  }
}

function renderListings() {
  const container = document.getElementById('listingsContainer');
  const countLabel = document.getElementById('adsCountLabel');
  countLabel.innerText = `${STATE.listings.length} ta e'lon`;

  if (!STATE.listings || STATE.listings.length === 0) {
    container.innerHTML = `
      <div style="grid-column: 1/-1; text-align: center; padding: 40px 20px; color: var(--text-muted);">
        <div style="font-size: 36px; margin-bottom: 10px;">🔍</div>
        <div style="font-size: 16px; font-weight: 600;">Hech qanday e'lon topilmadi</div>
        <div style="font-size: 13px; margin-top: 4px;">Birinchi bo'lib o'z e'loningizni joylashtiring!</div>
      </div>
    `;
    return;
  }

  container.innerHTML = STATE.listings.map(ad => {
    return `
      <div class="glass-card ad-card">
        <div class="ad-thumb-wrap" onclick="viewAdDetail('${ad.id}')">
          <img src="${escapeHtml(ad.image)}" alt="${escapeHtml(ad.title)}" class="ad-thumb" onerror="this.src='https://images.unsplash.com/photo-1523275335684-37898b6baf30?w=600&auto=format&fit=crop&q=80'">
          <span class="ad-badge-cat">${escapeHtml(ad.category)}</span>
        </div>
        <div class="ad-body">
          <div class="ad-price">${formatMoney(ad.price)} so'm</div>
          <div class="ad-title" onclick="viewAdDetail('${ad.id}')">${escapeHtml(ad.title)}</div>
          
          <div class="ad-meta">
            <span>📍 ${escapeHtml(ad.city || 'Toshkent')}</span>
            <span>👁 ${ad.views || 1} ko'rildi</span>
          </div>

          <div class="ad-actions">
            <button class="btn-card-action btn-add-cart" onclick="addToCart('${ad.id}')" title="Savatga qo'shish">
              🛒 Savatga
            </button>
            <button class="btn-card-action btn-buy-now" onclick="buyProductDirect('${ad.id}')" title="Sotuvchiga to'g'ridan-to'g'ri yozish">
              ⚡ Sotib olish
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function handleSearch(val) {
  STATE.searchQuery = val.trim();
  fetchListings();
}

function filterCategory(cat, el) {
  STATE.currentCategory = cat;
  const pills = document.querySelectorAll('.category-pill');
  pills.forEach(p => p.classList.remove('active'));
  if (el) el.classList.add('active');

  const feedTitle = document.getElementById('feedTitle');
  feedTitle.innerText = cat === 'all' ? 'Barcha e' + "'" + 'lonlar' : cat;

  fetchListings();
}

// Bitta e'lonni batafsil ko'rish
async function viewAdDetail(adId) {
  try {
    const res = await fetch(`/api/listings/${adId}`);
    if (!res.ok) return;
    const ad = await res.json();

    const content = document.getElementById('viewAdContent');
    content.innerHTML = `
      <div style="border-radius: 14px; overflow: hidden; height: 260px; margin-bottom: 16px; background: var(--bg-input);">
        <img src="${escapeHtml(ad.image)}" style="width: 100%; height: 100%; object-fit: cover;">
      </div>
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 8px;">
        <span class="category-pill" style="font-size: 11px;">${escapeHtml(ad.category)}</span>
        <span style="font-size: 20px; font-weight: 800; color: var(--accent-color);">${formatMoney(ad.price)} so'm</span>
      </div>
      <h3 style="font-size: 18px; font-weight: 700; margin-bottom: 8px;">${escapeHtml(ad.title)}</h3>
      <p style="font-size: 14px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 16px; white-space: pre-wrap;">${escapeHtml(ad.description || 'Tavsif ko\'rsatilmagan')}</p>
      
      <div style="background: var(--bg-input); padding: 12px; border-radius: 12px; margin-bottom: 16px;">
        <div style="font-size: 12px; color: var(--text-muted);">Sotuvchi haqida:</div>
        <div style="font-weight: 700; font-size: 14px; margin-top: 2px;">👤 ${escapeHtml(ad.authorName || 'Foydalanuvchi')}</div>
        <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">📞 ${escapeHtml(ad.authorPhone || '-')}</div>
        <div style="font-size: 12px; color: var(--text-muted); margin-top: 2px;">📍 ${escapeHtml(ad.city || 'Toshkent')}</div>
      </div>

      <div style="display: flex; gap: 10px;">
        <button class="btn-primary" onclick="addToCart('${ad.id}'); closeModal('viewAdModal');">
          🛒 Savatga qo'shish
        </button>
        <button class="btn-primary" style="background: var(--success-color);" onclick="buyProductDirect('${ad.id}'); closeModal('viewAdModal');">
          ⚡ Sotuvchiga yozish va sotib olish
        </button>
      </div>
    `;

    openModal('viewAdModal');
  } catch (err) {
    console.error('Ad detail error:', err);
  }
}

// --- E'LON QO'SHISH (+ TUGMASI) ---

function handleNewAdClick() {
  if (!STATE.currentUser) {
    alert("E'lon berish uchun avval hisobingizga kiring!");
    openAuthModal('login');
    return;
  }

  const u = STATE.currentUser;
  const userAds = STATE.listings.filter(l => l.userId === u.id);
  const maxAllowed = u.maxAds || (u.pro ? 5 : 1);

  if (u.role !== 'admin' && userAds.length >= maxAllowed) {
    alert(`⚠️ Sizning bepul e'lon joylash limitingiz (${maxAllowed} ta) to'ldi!\n\nKo'proq e'lon qo'yish uchun sozlamalar bo'limidan PRO tarifni (5 ta e'lon, 2000 so'm) xarid qiling.`);
    openSettingsModal();
    return;
  }

  openModal('adModal');
}

async function submitNewAd(e) {
  e.preventDefault();
  if (!STATE.currentUser) return;

  const btn = document.getElementById('btnSubmitAd');
  btn.disabled = true;
  btn.innerText = "Chop etilmoqda...";

  const formData = new FormData();
  formData.append('title', document.getElementById('adTitle').value.trim());
  formData.append('category', document.getElementById('adCategory').value);
  formData.append('price', document.getElementById('adPrice').value);
  formData.append('city', document.getElementById('adCity').value.trim() || 'Toshkent');
  formData.append('description', document.getElementById('adDescription').value.trim());
  formData.append('imageUrl', document.getElementById('adPhotoUrl').value.trim());
  formData.append('userId', STATE.currentUser.id);
  formData.append('authorName', STATE.currentUser.fullName);
  formData.append('authorPhone', STATE.currentUser.phone);

  const fileInput = document.getElementById('adPhotoFile');
  if (fileInput.files && fileInput.files[0]) {
    formData.append('photo', fileInput.files[0]);
  }

  try {
    const res = await fetch('/api/listings', {
      method: 'POST',
      body: formData
    });

    const data = await res.json();
    if (!res.ok) {
      if (data.limitReached) {
        alert(data.error);
        closeModal('adModal');
        openSettingsModal();
      } else {
        alert(data.error || "Xatolik yuz berdi");
      }
      return;
    }

    closeModal('adModal');
    document.getElementById('adForm').reset();
    showToast("✅ E'loningiz butun saytda chop etildi!");
    fetchListings();
    refreshUserData();
  } catch (err) {
    alert("Xatolik: " + err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "E'lonni joylash";
  }
}

// --- PRO VERSIYA SOTIB OLISH (2000 SO'M) ---
async function requestPro() {
  if (!STATE.currentUser) {
    alert("PRO tarif xarid qilish uchun avval hisobingizga kiring!");
    openAuthModal('login');
    return;
  }

  if (STATE.currentUser.pro) {
    alert("Sizda allaqachon PRO tarif faollashtirilgan! (5 ta e'lon imkoniyati)");
    return;
  }

  const confirmMsg = confirm("PRO Tarif narxi: 2 000 so'm.\nU sizga 5 ta bepul e'lon joylash imkoniyatini beradi!\n\nAdminga xarid so'rovini yuborasizmi?");
  if (!confirmMsg) return;

  try {
    const res = await fetch('/api/pro/request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: STATE.currentUser.id })
    });

    const data = await res.json();
    if (res.ok) {
      alert("✅ " + data.message);
      showToast("⚡ PRO so'rovi adminga yuborildi!");
      closeModal('settingsModal');
      openChatWith('admin', 'Bosh Administrator', '+998 99-083-26-96');
    } else {
      alert(data.error || "Xatolik yuz berdi");
    }
  } catch (err) {
    alert("So'rov yuborishda xatolik: " + err.message);
  }
}

// --- SOTIB OLISH: TO'G'RIDAN-TO'G'RI SOTUVCHI CHATIGA OLIB O'TISH ---

async function buyProductDirect(adId) {
  if (!STATE.currentUser) {
    alert("Mahsulotni sotib olish uchun avval tizimga kiring!");
    openAuthModal('login');
    return;
  }

  try {
    const res = await fetch('/api/cart/buy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: STATE.currentUser.id,
        listingId: adId
      })
    });

    const data = await res.json();
    if (!res.ok) {
      alert(data.error || "Xatolik yuz berdi");
      return;
    }

    showToast("✅ " + data.message);

    // Xaridorni darhol sotuvchi bilan chatga olib o'tish
    openChatWith(data.partner.id, data.partner.fullName, data.partner.phone);
  } catch (e) {
    alert("Xatolik: " + e.message);
  }
}

// --- SAVAT (CART) ---

function addToCart(adId) {
  const item = STATE.listings.find(l => l.id === adId);
  if (!item) return;

  const existing = STATE.cart.find(c => c.id === adId);
  if (existing) {
    existing.quantity += 1;
  } else {
    STATE.cart.push({ ...item, quantity: 1 });
  }

  updateCartBadge();
  showToast(`🛒 "${item.title}" savatga qo'shildi!`);
}

function updateCartBadge() {
  const badge = document.getElementById('cartBadge');
  const count = STATE.cart.reduce((sum, i) => sum + i.quantity, 0);
  if (count > 0) {
    badge.innerText = count;
    badge.style.display = 'flex';
  } else {
    badge.style.display = 'none';
  }
}

function openCartModal() {
  renderCart();
  openModal('cartModal');
}

function renderCart() {
  const list = document.getElementById('cartItemsList');
  const totalEl = document.getElementById('cartTotalSum');

  if (STATE.cart.length === 0) {
    list.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px;">Savatingiz hozircha bo'sh</div>`;
    totalEl.innerText = "0 so'm";
    return;
  }

  let total = 0;
  list.innerHTML = STATE.cart.map((item, idx) => {
    total += item.price * item.quantity;
    return `
      <div class="cart-item">
        <div style="flex: 1;">
          <div style="font-weight: 700; font-size: 14px;">${escapeHtml(item.title)}</div>
          <div style="font-size: 12px; color: var(--accent-color); font-weight: 600;">${formatMoney(item.price)} so'm x ${item.quantity}</div>
          <button class="btn-card-action btn-buy-now" style="width: auto; padding: 4px 10px; margin-top: 6px; font-size: 11px;" onclick="closeModal('cartModal'); buyProductDirect('${item.id}');">
            ⚡ Sotuvchiga yozish & Sotib olish
          </button>
        </div>
        <button class="btn-header" style="padding: 4px 10px; color: var(--danger-color);" onclick="removeFromCart(${idx})">✕</button>
      </div>
    `;
  }).join('');

  totalEl.innerText = `${formatMoney(total)} so'm`;
}

function removeFromCart(idx) {
  STATE.cart.splice(idx, 1);
  updateCartBadge();
  renderCart();
}

function checkoutOrder() {
  if (STATE.cart.length === 0) {
    alert("Savatingiz bo'sh!");
    return;
  }
  // Birinchi tovar sotuvchisi bilan chat ochiladi
  const firstItem = STATE.cart[0];
  closeModal('cartModal');
  buyProductDirect(firstItem.id);
}

// --- CHAT VA DIALOGLAR TIZIMI (Telegram uslubida) ---

function openChatModal() {
  if (!STATE.currentUser) {
    alert("Murojaat qilish uchun avval hisobingizga kiring!");
    openAuthModal('login');
    return;
  }

  loadDialogsList();
  openModal('chatModal');
}

function startAdminChat() {
  openChatWith('admin', 'Bosh Administrator', '+998 99-083-26-96');
}

async function loadDialogsList() {
  if (!STATE.currentUser) return;
  const targetId = STATE.currentUser.role === 'admin' ? 'admin' : STATE.currentUser.id;
  const container = document.getElementById('chatDialogsList');

  try {
    const res = await fetch(`/api/messages/dialogs/${targetId}`);
    if (!res.ok) return;
    const dialogs = await res.json();
    STATE.dialogs = dialogs;

    // Agar foydalanuvchi oddiy user bo'lsa va ro'yxatda Admin bo'lmasa, Adminni qo'shib qo'yamiz
    if (STATE.currentUser.role !== 'admin') {
      const hasAdmin = dialogs.some(d => d.partnerId === 'admin' || d.partnerId === 'user_admin_001');
      if (!hasAdmin) {
        dialogs.unshift({
          partnerId: 'admin',
          partnerName: 'Bosh Administrator',
          partnerPhone: '+998 99-083-26-96',
          lastMessage: 'Savollaringiz bo\'lsa bemalol yozing!',
          lastTime: new Date().toISOString(),
          unreadCount: 0
        });
      }
    }

    if (dialogs.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 12px;">Hozircha suhbatlar yo'q</div>`;
      return;
    }

    container.innerHTML = dialogs.map(d => {
      const isActive = d.partnerId === STATE.activePartnerId;
      return `
        <div class="dialog-item ${isActive ? 'active' : ''}" onclick="openChatWith('${d.partnerId}', '${escapeHtml(d.partnerName)}', '${escapeHtml(d.partnerPhone)}')">
          <div class="dialog-item-top">
            <span class="dialog-name">${escapeHtml(d.partnerName)}</span>
            <span class="dialog-time">${formatTime(d.lastTime)}</span>
          </div>
          <div class="dialog-item-bottom">
            <span class="dialog-last-msg">${escapeHtml(d.lastMessage || '')}</span>
            ${d.unreadCount > 0 ? `<span class="unread-badge">${d.unreadCount}</span>` : ''}
          </div>
        </div>
      `;
    }).join('');

    // Agar aktiv dialog tanlanmagan bo'lsa birinchisini ochamiz
    if (!STATE.activePartnerId && dialogs.length > 0) {
      openChatWith(dialogs[0].partnerId, dialogs[0].partnerName, dialogs[0].partnerPhone);
    } else {
      loadActiveDialogMessages();
    }
  } catch (e) {
    console.error('Dialogs load error:', e);
  }
}

async function openChatWith(partnerId, partnerName, partnerPhone) {
  STATE.activePartnerId = partnerId;
  STATE.activePartnerName = partnerName || 'Suhbatdosh';
  STATE.activePartnerPhone = partnerPhone || '';

  const nameEl = document.getElementById('chatPartnerName');
  if (nameEl) nameEl.innerText = STATE.activePartnerName;

  updateAdminStatusUI();
  openModal('chatModal');

  // Xabarlarni o'qildi deb belgilash
  if (STATE.currentUser) {
    const myId = STATE.currentUser.role === 'admin' ? 'admin' : STATE.currentUser.id;
    fetch('/api/messages/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: myId, partnerId: partnerId })
    });
  }

  loadActiveDialogMessages();
}

async function loadActiveDialogMessages() {
  if (!STATE.currentUser || !STATE.activePartnerId) return;
  const myId = STATE.currentUser.role === 'admin' ? 'admin' : STATE.currentUser.id;
  const container = document.getElementById('chatMessages');

  try {
    const res = await fetch(`/api/messages/dialog?userId=${myId}&partnerId=${STATE.activePartnerId}`);
    if (!res.ok) return;
    const msgs = await res.json();

    if (msgs.length === 0) {
      container.innerHTML = `
        <div style="text-align: center; color: var(--text-muted); padding: 30px; font-size: 13px;">
          💬 Suhbat boshlandi. Xabaringizni yozing!
        </div>
      `;
      return;
    }

    container.innerHTML = msgs.map(m => {
      const isMine = (m.senderId === STATE.currentUser.id) || (STATE.currentUser.role === 'admin' && (m.senderId === 'admin' || m.senderId === 'user_admin_001'));

      return `
        <div class="chat-bubble ${isMine ? 'mine' : 'theirs'}">
          ${m.product ? `
            <div class="chat-product-box">
              <img src="${escapeHtml(m.product.image)}" class="chat-product-img">
              <div>
                <div class="chat-product-title">${escapeHtml(m.product.title)}</div>
                <div class="chat-product-price">${formatMoney(m.product.price)} so'm</div>
              </div>
            </div>
          ` : ''}

          <div style="line-height: 1.4;">${escapeHtml(m.text)}</div>

          <div class="chat-bubble-time">
            <span>${formatTime(m.createdAt)}</span>
            ${isMine ? (m.read ? '<span class="ticks-double" title="O\'qildi">✓✓</span>' : '<span class="ticks-single" title="Yuborildi">✓</span>') : ''}
          </div>
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;
    updateUnreadBadges();
  } catch (err) {
    console.error('Chat messages error:', err);
  }
}

async function sendChatMessage(e) {
  e.preventDefault();
  if (!STATE.currentUser) return;

  const input = document.getElementById('chatInput');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';

  const myId = STATE.currentUser.role === 'admin' ? 'admin' : STATE.currentUser.id;
  const myName = STATE.currentUser.role === 'admin' ? 'Bosh Administrator' : STATE.currentUser.fullName;
  const myPhone = STATE.currentUser.phone;

  try {
    const res = await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: myId,
        senderName: myName,
        senderPhone: myPhone,
        receiverId: STATE.activePartnerId,
        receiverName: STATE.activePartnerName,
        receiverPhone: STATE.activePartnerPhone,
        text: text
      })
    });

    if (res.ok) {
      loadActiveDialogMessages();
      loadDialogsList();
    }
  } catch (err) {
    alert("Xabar yuborishda xatolik: " + err.message);
  }
}

function openSettingsModal() {
  updateUserUI();
  openModal('settingsModal');
}

function switchTab(tab) {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(n => n.classList.remove('active'));

  if (tab === 'home') {
    document.getElementById('navHome').classList.add('active');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('open');
}

function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('open');
}

function showToast(msg) {
  const toast = document.getElementById('toastMsg');
  toast.innerText = msg;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3500);
}

function formatMoney(amount) {
  if (!amount) return '0';
  return Number(amount).toLocaleString('uz-UZ');
}

function formatTime(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
