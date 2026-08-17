const colors = {
    orange: 'var(--orange-soft)', purple: 'var(--purple)', red: 'var(--red)',
    green: 'var(--green-accent)', darkgreen: 'var(--green-dark)'
};

let products = [];
let productsLoaded = false; // true only after /api/products has successfully returned
let isLoading = true;
let loadError = null;
let categories = ['All'];
let activeCat = 'All';
let searchTerm = '';
let cart = [];
let currentProduct = null;
let currentQty = 1;

const jarIcon = `<svg width="54" height="54" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M8 3h8v3.2c1.6.6 2.5 2.1 2.5 4.3v9a2 2 0 0 1-2 2H7.5a2 2 0 0 1-2-2v-9c0-2.2.9-3.7 2.5-4.3V3z"/><path d="M8 9h8"/></svg>`;

const grid = document.getElementById('productGrid');
const catNav = document.getElementById('categoryNav');
const resultCount = document.getElementById('resultCount');

const API_URL = '/api/products';
const CART_API = '/customer/cart';
const USER_API = '/api/users/me';

// ── Auth Helpers ──
function getAuthToken() {
    return localStorage.getItem('token');
}

function authHeaders() {
    const t = getAuthToken();
    return t ? { 'Authorization': `Bearer ${t}` } : {};
}

// ── Display Name Helper ──
function getDisplayName(userObj) {
    if (!userObj) return null;
    const candidates = [
        userObj.name,
        userObj.fullName,
        userObj.displayName,
        userObj.firstName,
        userObj.user,
        userObj.customerName,
        userObj.profileName
    ];
    for (const c of candidates) {
        if (c && typeof c === 'string' && c.trim().length > 0) {
            return c.trim();
        }
    }
    return null;
}

function getUsername(userObj) {
    if (!userObj) return null;
    const candidates = [
        userObj.username,
        userObj.userName,
        userObj.login,
        userObj.email
    ];
    for (const c of candidates) {
        if (c && typeof c === 'string' && c.trim().length > 0) {
            return c.trim();
        }
    }
    return null;
}

function getRole(userObj) {
    if (!userObj) return null;
    const candidates = [
        userObj.role,
        userObj.authority,
        userObj.userRole
    ];
    for (const c of candidates) {
        if (c && typeof c === 'string' && c.trim().length > 0) {
            return c.trim();
        }
    }
    return null;
}

function getInitials(name) {
    if (!name || typeof name !== 'string') return 'G';
    return name.split(/\s+/).map(n => n[0]).join('').slice(0, 2).toUpperCase();
}

async function fetchUserProfile() {
    const token = getAuthToken();
    if (!token) { renderProfileBanner(); return; }
    try {
        const res = await fetch(USER_API, {
            method: 'GET',
            headers: { 'Accept': 'application/json', ...authHeaders() }
        });
        if (!res.ok) {
            console.warn('fetchUserProfile returned status', res.status);
            renderProfileBanner();
            return;
        }
        const data = await res.json();
        if (data) {
            localStorage.setItem('auth_user', JSON.stringify(data));
        }
        renderProfileBanner();
    } catch (e) {
        console.error('Fetch user profile failed:', e);
        renderProfileBanner();
    }
}

function renderProfileBanner() {
    let user = null;
    try {
        const raw = localStorage.getItem('auth_user');
        if (raw) user = JSON.parse(raw);
    } catch (e) { console.warn('Could not parse auth_user', e); }

    const displayName = getDisplayName(user) || localStorage.getItem('username') || 'Guest';
    const username  = getUsername(user) || localStorage.getItem('username') || 'Guest';
    const role      = getRole(user) || localStorage.getItem('role') || '';

    const initials = getInitials(displayName === 'Guest' ? username : displayName);

    document.getElementById('profileAvatar').textContent = initials || 'G';
    document.getElementById('profileName').textContent = displayName;
    document.getElementById('profileRole').textContent = role ? `${role} — View profile` : 'View profile';
}

// ── Image Helpers ──
function getImageUrl(p) {
    const url = p.image || p.imageUrl || p.img || p.photo || p.thumbnail || p.picture || null;
    if (url && !url.startsWith('http') && !url.startsWith('data:')) return url;
    return url;
}

