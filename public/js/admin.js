// ===================================================
// e'lonber.uz - Bosh Administrator Paneli (admin.js)
// Foydalanuvchilar, PRO Qulfchalari (Qizil / Yashil),
// Murojaatlar (Telegram uslubida har bir odamga alohida bitta chat),
// O'qilmaganlar soni (Qizil dumaloq), Galochkalar (✓ va ✓✓)
// ===================================================

let ADMIN_STATE = {
  stats: {},
  users: [],
  dialogs: [],
  ads: [],
  selectedPartnerId: null,
  selectedPartnerName: '',
  selectedPartnerPhone: ''
};

function openAdminModal() {
  if (!STATE.currentUser || STATE.currentUser.role !== 'admin') {
    alert("Kechirasiz, ushbu bo'lim faqat Bosh Administrator uchun!");
    return;
  }

  loadAdminStats();
  loadAdminUsers();
  loadAdminDialogs();
  loadAdminAds();

  openModal('adminModal');
}

function switchAdminTab(tab) {
  const tabUsers = document.getElementById('adminTabUsersBtn');
  const tabMsgs = document.getElementById('adminTabMsgsBtn');
  const tabAds = document.getElementById('adminTabAdsBtn');

  const secUsers = document.getElementById('adminSectionUsers');
  const secMsgs = document.getElementById('adminSectionMessages');
  const secAds = document.getElementById('adminSectionAds');

  tabUsers.classList.remove('active');
  tabMsgs.classList.remove('active');
  tabAds.classList.remove('active');

  secUsers.style.display = 'none';
  secMsgs.style.display = 'none';
  secAds.style.display = 'none';

  if (tab === 'users') {
    tabUsers.classList.add('active');
    secUsers.style.display = 'block';
    loadAdminUsers();
  } else if (tab === 'messages') {
    tabMsgs.classList.add('active');
    secMsgs.style.display = 'block';
    loadAdminDialogs();
  } else if (tab === 'ads') {
    tabAds.classList.add('active');
    secAds.style.display = 'block';
    loadAdminAds();
  }
}

// 1. STATISTIKA YUKLASH
async function loadAdminStats() {
  try {
    const res = await fetch('/api/admin/stats');
    if (!res.ok) return;
    const stats = await res.json();
    ADMIN_STATE.stats = stats;

    document.getElementById('statUsersCount').innerText = stats.totalUsers || 0;
    document.getElementById('statProCount').innerText = stats.proUsersCount || 0;
    document.getElementById('statAdsCount').innerText = stats.totalListings || 0;
    document.getElementById('statMsgsCount').innerText = stats.pendingMessages || 0;

    // Badge
    const adminHeaderUnread = document.getElementById('adminHeaderUnread');
    const adminTabUnread = document.getElementById('adminTabUnread');
    if (stats.pendingMessages > 0) {
      if (adminHeaderUnread) {
        adminHeaderUnread.innerText = stats.pendingMessages;
        adminHeaderUnread.style.display = 'inline-block';
      }
      if (adminTabUnread) {
        adminTabUnread.innerText = stats.pendingMessages;
        adminTabUnread.style.display = 'inline-block';
      }
    } else {
      if (adminHeaderUnread) adminHeaderUnread.style.display = 'none';
      if (adminTabUnread) adminTabUnread.style.display = 'none';
    }
  } catch (e) {
    console.error('Admin stats error:', e);
  }
}