function buildMediaHtml(p, size = 'card') {
    const imgUrl = getImageUrl(p);
    const bg = colors[p.color] || 'var(--green-accent)';
    if (imgUrl) {
        return `<img src="${imgUrl}" alt="${p.name}" loading="lazy" onerror="this.style.display='none';this.parentElement.innerHTML='${jarIcon.replace(/"/g, '&quot;')}';this.parentElement.style.background='${bg}';">`;
    }
    return `<div class="placeholder-icon" style="width:100%;height:100%;background:${bg}">${jarIcon}</div>`;
}

// ── Products ──
async function loadProducts() {
    isLoading = true;
    loadError = null;
    renderGrid();

    try {
        const res = await fetch(API_URL, {
            method: 'GET',
            headers: { 'Accept': 'application/json', 'Content-Type': 'application/json', ...authHeaders() }
        });

        if (res.status === 401 || res.status === 403) {
            throw new Error('Please log in to view products.');
        }
        if (!res.ok) {
            const text = await res.text();
            throw new Error(`Server ${res.status}: ${text}`);
        }

        const data = await res.json();
        products = normalizeProducts(data);
        productsLoaded = true;

    } catch (err) {
        console.error('Fetch failed:', err);
        loadError = err.message;
        productsLoaded = false;
    } finally {
        isLoading = false;
        categories.length = 0;
        categories.push('All', ...new Set(products.map(p => p.cat)));
        activeCat = 'All';
        renderCategories();
        renderGrid();
        // renderCart() is called in init() after cart is loaded
    }
}

function normalizeProducts(raw) {
    if (!Array.isArray(raw)) { console.warn('Expected array from backend, got:', raw); return []; }
    return raw.map(p => ({
        id: Number(p.id) || p.id,
        name: p.name,
        cat: p.category || p.cat,
        color: p.color || 'green',
        price: parseFloat(p.price) || 0,
        oldPrice: p.oldPrice ? parseFloat(p.oldPrice) : null,
        rating: parseFloat(p.rating) || 0,
        reviews: parseInt(p.reviews) || 0,
        tag: p.tag || null,
        desc: p.description || p.desc || '',
        image: getImageUrl(p)
    }));
}

function renderCategories() {
    catNav.innerHTML = categories.map(c =>
        `<button class="chip ${c === activeCat ? 'active' : ''}" data-cat="${c}">${c}</button>`
    ).join('');
    catNav.querySelectorAll('.chip').forEach(chip => {
        chip.addEventListener('click', () => { activeCat = chip.dataset.cat; renderCategories(); renderGrid(); });
    });
}

function filteredProducts() {
    return products.filter(p =>
        (activeCat === 'All' || p.cat === activeCat) &&
        p.name.toLowerCase().includes(searchTerm.toLowerCase())
    );
}

function renderGrid() {
    if (isLoading) {
        resultCount.textContent = '';
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted);">
                <div style="width:40px;height:40px;border:3px solid var(--border);border-top-color:var(--green-accent);border-radius:50%;animation:spin 0.8s linear infinite;margin:0 auto 16px;"></div>
                Loading products…
            </div>`;
        return;
    }

    if (loadError) {
        resultCount.textContent = '';
        grid.innerHTML = `
            <div style="grid-column:1/-1;text-align:center;padding:60px 20px;">
                <p style="font-weight:700;margin-bottom:8px;color:var(--red);">Could not load products</p>
                <p style="font-size:13px;color:var(--text-muted);margin-bottom:16px;">${loadError}</p>
                <button class="btn btn-solid" onclick="loadProducts()">Try Again</button>
            </div>`;
        return;
    }

    const list = filteredProducts();
    resultCount.textContent = `${list.length} product${list.length !== 1 ? 's' : ''}`;

    if (list.length === 0) {
        grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:60px 20px;color:var(--text-muted);">No products found.</div>`;
        return;
    }

    grid.innerHTML = list.map(p => `
        <div class="product-card" data-id="${p.id}">
        <div class="product-media">
                ${p.tag ? `<div class="product-tag">${p.tag}</div>` : ''}
                ${buildMediaHtml(p, 'card')}
            </div>
            <div class="product-body">
                <div class="product-cat">${p.cat}</div>
                <div class="product-name">${p.name}</div>
                <div class="product-desc">${p.desc}</div>
                <div class="product-rating">★ ${p.rating} <span>(${p.reviews})</span></div>
                <div class="product-footer">
                    <div class="product-price">$${p.price.toFixed(2)}${p.oldPrice ? `<small>$${p.oldPrice.toFixed(2)}</small>` : ''}</div>
                </div>
            </div>
            <div class="product-actions">
                <button class="btn btn-outline" data-add="${p.id}">Add to Cart</button>
                <button class="btn btn-solid" data-view="${p.id}">View</button>
            </div>
        </div>
    `).join('');

    grid.querySelectorAll('[data-add]').forEach(btn =>
        btn.addEventListener('click', e => { e.stopPropagation(); addToCart(Number(btn.dataset.add), 1); })
    );
    grid.querySelectorAll('[data-view]').forEach(btn =>
        btn.addEventListener('click', e => { e.stopPropagation(); openModal(Number(btn.dataset.view)); })
    );
    grid.querySelectorAll('.product-card').forEach(card =>
        card.addEventListener('click', () => openModal(Number(card.dataset.id)))
    );
}

// ===== Modal =====
const overlay = document.getElementById('overlay');
function openModal(id) {
    currentProduct = products.find(p => p.id === id);
    if (!currentProduct) return;
    currentQty = 1;

    const modalMedia = document.getElementById('modalMedia');
    modalMedia.style.background = '#f0f0f0';
    modalMedia.innerHTML = buildMediaHtml(currentProduct, 'modal');

    document.getElementById('modalCat').textContent = currentProduct.cat;
    document.getElementById('modalName').textContent = currentProduct.name;
    document.getElementById('modalRating').innerHTML = `★ ${currentProduct.rating} <span>(${currentProduct.reviews} reviews)</span>`;
    document.getElementById('modalDesc').textContent = currentProduct.desc;
    document.getElementById('modalPrice').textContent = `$${currentProduct.price.toFixed(2)}`;
    document.getElementById('qtyValue').textContent = currentQty;
    overlay.classList.add('open');
}
document.getElementById('modalClose').addEventListener('click', () => overlay.classList.remove('open'));
overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });

document.getElementById('qtyMinus').addEventListener('click', () => {
    currentQty = Math.max(1, currentQty - 1);
    document.getElementById('qtyValue').textContent = currentQty;
});
document.getElementById('qtyPlus').addEventListener('click', () => {
    currentQty += 1;
    document.getElementById('qtyValue').textContent = currentQty;
});
document.getElementById('modalAddCart').addEventListener('click', () => {
    addToCart(currentProduct.id, currentQty);
    overlay.classList.remove('open');
});
document.getElementById('modalBuyNow').addEventListener('click', () => {
    addToCart(currentProduct.id, currentQty);
    overlay.classList.remove('open');
    showToast(`Proceeding to checkout for ${currentProduct.name}`);
    openDrawer();
});

// ===== Cart (Frontend + Backend Sync) =====
// IMPORTANT: each cart line has TWO distinct ids that must never be conflated:
//   - c.id          -> the PRODUCT's id (matches the catalog in `products`, used for display)
//   - c.cartItemId  -> the cart_items row's own DB primary key (required by update/remove endpoints)
const cartCountEl = document.getElementById('cartCount');
const cartItemsEl = document.getElementById('cartItems');
const cartTotalEl = document.getElementById('cartTotal');
const drawer = document.getElementById('cartDrawer');
const drawerOverlay = document.getElementById('drawerOverlay');

async function addToCart(productId, qty) {
    const token = getAuthToken();
    if (!token) { showToast('Please log in to add items to cart'); return; }
    const product = products.find(p => p.id === productId);
    if (!product) return;

    const ok = await syncAddToCart(productId, qty);
    if (!ok) { showToast('Failed to add item to cart'); return; }

    // Re-pull the cart from the backend rather than guessing locally — this is
    // the only way to learn the correct cartItemId for a newly inserted row
    // (or the existing row if this product was already in the cart).
    await loadCartFromBackend();
    showToast(`Added ${product.name} to cart`);
}

async function removeFromCart(cartItemId) {
    const ok = await syncRemoveFromCart(cartItemId);
    if (ok) {
        cart = cart.filter(c => c.cartItemId !== cartItemId);
        renderCart();
        showToast('Item removed');
    } else {
        showToast('Failed to remove item');
    }
}