// 2. FOYDALANUVCHILAR RO'YXATI (PRO QULFCHA BILAN)
async function loadAdminUsers() {
  const container = document.getElementById('adminUsersList');
  try {
    const res = await fetch('/api/admin/users');
    if (!res.ok) return;
    const users = await res.json();
    ADMIN_STATE.users = users;

    if (users.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);">Foydalanuvchilar mavjud emas</div>`;
      return;
    }

    container.innerHTML = users.map(u => {
      const isCurrentAdmin = u.role === 'admin';
      const isPro = u.pro;

      return `
        <div class="user-row">
          <div style="flex: 1; min-width: 200px;">
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-weight: 700; font-size: 15px;">${escapeHtml(u.fullName)}</span>
              ${isCurrentAdmin ? '<span class="badge-admin">Admin</span>' : ''}
              <span style="font-size: 12px; color: var(--text-muted); font-family: monospace;">@${escapeHtml(u.username)}</span>
            </div>
            <div style="font-size: 13px; color: var(--text-secondary); margin-top: 2px;">
              📞 ${escapeHtml(u.phone)} | 📦 E'lonlari: <b>${u.adsCount || 0} ta</b> | 🛒 Xaridlari: <b>${u.ordersCount || 0} ta</b>
            </div>
          </div>

          <div style="display: flex; align-items: center; gap: 10px;">
            <!-- PRO QULFCHA TUGMASI (QIZIL / YASHIL) -->
            ${isCurrentAdmin ? '' : `
              <button 
                class="user-lock-btn ${isPro ? 'lock-green' : 'lock-red'}" 
                onclick="toggleUserPro('${u.id}', ${isPro})"
                title="${isPro ? 'PRO faol (5 ta e\'lon). O\'chirish uchun bosing' : 'PRO berish (5 ta bepul e\'lon) uchun bosing'}"
              >
                ${isPro ? '🔓 Yashil (PRO 5 ta)' : '🔒 Qizil (Bepul 1 ta)'}
              </button>
            `}

            <!-- PROFILI TUGMASI -->
            <button class="btn-header" style="padding: 6px 12px; font-size: 12px;" onclick="viewUserProfileDetails('${u.id}')">
              👤 Profili
            </button>
          </div>
        </div>
      `;
    }).join('');
  } catch (e) {
    console.error('Users load error:', e);
  }
}

async function toggleUserPro(userId, currentProState) {
  const targetUser = ADMIN_STATE.users.find(u => u.id === userId);
  const userName = targetUser ? targetUser.fullName : 'foydalanuvchi';

  const actionText = currentProState
    ? `${userName}dan PRO tarifni bekor qilmoqchimisiz? (E'lon limiti 1 taga tushadi)`
    : `${userName}ga PRO tarif berilsinmi? (Yashil qulfcha 🔓 faollashadi va 5 ta bepul e'lon imkoniyati ochiladi)`;

  if (!confirm(actionText)) return;

  try {
    const res = await fetch(`/api/admin/users/${userId}/toggle-pro`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' }
    });

    const data = await res.json();
    if (res.ok) {
      showToast(data.message);
      loadAdminUsers();
      loadAdminStats();
    } else {
      alert(data.error || "Xatolik yuz berdi");
    }
  } catch (err) {
    alert("Xatolik: " + err.message);
  }
}