function renderCart() {
    // Only ever treat a cart line as "product genuinely gone" — and only then
    // touch the backend — once we're CERTAIN the product list loaded successfully.
    // If /api/products hasn't resolved yet, failed, or returned nothing, we must
    // NOT wipe cart items: that would delete real data based on a loading state,
    // not an actual deletion.
    if (productsLoaded && products.length > 0) {
        const stale = cart.filter(c => !products.some(p => p.id === c.id));
        if (stale.length > 0) {
            const staleCartItemIds = stale.map(c => c.cartItemId);
            cart = cart.filter(c => !staleCartItemIds.includes(c.cartItemId));
            staleCartItemIds.forEach(cid => syncRemoveFromCart(cid)); // best-effort backend cleanup
            showToast(stale.length === 1
                ? 'An item in your cart is no longer available and was removed.'
                : `${stale.length} items in your cart are no longer available and were removed.`);
        }
    }

    const totalItems = cart.reduce((s, c) => s + c.qty, 0);
    cartCountEl.textContent = totalItems;

    if (cart.length === 0) {
        cartItemsEl.innerHTML = `<div class="cart-empty">Your cart is empty.<br>Browse products and add something you like.</div>`;
    } else {
        cartItemsEl.innerHTML = cart.map(c => {
            const p = products.find(pr => pr.id === c.id);
            // p can still be missing here if products haven't loaded yet —
            // show a neutral placeholder rather than crashing or deleting anything.
            const name = p ? p.name : `Loading…`;
            const price = p ? p.price : 0;
            const color = p ? (colors[p.color] || 'var(--green-accent)') : 'var(--border)';
            const media = p ? buildMediaHtml(p, 'cart') : jarIcon;
            return `
            <div class="cart-item">
                <div class="cart-item-media" style="background:${color}">
                    ${media}
                </div>
                <div class="cart-item-info">
                    <h4>${name}</h4>
                    <span>$${price.toFixed(2)} each</span>
                    <div class="cart-qty-control">
                        <button data-qty-minus="${c.cartItemId}">−</button>
                        <span>${c.qty}</span>
                        <button data-qty-plus="${c.cartItemId}">+</button>
                    </div>
                    <button class="cart-remove" data-remove="${c.cartItemId}">Remove</button>
                </div>
                <div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px;">
                    <div class="cart-item-price">$${(price * c.qty).toFixed(2)}</div>
                    <button class="cart-item-delete" data-delete="${c.cartItemId}" title="Remove item">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                    </button>
                </div>
            </div>`;
        }).join('');
        cartItemsEl.querySelectorAll('[data-remove]').forEach(btn =>
            btn.addEventListener('click', () => removeFromCart(Number(btn.dataset.remove)))
        );
        cartItemsEl.querySelectorAll('[data-delete]').forEach(btn =>
            btn.addEventListener('click', () => removeFromCart(Number(btn.dataset.delete)))
        );
        cartItemsEl.querySelectorAll('[data-qty-minus]').forEach(btn =>
            btn.addEventListener('click', () => updateCartQty(Number(btn.dataset.qtyMinus), -1))
        );
        cartItemsEl.querySelectorAll('[data-qty-plus]').forEach(btn =>
            btn.addEventListener('click', () => updateCartQty(Number(btn.dataset.qtyPlus), 1))
        );
    }

    const total = cart.reduce((s, c) => {
        const p = products.find(pr => pr.id === c.id);
        return s + (p ? p.price * c.qty : 0);
    }, 0);
    cartTotalEl.textContent = `$${total.toFixed(2)}`;
}

async function updateCartQty(cartItemId, delta) {
    const item = cart.find(c => c.cartItemId === cartItemId);
    if (!item) return;
    const newQty = item.qty + delta;
    if (newQty < 1) {
        await removeFromCart(cartItemId);
        return;
    }
    const prevQty = item.qty;
    item.qty = newQty;
    renderCart();
    const ok = await syncUpdateCartQty(cartItemId, newQty);
    if (!ok) {
        item.qty = prevQty; // roll back optimistic update on failure
        renderCart();
        showToast('Failed to update quantity');
    }
}

async function syncUpdateCartQty(cartItemId, qty) {
    const token = getAuthToken();
    if (!token) return false;
    try {
        const res = await fetch(`${CART_API}/update/${cartItemId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ quantity: qty })
        });
        if (res.ok) return true;
        console.error('Sync updateCartQty failed for cart item', cartItemId, res.status);
        return false;
    } catch (e) {
        console.error('Sync updateCartQty failed for cart item', cartItemId, e);
        return false;
    }
}

// ── Backend Sync ──
async function syncAddToCart(productId, qty) {
    const token = getAuthToken();
    if (!token) return false;
    try {
        const res = await fetch(`${CART_API}/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ productId, quantity: qty })
        });
        return res.ok;
    } catch (e) {
        console.error('Sync addToCart failed', e);
        return false;
    }
}

async function syncRemoveFromCart(cartItemId) {
    const token = getAuthToken();
    if (!token) return false;
    try {
        const res = await fetch(`${CART_API}/remove/${cartItemId}`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        if (res.ok) return true;
        console.error('Sync removeFromCart failed for cart item', cartItemId, res.status);
        return false;
    } catch (e) {
        console.error('Sync removeFromCart failed for cart item', cartItemId, e);
        return false;
    }
}

async function syncClearCart() {
    const token = getAuthToken();
    if (!token) return false;
    try {
        const res = await fetch(`${CART_API}/clear`, {
            method: 'DELETE',
            headers: authHeaders()
        });
        if (res.ok) return true;
    } catch (e) {}

    // Fallback: remove items one by one using their real cart-item ids.
    const results = await Promise.all(
        cart.map(c => syncRemoveFromCart(c.cartItemId))
    );
    return results.every(r => r);
}

async function loadCartFromBackend() {
    const token = getAuthToken();
    if (!token) { cart = []; renderCart(); return; }
    try {
        const res = await fetch(CART_API, { headers: { ...authHeaders(), 'Accept': 'application/json' } });

        if (res.status === 401 || res.status === 403) {
            showToast('Session expired. Please log in again.');
            cart = [];
            renderCart();
            return;
        }
        if (!res.ok) {
            const text = await res.text();
            console.error('Cart fetch failed:', res.status, text);
            showToast('Could not load cart. Please refresh.');
            renderCart();
            return;
        }

        const data = await res.json();
        const items = Array.isArray(data) ? data : (data.items || data.cart || data.data || []);

        cart = items.map(item => ({
            cartItemId: Number(item.cartItemId),
            id: Number(item.productId),
            qty: Number(item.quantity ?? item.qty ?? 1)
        })).filter(item => !isNaN(item.cartItemId) && !isNaN(item.id));

        renderCart();
    } catch (e) {
        console.error('Failed to load cart', e);
        showToast('Network error while loading cart.');
        renderCart();
    }
}

function openDrawer() { drawer.classList.add('open'); drawerOverlay.classList.add('open'); }
function closeDrawer() { drawer.classList.remove('open'); drawerOverlay.classList.remove('open'); }

document.getElementById('cartBtn').addEventListener('click', openDrawer);
document.getElementById('drawerClose').addEventListener('click', closeDrawer);
drawerOverlay.addEventListener('click', closeDrawer);

document.getElementById('checkoutBtn').addEventListener('click', async () => {
    if (cart.length === 0) { showToast('Your cart is empty'); return; }

    const token = getAuthToken();
    if (!token) { showToast('Please log in to checkout'); return; }

    try {
        const res = await fetch(`${CART_API}/checkout`, {
            method: 'POST',
            headers: authHeaders()
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
            showToast('Checkout failed: ' + (data.error || 'Unknown error'));
            return;
        }

        const options = {
            key: "rzp_test_TOs5KEYmjye8m0",
            amount: data.amount,
            currency: data.currency,
            name: "Sales-Savvy",
            description: "Order Payment",
            order_id: data.orderId,
            handler: async function (response) {
                try {
                    const verifyRes = await fetch('/customer/cart/verify-payment', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', ...authHeaders() },
                        body: JSON.stringify({
                            razorpay_order_id: response.razorpay_order_id,
                            razorpay_payment_id: response.razorpay_payment_id,
                            razorpay_signature: response.razorpay_signature
                        })
                    });
                    const verifyData = await verifyRes.json();
                    if (verifyData.success) {
                        showToast('Payment successful!');
                        cart = [];
                        renderCart();
                        closeDrawer();
                    } else {
                        showToast('Payment verification failed: ' + (verifyData.error || ''));
                    }
                } catch (e) {
                    showToast('Payment verification error');
                }
            },
            prefill: {
                name: document.getElementById('profileName').textContent,
                email: "",
                contact: ""
            },
            theme: { color: "#2D5016" }
        };

        const rzp = new Razorpay(options);
        rzp.on('payment.failed', function (response) {
            showToast('Payment failed: ' + response.error.description);
        });
        rzp.open();

    } catch (e) {
        showToast('Checkout failed. Please try again.');
    }
});

// ===== Toast =====
const toastEl = document.getElementById('toast');
let toastTimer;
function showToast(msg) {
    clearTimeout(toastTimer);
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    toastTimer = setTimeout(() => toastEl.classList.remove('show'), 2200);
}

// ===== Search =====
document.getElementById('searchInput').addEventListener('input', e => {
    searchTerm = e.target.value;
    renderGrid();
});

// ===== Profile Drawer =====
const profileDrawer = document.getElementById('profileDrawer');
const profileOverlay = document.getElementById('profileOverlay');

function openProfileDrawer() {
    renderProfileDrawer();
    profileDrawer.classList.add('open');
    profileOverlay.classList.add('open');
}
function closeProfileDrawer() {
    profileDrawer.classList.remove('open');
    profileOverlay.classList.remove('open');
    document.getElementById('editProfileForm').classList.remove('open');
}

function renderProfileDrawer() {
    let user = null;
    try {
        const raw = localStorage.getItem('auth_user');
        if (raw) user = JSON.parse(raw);
    } catch (e) {}
    const displayName = getDisplayName(user) || localStorage.getItem('username') || 'Guest';
    const username  = getUsername(user) || localStorage.getItem('username') || 'Guest';
    const role      = getRole(user) || localStorage.getItem('role') || 'Customer';
    const initials = getInitials(displayName === 'Guest' ? username : displayName);

    document.getElementById('profileAvatarLarge').textContent = initials || 'G';
    document.getElementById('profileNameLarge').textContent = displayName;
    document.getElementById('profileRoleLarge').textContent = role;
    document.getElementById('editNameInput').value = displayName;
    document.getElementById('editUsernameInput').value = username;
}

document.getElementById('profileBtn').addEventListener('click', e => {
    e.preventDefault();
    openProfileDrawer();
});
document.getElementById('profileDrawerClose').addEventListener('click', closeProfileDrawer);
profileOverlay.addEventListener('click', closeProfileDrawer);

document.getElementById('editProfileToggle').addEventListener('click', () => {
    const form = document.getElementById('editProfileForm');
    form.classList.toggle('open');
});

document.getElementById('saveNameBtn').addEventListener('click', () => {
    const newName = document.getElementById('editNameInput').value.trim();
    const newUsername = document.getElementById('editUsernameInput').value.trim();
    if (!newName) { showToast('Please enter a name'); return; }
    if (!newUsername) { showToast('Please enter a username'); return; }

    let user = null;
    try {
        const raw = localStorage.getItem('auth_user');
        if (raw) user = JSON.parse(raw);
    } catch (e) {}
    if (user) {
        user.user = newName;
        user.name = newName;
        user.username = newUsername;
        localStorage.setItem('auth_user', JSON.stringify(user));
    }
    localStorage.setItem('username', newUsername);

    renderProfileBanner();
    renderProfileDrawer();
    document.getElementById('editProfileForm').classList.remove('open');
    showToast('Profile updated');
});

document.getElementById('logoutBtn').addEventListener('click', () => {
    localStorage.removeItem('token');
    localStorage.removeItem('auth_user');
    localStorage.removeItem('username');
    localStorage.removeItem('role');
    showToast('Logged out');
    closeProfileDrawer();
    setTimeout(() => { window.location.href = "/login.html"; }, 800);
});

// ===== Clear Cart =====
document.getElementById('clearCartBtn').addEventListener('click', async () => {
    if (cart.length === 0) { showToast('Cart is already empty'); return; }
    if (!confirm('Remove all items from your cart?')) return;

    const ok = await syncClearCart();
    if (ok) {
        cart = [];
        renderCart();
        showToast('Cart cleared');
    } else {
        showToast('Failed to clear cart. Please try again.');
    }
});

// Escape closes modal/drawer
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') { overlay.classList.remove('open'); closeDrawer(); closeProfileDrawer(); }
});

window.addEventListener('storage', (e) => {
    if (e.key === 'token') {
        if (e.newValue) {
            fetchUserProfile();
            loadCartFromBackend();
        } else {
            cart = [];
            renderCart();
            renderProfileBanner();
        }
    }
});

// ===== Init =====
async function init() {
    fetchUserProfile();
    await loadProducts();        // 1. Load products first (needed for cart rendering)
    await loadCartFromBackend(); // 2. Then load cart from backend
    renderCart();                // 3. Render cart once with both available
}
init();