// 3. FOYDALANUVCHI PROFILI TAFSILOTLARI (Admin ko'radi)
async function viewUserProfileDetails(userId) {
  try {
    const res = await fetch(`/api/admin/users/${userId}/details`);
    if (!res.ok) return;
    const data = await res.json();

    const u = data.user;
    document.getElementById('detailUserTitle').innerText = `${u.fullName} profili`;
    document.getElementById('detailUserMeta').innerHTML = `
      Telefon: <b>${escapeHtml(u.phone)}</b> | Username: <b>@${escapeHtml(u.username)}</b> | 
      PRO holati: <b>${u.pro ? '<span style="color:var(--success-color)">Faol (5 ta e\'lon)</span>' : '<span style="color:var(--danger-color)">Yo\'q (1 ta e\'lon)</span>'}</b>
    `;

    // Qo'ygan e'lonlari
    const adsContainer = document.getElementById('detailUserAdsList');
    if (!data.listings || data.listings.length === 0) {
      adsContainer.innerHTML = `<div style="font-size: 13px; color: var(--text-muted); padding: 8px;">Hozircha hech qanday e'lon qo'ymagan.</div>`;
    } else {
      adsContainer.innerHTML = data.listings.map(ad => `
        <div style="display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid var(--border-light); font-size: 13px;">
          <div>
            <b>${escapeHtml(ad.title)}</b> (${formatMoney(ad.price)} so'm)
            <div style="font-size: 11px; color: var(--text-muted);">${escapeHtml(ad.category)} | ${escapeHtml(ad.city)}</div>
          </div>
          <button class="btn-header" style="color: var(--danger-color); padding: 2px 8px; font-size: 11px;" onclick="adminDeleteAd('${ad.id}')">O'chirish</button>
        </div>
      `).join('');
    }

    // Sotib olgan mahsulotlari (xaridlari)
    const ordersContainer = document.getElementById('detailUserOrdersList');
    if (!data.orders || data.orders.length === 0) {
      ordersContainer.innerHTML = `<div style="font-size: 13px; color: var(--text-muted); padding: 8px;">Hozircha hech narsa sotib olmagan.</div>`;
    } else {
      ordersContainer.innerHTML = data.orders.map(o => `
        <div style="padding: 8px 0; border-bottom: 1px solid var(--border-light); font-size: 13px;">
          <div style="display: flex; justify-content: space-between; font-weight: 600;">
            <span>Xarid # ${escapeHtml(o.id.substring(4, 10))}</span>
            <span style="color: var(--accent-color);">${formatMoney(o.totalAmount)} so'm</span>
          </div>
          <div style="font-size: 12px; color: var(--text-secondary); margin-top: 2px;">
            Tovarlar: ${o.items.map(i => escapeHtml(i.title) + ' (x' + i.quantity + ')').join(', ')}
          </div>
          <div style="font-size: 11px; color: var(--text-muted); margin-top: 2px;">
            Holat: <b style="color: var(--success-color);">${o.status}</b>
          </div>
        </div>
      `).join('');
    }

    openModal('userDetailsModal');
  } catch (e) {
    console.error('Details error:', e);
  }
}

// 4. MUROJAATLAR VA CHAT (Har bir foydalanuvchi bitta chat bo'lib turadi!)
async function loadAdminDialogs() {
  const container = document.getElementById('adminDialogsList');
  try {
    const res = await fetch('/api/messages/dialogs/admin');
    if (!res.ok) return;
    const dialogs = await res.json();
    ADMIN_STATE.dialogs = dialogs;

    if (dialogs.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 20px; font-size: 12px;">Hozircha murojaatlar yo'q</div>`;
      return;
    }

    container.innerHTML = dialogs.map(d => {
      const isActive = d.partnerId === ADMIN_STATE.selectedPartnerId;
      return `
        <div class="dialog-item ${isActive ? 'active' : ''}" onclick="selectAdminDialog('${d.partnerId}', '${escapeHtml(d.partnerName)}', '${escapeHtml(d.partnerPhone)}')">
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

    // Agar hech qaysi tanlanmagan bo'lsa va ro'yxat bo'lsa birinchisini ochish
    if (!ADMIN_STATE.selectedPartnerId && dialogs.length > 0) {
      selectAdminDialog(dialogs[0].partnerId, dialogs[0].partnerName, dialogs[0].partnerPhone);
    } else if (ADMIN_STATE.selectedPartnerId) {
      loadAdminActiveDialogMessages();
    }
  } catch (e) {
    console.error('Admin dialogs error:', e);
  }
}

async function selectAdminDialog(partnerId, partnerName, partnerPhone) {
  ADMIN_STATE.selectedPartnerId = partnerId;
  ADMIN_STATE.selectedPartnerName = partnerName;
  ADMIN_STATE.selectedPartnerPhone = partnerPhone;

  document.getElementById('adminChatPartnerName').innerText = partnerName;
  document.getElementById('adminChatPartnerPhone').innerText = partnerPhone ? `📞 ${partnerPhone}` : '';
  document.getElementById('adminChatInputBar').style.display = 'flex';

  // Ushbu suhbatdoshdan kelgan xabarlarni o'qildi deb belgilash
  try {
    await fetch('/api/messages/mark-read', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: 'admin', partnerId: partnerId })
    });
    loadAdminStats();
  } catch (e) {}

  loadAdminActiveDialogMessages();
}

async function loadAdminActiveDialogMessages() {
  if (!ADMIN_STATE.selectedPartnerId) return;
  const container = document.getElementById('adminChatMessages');

  try {
    const res = await fetch(`/api/messages/dialog?userId=admin&partnerId=${ADMIN_STATE.selectedPartnerId}`);
    if (!res.ok) return;
    const msgs = await res.json();

    if (msgs.length === 0) {
      container.innerHTML = `<div style="text-align: center; color: var(--text-muted); padding: 40px;">Suhbat bo'sh</div>`;
      return;
    }

    container.innerHTML = msgs.map(m => {
      const isMine = m.senderId === 'admin' || m.senderId === 'user_admin_001';

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
            ${isMine ? (m.read ? '<span class="ticks-double" title="Foydalanuvchi o\'qidi">✓✓</span>' : '<span class="ticks-single" title="Yetkazildi">✓</span>') : ''}
          </div>
        </div>
      `;
    }).join('');

    container.scrollTop = container.scrollHeight;
  } catch (e) {
    console.error('Admin active chat error:', e);
  }
}

async function submitAdminChatMessage(e) {
  e.preventDefault();
  if (!ADMIN_STATE.selectedPartnerId) return;

  const input = document.getElementById('adminChatInput');
  const text = input.value.trim();
  if (!text) return;

  input.value = '';

  try {
    const res = await fetch('/api/messages/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: 'admin',
        senderName: 'Bosh Administrator',
        senderPhone: '+998 99-083-26-96',
        receiverId: ADMIN_STATE.selectedPartnerId,
        receiverName: ADMIN_STATE.selectedPartnerName,
        receiverPhone: ADMIN_STATE.selectedPartnerPhone,
        text: text
      })
    });

    if (res.ok) {
      loadAdminActiveDialogMessages();
      loadAdminDialogs();
    }
  } catch (e) {
    alert("Javob yuborishda xatolik: " + e.message);
  }
}

function handleAdminNewMessage(msg) {
  loadAdminStats();
  loadAdminDialogs();
  if (ADMIN_STATE.selectedPartnerId === msg.senderId) {
    loadAdminActiveDialogMessages();
  }
}

// 5. BARCHA E'LONLARNI BOSHQARISH
async function loadAdminAds() {
  const container = document.getElementById('adminAdsList');
  try {
    const res = await fetch('/api/listings');
    if (!res.ok) return;
    const ads = await res.json();
    ADMIN_STATE.ads = ads;

    if (ads.length === 0) {
      container.innerHTML = `<div style="text-align: center; padding: 20px; color: var(--text-muted);">E'lonlar yo'q</div>`;
      return;
    }

    container.innerHTML = ads.map(ad => `
      <div class="user-row" style="align-items: center;">
        <img src="${escapeHtml(ad.image)}" style="width: 50px; height: 50px; border-radius: 8px; object-fit: cover; margin-right: 12px;">
        <div style="flex: 1;">
          <div style="font-weight: 700; font-size: 14px;">${escapeHtml(ad.title)}</div>
          <div style="font-size: 12px; color: var(--text-muted);">
            Narx: ${formatMoney(ad.price)} so'm | Muallif: <b>${escapeHtml(ad.authorName)}</b> (${escapeHtml(ad.authorPhone)})
          </div>
        </div>
        <button class="btn-header" style="color: var(--danger-color); padding: 6px 12px; font-size: 12px;" onclick="adminDeleteAd('${ad.id}')">
          🗑 O'chirish
        </button>
      </div>
    `).join('');
  } catch (e) {
    console.error('Admin ads error:', e);
  }
}

async function adminDeleteAd(adId) {
  if (!confirm("Haqiqatan ham bu e'lonni o'chirib tashlamoqchimisiz?")) return;

  try {
    const res = await fetch(`/api/listings/${adId}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: STATE.currentUser.id })
    });

    if (res.ok) {
      showToast("E'lon o'chirildi");
      loadAdminAds();
      loadAdminStats();
      fetchListings();
      closeModal('userDetailsModal');
    }
  } catch (e) {
    alert("O'chirishda xatolik: " + e.message);
  }
}
