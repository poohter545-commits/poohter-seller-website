const API_BASE = "https://api.poohter.com/api";
const ASSET_BASE = API_BASE.replace("/api", "");

const readJsonStorage = (key, fallback = null) => {
  try {
    return JSON.parse(localStorage.getItem(key) || "null") || fallback;
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
};

const state = {
  token: localStorage.getItem("poohterSellerToken") || "",
  seller: readJsonStorage("poohterSeller"),
  products: [],
  orders: [],
  wholesaleProducts: [],
  wholesaleOrders: [],
  selectedWholesalerId: "",
  selectedWholesaleProductId: "",
  payouts: null,
  profile: null,
  signupStep: 1,
  signupOtpPending: false,
  resetOtpSent: false,
  otpTimers: {},
  otpResends: { signup: 0, reset: 0 },
};

const approvalPendingMessage = "Waiting for admin approval. Your seller application was submitted successfully and is still under review. You can log in after admin approves your account.";

const isApprovalPendingError = (message = "") => {
  const normalized = String(message).toLowerCase();
  return normalized.includes("admin approval") || normalized.includes("pending approval") || normalized.includes("waiting for admin approval");
};

const $ = (selector) => document.querySelector(selector);
const toast = $("#toast");

const on = (selector, eventName, handler) => {
  const element = $(selector);
  if (element) element.addEventListener(eventName, handler);
};

const showToast = (message, type = "", duration = 3200) => {
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => (toast.className = "toast"), duration);
};

const api = async (path, options = {}) => {
  const headers = options.headers ? { ...options.headers } : {};
  if (state.token) headers.Authorization = `Bearer ${state.token}`;
  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });
  let data = {};
  try {
    data = await response.json();
  } catch {
    data = {};
  }
  if (!response.ok) throw new Error(data.error || data.message || "Request failed");
  return data;
};

const setSession = ({ token, seller }) => {
  state.token = token;
  state.seller = seller;
  localStorage.setItem("poohterSellerToken", token);
  localStorage.setItem("poohterSeller", JSON.stringify(seller));
};

const clearSession = () => {
  state.token = "";
  state.seller = null;
  state.products = [];
  state.orders = [];
  state.wholesaleProducts = [];
  state.wholesaleOrders = [];
  state.selectedWholesalerId = "";
  state.selectedWholesaleProductId = "";
  state.payouts = null;
  state.profile = null;
  localStorage.removeItem("poohterSellerToken");
  localStorage.removeItem("poohterSeller");
};

const showApp = (isAuthed) => {
  $("#authScreen").classList.toggle("hidden", isAuthed);
  $("#appShell").classList.toggle("hidden", !isAuthed);
};

const showAuthMode = (mode) => {
  $("#loginMode").classList.toggle("active", mode === "login");
  $("#signupMode").classList.toggle("active", mode === "signup");
  $("#loginForm").classList.toggle("hidden", mode !== "login");
  $("#signupForm").classList.toggle("hidden", mode !== "signup");
  $("#resetForm").classList.toggle("hidden", mode !== "reset");
};

const setSignupStep = (step) => {
  state.signupStep = Math.max(1, Math.min(4, step));
  document.querySelectorAll("[data-signup-step]").forEach((section) => {
    section.classList.toggle("active", Number(section.dataset.signupStep) === state.signupStep);
  });
  document.querySelectorAll("[data-step-pill]").forEach((pill) => {
    const pillStep = Number(pill.dataset.stepPill);
    pill.classList.toggle("active", pillStep === state.signupStep);
    pill.classList.toggle("completed", pillStep < state.signupStep);
  });
  $("#signupPrev").classList.toggle("hidden", state.signupStep === 1);
  $("#signupNext").classList.toggle("hidden", state.signupStep === 4);
  $("#signupSubmit").classList.toggle("hidden", state.signupStep !== 4);
};

const setSignupOtpMode = (enabled) => {
  const wasEnabled = state.signupOtpPending;
  state.signupOtpPending = enabled;
  $("#signupOtpPanel").classList.toggle("hidden", !enabled);
  const otpInput = $("#signupOtpPanel input[name='otp']");
  if (otpInput) otpInput.required = enabled;
  if (enabled && !wasEnabled) startOtpCooldown("signup");
  $("#signupSubmit").textContent = enabled ? "Verify Email & Submit" : "Create Seller Account";
};

const setResetOtpMode = (enabled) => {
  const wasEnabled = state.resetOtpSent;
  state.resetOtpSent = enabled;
  $("#resetOtpPanel").classList.toggle("hidden", !enabled);
  $("#resetSubmit").textContent = enabled ? "Change Password" : "Send Reset Code";
  $("#resetOtpPanel").querySelectorAll("input").forEach((input) => {
    input.required = enabled;
  });
  if (enabled && !wasEnabled) startOtpCooldown("reset");
};

const startOtpCooldown = (kind, seconds = 60) => {
  const button = kind === "signup" ? $("#signupResendOtp") : $("#resetResendOtp");
  if (!button) return;
  clearInterval(state.otpTimers[kind]);
  let remaining = seconds;
  button.disabled = true;
  button.textContent = `Resend OTP in ${remaining}s`;
  state.otpTimers[kind] = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(state.otpTimers[kind]);
      const used = state.otpResends[kind] || 0;
      button.disabled = used >= 5;
      button.textContent = used >= 5 ? "Resend limit reached" : `Resend OTP (${used}/5)`;
      return;
    }
    button.textContent = `Resend OTP in ${remaining}s`;
  }, 1000);
};

const resendOtp = async (kind) => {
  const email = kind === "signup"
    ? $("#signupForm input[name='email']").value
    : $("#resetForm input[name='email']").value;
  if (!email) return showToast("Enter your email before resending OTP.", "error");
  if ((state.otpResends[kind] || 0) >= 5) return showToast("OTP resend limit reached.", "error");
  const button = kind === "signup" ? $("#signupResendOtp") : $("#resetResendOtp");
  button.disabled = true;
  button.textContent = "Resending...";
  try {
    await api("/auth/otp/resend", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        accountType: "seller",
        purpose: kind === "signup" ? "signup" : "password_reset",
      }),
    });
    state.otpResends[kind] = (state.otpResends[kind] || 0) + 1;
    showToast("A new OTP has been sent to your email.", "success");
    startOtpCooldown(kind);
  } catch (error) {
    showToast(error.message, "error");
    startOtpCooldown(kind, 5);
  }
};

const validateSignupStep = () => {
  const section = document.querySelector(`[data-signup-step="${state.signupStep}"]`);
  const fields = [...section.querySelectorAll("input[required]")];
  for (const field of fields) {
    if (!field.reportValidity()) return false;
  }
  if (state.signupStep === 1) {
    const password = $("#signupForm input[name='password']");
    const confirmPassword = $("#signupForm input[name='confirmPassword']");
    if (password.value !== confirmPassword.value) {
      confirmPassword.setCustomValidity("Passwords do not match.");
      confirmPassword.reportValidity();
      confirmPassword.setCustomValidity("");
      return false;
    }
  }
  return true;
};

const money = (value) => `Rs ${Math.round(Number(value || 0)).toLocaleString()}`;
const WHOLESALE_PAYMENT = {
  method: "Easypaisa",
  accountNumber: "03428787873",
  accountHolder: "Muhammad Saleeem",
};
const wholesalePaymentQrUrl = (amount = 0) => {
  const payload = [
    "Poohter wholesale payment",
    `${WHOLESALE_PAYMENT.method}: ${WHOLESALE_PAYMENT.accountNumber}`,
    `Account holder: ${WHOLESALE_PAYMENT.accountHolder}`,
    `Amount: ${money(amount)}`,
  ].join("\n");
  return `https://api.qrserver.com/v1/create-qr-code/?size=132x132&margin=8&data=${encodeURIComponent(payload)}`;
};
const uploadUrl = (path) => {
  const raw = String(path || "").trim();
  if (!raw) return "";
  if (/^(data:|blob:)/i.test(raw)) return raw;
  const legacyUploadPattern = /^(products|sellers|wholesalers|wholesale)\//;
  const cleanEncodeUri = (value) => {
    try {
      return encodeURI(decodeURI(value));
    } catch {
      return encodeURI(value);
    }
  };
  const assetUrl = (value) => {
    let clean = String(value || "").replace(/\\/g, "/").replace(/^\/+/, "");
    const uploadIndex = clean.lastIndexOf("uploads/");
    if (uploadIndex >= 0) clean = clean.slice(uploadIndex);
    if (legacyUploadPattern.test(clean)) clean = `uploads/${clean}`;
    return cleanEncodeUri(`${ASSET_BASE}/${clean}`);
  };
  if (raw.startsWith("//")) return uploadUrl(`https:${raw}`);
  if (/^https?:/i.test(raw)) {
    try {
      const url = new URL(raw);
      const cleanPath = url.pathname.replace(/^\/+/, "");
      if (url.hostname.endsWith("poohter.com") && (cleanPath.includes("uploads/") || legacyUploadPattern.test(cleanPath))) {
        return assetUrl(cleanPath);
      }
    } catch {
      return cleanEncodeUri(raw);
    }
    return cleanEncodeUri(raw);
  }
  return assetUrl(raw);
};
const escapeHtml = (value = "") =>
  String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  })[char]);

const uniqueUploadUrls = (paths = []) => {
  const seen = new Set();
  return paths
    .map(uploadUrl)
    .filter((url) => {
      if (!url || seen.has(url)) return false;
      seen.add(url);
      return true;
    });
};

const toArrayValue = (value) => {
  if (Array.isArray(value)) return value;
  if (typeof value !== "string") return value ? [value] : [];
  const trimmed = value.trim();
  if (!trimmed) return [];
  if (trimmed.startsWith("[") || trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch {
      return [trimmed];
    }
  }
  return [trimmed];
};

const mediaFilePath = (file) => (
  typeof file === "string" ? file : file?.file_path || file?.path || file?.url || file?.image_url || file?.image || file?.thumbnail
);

const productImageUrls = (product = {}, limit = 3) => {
  const mediaFiles = [
    ...toArrayValue(product.product_images),
    ...toArrayValue(product.image_urls),
    ...toArrayValue(product.images),
    ...toArrayValue(product.gallery_images),
    ...toArrayValue(product.media),
    ...toArrayValue(product.product_media),
    ...toArrayValue(product.media_files),
  ];
  return uniqueUploadUrls([
    mediaFilePath(product.image_url),
    mediaFilePath(product.image),
    mediaFilePath(product.thumbnail),
    ...mediaFiles.map(mediaFilePath),
  ]).slice(0, limit);
};

const wholesaleProductImages = (product = {}) => productImageUrls(product, 3);
const sellerProductImages = (product = {}) => productImageUrls(product, 5);

const wholesalePrimaryImageHtml = (product, className = "wholesale-tile-image") => {
  const image = wholesaleProductImages(product)[0];
  const productName = escapeHtml(productDisplayName(product));
  const fallback = `<span class="wholesale-image-fallback"${image ? " hidden" : ""}>No image</span>`;
  return `
    <div class="${className}">
      ${image ? `<img data-wholesale-img src="${image}" alt="${productName}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false" />` : ""}
      ${fallback}
    </div>
  `;
};

const attachWholesaleImageFallbacks = (root) => {
  if (!root) return;
  root.querySelectorAll("[data-wholesale-img]").forEach((image) => {
    const fallback = image.nextElementSibling;
    const showFallback = () => {
      image.hidden = true;
      if (fallback) fallback.hidden = false;
    };
    image.addEventListener("error", showFallback, { once: true });
    if (image.complete && image.naturalWidth === 0) showFallback();
  });
};

const attachProductImageFallbacks = (root) => {
  if (!root) return;
  root.querySelectorAll("[data-product-img]").forEach((image) => {
    const fallback = image.nextElementSibling;
    const showFallback = () => {
      image.hidden = true;
      if (fallback) fallback.hidden = false;
    };
    image.addEventListener("error", showFallback, { once: true });
    if (image.complete && image.naturalWidth === 0) showFallback();
  });
};

const wholesaleGalleryHtml = (product) => {
  const images = wholesaleProductImages(product);
  if (!images.length) {
    return `<div class="wholesale-gallery empty"><span>W</span></div>`;
  }
  const productName = escapeHtml(productDisplayName(product));
  return `
    <div class="wholesale-gallery image-count-${images.length}">
      ${images.map((image, index) => `
        <figure class="wholesale-gallery-item ${index === 0 ? "is-main" : ""}">
          <img data-wholesale-img src="${image}" alt="${productName} image ${index + 1}" loading="lazy" onerror="this.hidden=true;this.nextElementSibling.hidden=false" />
          <span class="wholesale-image-fallback" hidden>No image</span>
        </figure>
      `).join("")}
      <span class="wholesale-gallery-count">${images.length} image${images.length === 1 ? "" : "s"}</span>
    </div>
  `;
};

const wholesaleCatalogCardHtml = (product) => {
  const productName = escapeHtml(productDisplayName(product));
  return `
    <button class="wholesale-product-tile" type="button" data-wholesale-product-id="${product.id}">
      ${wholesalePrimaryImageHtml(product)}
      <strong>${productName}</strong>
    </button>
  `;
};

const wholesaleSupplierKey = (product = {}) => String(
  product.wholesaler_id ||
  product.wholesaler_user_id ||
  product.supplier_id ||
  product.wholesaler_email ||
  product.wholesaler_phone ||
  product.wholesaler_shop ||
  product.wholesaler_name ||
  "unknown"
).trim();

const wholesaleSupplierList = (products = []) => [...products.reduce((map, product) => {
  const id = wholesaleSupplierKey(product);
  const current = map.get(id) || {
    id,
    shop: product.wholesaler_shop || product.wholesaler_name || "Wholesale supplier",
    city: product.wholesaler_city || "Wholesale city",
    phone: product.wholesaler_phone || "",
    products: [],
  };
  current.products.push(product);
  map.set(id, current);
  return map;
}, new Map()).values()];

const wholesalerCardHtml = (wholesaler) => {
  const stock = wholesaler.products.reduce((sum, product) => sum + Number(product.available_stock || 0), 0);
  const initials = escapeHtml(String(wholesaler.shop || "W").trim().slice(0, 1).toUpperCase() || "W");
  const contact = [wholesaler.city, wholesaler.phone].filter(Boolean).join(" - ");
  return `
    <button class="wholesaler-card" type="button" data-wholesaler-id="${escapeHtml(wholesaler.id)}">
      <span class="wholesaler-avatar">${initials}</span>
      <div>
        <span class="muted">Wholesaler</span>
        <h3>${escapeHtml(wholesaler.shop)}</h3>
        <p>${escapeHtml(contact || "Wholesale supplier")}</p>
      </div>
      <div class="wholesale-meta">
        <span>${wholesaler.products.length} product${wholesaler.products.length === 1 ? "" : "s"}</span>
        <span>${stock} units available</span>
      </div>
    </button>
  `;
};

const wholesaleProductDetailHtml = (product) => {
  const minOrder = Math.max(1, Number(product.min_order_quantity || 1));
  const initialTotal = Number(product.wholesale_price || 0) * minOrder;
  const availableStock = Number(product.available_stock || 0);
  const gallery = wholesaleGalleryHtml(product);
  const imageCount = wholesaleProductImages(product).length;
  const productName = escapeHtml(productDisplayName(product));
  const description = escapeHtml(product.description || "Wholesale supply ready for seller investment.");
  const productUid = escapeHtml(product.product_uid || `Wholesale #${product.id}`);
  const supplierName = escapeHtml(product.wholesaler_shop || product.wholesaler_name || "Wholesale supplier");

  return `
    <article class="wholesale-card">
      ${gallery}
      <div class="wholesale-body">
        <div class="wholesale-title-row">
          <span class="wholesale-sku">${productUid}</span>
          <span class="wholesale-price-pill">${money(product.wholesale_price)} / unit</span>
        </div>
        <div class="wholesale-copy">
          <h3>${productName}</h3>
          <span class="wholesale-supplier-line">${supplierName}</span>
          <p>${description}</p>
        </div>
        <div class="wholesale-meta">
          <span>Min ${minOrder} units</span>
          <span>${availableStock} available</span>
          <span>${imageCount} product image${imageCount === 1 ? "" : "s"}</span>
        </div>
        <form class="wholesale-order-form" data-wholesale-order="${product.id}">
          <div class="wholesale-total-preview">
            <span>Total amount before request</span>
            <strong data-wholesale-total>${money(initialTotal)}</strong>
          </div>
          <div class="wholesale-payment-box">
            <img data-wholesale-qr src="${wholesalePaymentQrUrl(initialTotal)}" alt="Easypaisa payment QR for ${WHOLESALE_PAYMENT.accountNumber}" />
            <div>
              <span>Pay with ${WHOLESALE_PAYMENT.method}</span>
              <strong>${WHOLESALE_PAYMENT.accountNumber}</strong>
              <small>Account holder: ${WHOLESALE_PAYMENT.accountHolder}</small>
            </div>
          </div>
          <div class="wholesale-field-group">
            <label><span>Qty</span><input name="quantity" type="number" min="${minOrder}" max="${availableStock}" value="${minOrder}" data-unit-price="${Number(product.wholesale_price || 0)}" required /></label>
            <label><span>Note</span><input name="note" placeholder="Optional note for admin" /></label>
            <button class="mini-btn" type="submit">Request supply</button>
          </div>
        </form>
      </div>
    </article>
  `;
};

const productDisplayName = (product) => {
  const name = product.name || "Untitled product";
  const urduName = product.name_urdu ? ` (${product.name_urdu})` : "";
  return `${name}${urduName}`;
};

const productThumbHtml = (product) => {
  const image = sellerProductImages(product)[0];
  const productName = escapeHtml(productDisplayName(product));
  const fallbackText = escapeHtml(String(product.name || "P").trim().slice(0, 1).toUpperCase() || "P");
  return `
    <span class="product-thumb">
      ${image ? `<img data-product-img src="${image}" alt="${productName}" loading="lazy" />` : ""}
      <span class="product-thumb-fallback"${image ? " hidden" : ""}>${fallbackText}</span>
    </span>
  `;
};

const productStatusLabel = (status) => {
  const labels = {
    pending: "Pending admin review",
    pending_sending: "Send stock to warehouse",
    warehouse_received: "Warehouse checking",
    topteam_pending: "Top Team pricing",
    live: "Live",
    rejected: "Rejected",
  };
  return labels[status] || status || "pending";
};

const pdfText = (value) =>
  String(value ?? "")
    .replace(/[^\x20-\x7E]/g, "?")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");

const downloadPdf = (filename, title, lines) => {
  const contentLines = [
    "BT",
    "/F1 18 Tf",
    "50 780 Td",
    `(${pdfText(title)}) Tj`,
    "/F1 11 Tf",
    "0 -28 Td",
    ...lines.flatMap((line) => [`(${pdfText(line)}) Tj`, "0 -18 Td"]),
    "ET",
  ];
  const stream = contentLines.join("\n");
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
  ];
  let pdf = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  const blob = new Blob([pdf], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};

const downloadReceipt = (productId) => {
  const product = state.products.find((item) => String(item.id) === String(productId));
  const profile = state.profile?.seller || state.seller || {};
  if (!product?.product_uid || !product?.receipt_code) {
    showToast("Receipt is available after admin approval", "error");
    return;
  }

  const receiptLines = [
    `Receipt Code: ${product.receipt_code}`,
    `Product Unique ID: ${product.product_uid}`,
    `Product: ${productDisplayName(product)}`,
    `Expected Stock: ${product.expected_stock || 0}`,
    `Seller: ${profile.shop_name || profile.name || "Seller"}`,
    `Phone: ${profile.phone || ""}`,
    `Seller CNIC/ID: ${profile.cnic_number || profile.seller_id || ""}`,
    `Generated: ${new Date().toLocaleString()}`,
    "",
    "Send this product stock to the Poohter warehouse with this receipt.",
  ];

  downloadPdf(`${product.receipt_code}.pdf`, "POOHTER WAREHOUSE SENDING RECEIPT", receiptLines);
};

const orderTotal = (order) => {
  if (order.total_price || order.price) return Number(order.total_price || order.price || 0);
  return (order.seller_items || []).reduce((sum, item) => sum + Number(item.unit_price || 0) * Number(item.quantity || 0), 0);
};

const renderMetrics = () => {
  const revenue = state.orders.reduce((sum, order) => sum + orderTotal(order), 0);
  const lowStock = state.products.filter((item) => Number(item.stock_quantity || 0) <= 5).length;
  const pending = state.orders.filter((order) => order.status === "pending").length;
  const pendingPayout = state.payouts?.summary?.pending_payout || 0;
  $("#productCount").textContent = state.products.length;
  $("#orderCount").textContent = state.orders.length;
  $("#revenueTotal").textContent = money(revenue);
  $("#lowStockCount").textContent = lowStock;
  $("#pendingPayoutTotal").textContent = money(pendingPayout);
  $("#attentionCount").textContent = pending + lowStock;
  renderStockAlerts();
};

const renderStockAlerts = () => {
  const alerts = state.products.filter((item) => Number(item.stock_quantity || 0) <= 5).slice(0, 5);
  $("#stockAlerts").innerHTML = alerts.length
    ? alerts
        .map((item) => `
          <div class="stock-alert">
            <strong>!</strong>
            <span>Stock low for <strong>${item.name || "Untitled product"}</strong>. Only ${item.stock_quantity || 0} units left.</span>
          </div>
        `)
        .join("")
    : `<div class="stock-ok">All stock levels are healthy.</div>`;
};

const renderProfile = () => {
  const profile = state.profile?.seller || state.seller || {};
  $("#storeTitle").textContent = profile.shop_name || profile.name || "Poohter Seller";
  $("#storeSubtitle").textContent = profile.email ? `${profile.email} - ${profile.city || "Seller account"}` : "Connected to backend API";
  $("#accountStatus").textContent = `Account status: ${profile.status || "unknown"}`;
  $("#sellerAvatar").textContent = String(profile.name || profile.shop_name || "P").slice(0, 1).toUpperCase();

  const fields = [
    ["Owner", profile.name],
    ["Shop", profile.shop_name],
    ["Email", profile.email],
    ["Phone", profile.phone],
    ["City", profile.city],
    ["Business", profile.business_type],
    ["CNIC", profile.cnic_number || profile.seller_id],
  ];

  $("#profileGrid").innerHTML = fields
    .map(([label, value]) => `<div class="profile-item"><span>${label}</span><strong>${value || "Not provided"}</strong></div>`)
    .join("");
};

const renderOrders = () => {
  const filter = $("#orderFilter").value;
  const orders = filter === "all" ? state.orders : state.orders.filter((order) => order.status === filter);
  $("#ordersList").innerHTML = orders.length
    ? orders
        .map((order) => {
          const id = order.order_code || order.order_id || order.id;
          const items = (order.seller_items || []).map((item) => `<div>${item.name} (x${item.quantity})</div>`).join("") || "No item details";
          return `
            <tr>
              <td><strong>#${id}</strong></td>
              <td>${items}</td>
              <td><strong>${money(orderTotal(order))}</strong></td>
              <td><span class="badge ${order.status}">${order.status || "pending"}</span></td>
              <td>
                <div class="row-actions">
                ${order.status === "pending" ? `<button class="mini-btn" data-ship="${order.order_id || order.id}">Ship</button>` : ""}
                ${order.status === "shipped" ? `<button class="mini-btn" data-deliver="${order.order_id || order.id}">Delivered</button>` : ""}
                </div>
              </td>
            </tr>
          `;
        })
        .join("")
    : `<tr class="empty-row"><td colspan="5">No ${filter === "all" ? "" : filter} orders found.</td></tr>`;
};

const renderProducts = () => {
  const query = $("#productSearch").value.trim().toLowerCase();
  const products = query
    ? state.products.filter((item) => `${item.name || ""} ${item.name_urdu || ""}`.toLowerCase().includes(query))
    : state.products;
  $("#productsList").innerHTML = products.length
    ? products
        .map((product) => {
          const imageCount = Number(product.image_count ?? sellerProductImages(product).length ?? 0);
          const videoCount = Number(product.video_count || 0);
          const mediaDetails = [
            imageCount ? `${imageCount} image${imageCount === 1 ? "" : "s"}` : "No images",
            videoCount ? `${videoCount} video${videoCount === 1 ? "" : "s"}` : "",
          ].filter(Boolean).join(" - ");
          return `
          <tr>
            <td>
              <div class="product-cell">
                ${productThumbHtml(product)}
                <strong>${escapeHtml(productDisplayName(product))}</strong>
              </div>
            </td>
            <td><strong>${money(product.price)}</strong></td>
            <td><strong>${product.expected_stock ?? product.stock_quantity ?? 0}</strong></td>
            <td><span class="badge ${product.status || "pending"}">${productStatusLabel(product.status)}</span></td>
            <td>
              <span class="media-chip">${product.admin_media_required ? "Admin media" : "Seller provided"}</span>
              <span class="muted">${mediaDetails}</span>
            </td>
            <td>
              ${product.product_uid ? `<button class="mini-btn" data-receipt="${product.id}">Download</button><span class="muted">${product.product_uid}</span>` : '<span class="muted">After approval</span>'}
            </td>
          </tr>
        `;
        })
        .join("")
    : `<tr class="empty-row"><td colspan="6">No products found. Add your first listing below.</td></tr>`;
  attachProductImageFallbacks($("#productsList"));
};

const renderPayouts = () => {
  const payoutData = state.payouts || {};
  const summary = payoutData.summary || {};
  const account = payoutData.account || {};
  const payouts = payoutData.payouts || [];
  const payoutRate = "Admin-set price paid to seller";
  $("#payoutRateLabel").textContent = payoutRate;
  $("#payoutSummary").innerHTML = `
    <article><span>Pending payout</span><strong>${money(summary.pending_payout)}</strong></article>
    <article><span>Total sent</span><strong>${money(summary.total_paid)}</strong></article>
    <article><span>Total earned</span><strong>${money(summary.total_earned)}</strong></article>
    <article><span>Last sent</span><strong>${account.last_paid_at ? new Date(account.last_paid_at).toLocaleDateString() : "Not yet"}</strong></article>
  `;

  $("#payoutsList").innerHTML = payouts.length
    ? payouts
        .map((payout) => `
          <tr>
            <td><strong>${payout.payout_code || "Payout"}</strong><span class="muted">${payout.status || "paid"}</span></td>
            <td><strong>${money(payout.amount)}</strong></td>
            <td>${payout.method || "Bank transfer"}</td>
            <td>${payout.reference || "Not provided"}</td>
            <td>${payout.paid_at ? new Date(payout.paid_at).toLocaleDateString() : "Not sent"}</td>
          </tr>
        `)
        .join("")
    : `<tr class="empty-row"><td colspan="5">No payout has been marked sent yet.</td></tr>`;
};

const wholesaleStatusLabel = (status) => {
  const labels = {
    admin_review: "Waiting for admin review",
    approved_by_admin: "Approved, waiting for wholesaler",
    accepted: "Accepted, receipt generated",
    rejected: "Rejected",
  };
  return labels[status] || status || "admin_review";
};

const renderWholesale = () => {
  const products = state.wholesaleProducts || [];
  const orders = state.wholesaleOrders || [];
  const productWrap = $("#wholesaleProducts");
  const orderWrap = $("#wholesaleOrdersList");
  if (!productWrap || !orderWrap) return;

  const wholesalers = wholesaleSupplierList(products);
  const selectedWholesaler = wholesalers.find((wholesaler) => wholesaler.id === state.selectedWholesalerId);
  if (state.selectedWholesalerId && !selectedWholesaler) {
    state.selectedWholesalerId = "";
    state.selectedWholesaleProductId = "";
  }

  const productScope = selectedWholesaler ? selectedWholesaler.products : [];
  const selectedProduct = productScope.find((product) => String(product.id) === String(state.selectedWholesaleProductId));
  if (state.selectedWholesaleProductId && !selectedProduct) {
    state.selectedWholesaleProductId = "";
  }

  if (!products.length) {
    productWrap.innerHTML = `<div class="stock-ok">No wholesale products are available yet.</div>`;
  } else if (!selectedWholesaler) {
    productWrap.innerHTML = `
      <div class="wholesale-directory">
        ${wholesalers.map(wholesalerCardHtml).join("")}
      </div>
    `;
  } else if (!selectedProduct) {
    productWrap.innerHTML = `
      <div class="wholesale-selected-head">
        <div>
          <span class="muted">Selected wholesaler</span>
          <h3>${escapeHtml(selectedWholesaler.shop)}</h3>
          <p>${escapeHtml([selectedWholesaler.city, selectedWholesaler.phone].filter(Boolean).join(" - ") || "Wholesale supplier")}</p>
        </div>
        <button class="outline-btn" type="button" data-wholesale-supplier-back>All wholesalers</button>
      </div>
      <div class="wholesale-product-browser">
        ${selectedWholesaler.products.map(wholesaleCatalogCardHtml).join("")}
      </div>
    `;
  } else {
    productWrap.innerHTML = `
      <div class="wholesale-selected-head">
        <div>
          <span class="muted">Product order</span>
          <h3>${escapeHtml(productDisplayName(selectedProduct))}</h3>
          <p>${escapeHtml(selectedProduct.wholesaler_shop || selectedProduct.wholesaler_name || "Wholesale supplier")}</p>
        </div>
        <button class="outline-btn" type="button" data-wholesale-product-back>Back to products</button>
      </div>
      <div class="wholesale-detail">
        ${wholesaleProductDetailHtml(selectedProduct)}
      </div>
    `;
  }
  attachWholesaleImageFallbacks(productWrap);

  orderWrap.innerHTML = orders.length
    ? orders
        .map((order) => `
          <tr>
            <td><strong>${order.order_code}</strong><span class="muted">${order.linked_product_uid || "Product ID after acceptance"}</span></td>
            <td><strong>${order.product_name}</strong><span class="muted">${order.wholesaler_shop || order.wholesaler_name}</span></td>
            <td>${order.quantity}</td>
            <td><strong>${money(order.total_price)}</strong></td>
            <td><span class="badge ${order.status}">${wholesaleStatusLabel(order.status)}</span></td>
          </tr>
        `)
        .join("")
    : `<tr class="empty-row"><td colspan="5">No wholesale supply requests yet.</td></tr>`;
};

const renderAll = () => {
  renderProfile();
  renderMetrics();
  renderOrders();
  renderProducts();
  renderWholesale();
  renderPayouts();
};

const loadDashboard = async () => {
  if (!state.token) return;
  try {
    const [profile, products, orders, payouts, wholesaleProducts, wholesaleOrders] = await Promise.all([
      api("/seller/profile").catch(() => null),
      api("/seller/products").catch(() => []),
      api("/seller/orders").catch(() => []),
      api("/seller/payouts").catch(() => null),
      api("/seller/wholesale/products").catch(() => []),
      api("/seller/wholesale/orders").catch(() => []),
    ]);
    state.profile = profile;
    state.products = Array.isArray(products) ? products : [];
    state.orders = Array.isArray(orders) ? orders : [];
    state.payouts = payouts;
    state.wholesaleProducts = Array.isArray(wholesaleProducts) ? wholesaleProducts : [];
    state.wholesaleOrders = Array.isArray(wholesaleOrders) ? wholesaleOrders : [];
    renderAll();
  } catch (error) {
    showToast(error.message, "error");
  }
};

on("#loginMode", "click", () => {
  showAuthMode("login");
});

on("#signupMode", "click", () => {
  showAuthMode("signup");
  setSignupOtpMode(false);
  setSignupStep(1);
});

on("#forgotPassword", "click", () => {
  $("#resetForm input[name='email']").value = $("#loginForm input[name='email']").value;
  setResetOtpMode(false);
  showAuthMode("reset");
});

on("#resetBack", "click", () => {
  showAuthMode("login");
});

on("#signupNext", "click", () => {
  if (validateSignupStep()) setSignupStep(state.signupStep + 1);
});

on("#signupPrev", "click", () => {
  setSignupStep(state.signupStep - 1);
});

on("#loginForm", "submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  try {
    const result = await api("/seller/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
    });
    setSession(result);
    showApp(true);
    await loadDashboard();
    showToast("Login successful", "success");
  } catch (error) {
    if (isApprovalPendingError(error.message)) {
      showToast(approvalPendingMessage, "error", 6500);
      return;
    }
    showToast(error.message, "error");
  }
});

on("#signupForm", "submit", async (event) => {
  event.preventDefault();
  const submitButton = $("#signupSubmit");
  const originalText = submitButton.textContent;
  submitButton.disabled = true;
  submitButton.textContent = state.signupOtpPending ? "Verifying..." : "Sending OTP...";
  const formData = new FormData(event.currentTarget);
  const front = formData.get("cnic_front");
  const back = formData.get("cnic_back");
  if (!front?.size) formData.delete("cnic_front");
  if (!back?.size) formData.delete("cnic_back");
  try {
    const result = state.signupOtpPending
      ? await api("/seller/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: formData.get("email"),
          otp: formData.get("otp"),
        }),
      })
      : await api("/seller/register", { method: "POST", body: formData });
    if (result.requiresOtp) {
      setSignupOtpMode(true);
      state.otpResends.signup = 0;
      showToast(result.message || "OTP sent to your email.", "success");
      return;
    }
    event.currentTarget.reset();
    showAuthMode("login");
    setSignupOtpMode(false);
    setSignupStep(1);
    showToast(result.message || approvalPendingMessage, "success", 6500);
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = state.signupOtpPending ? "Verify Email & Submit" : originalText;
  }
});

on("#resetForm", "submit", async (event) => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const submitButton = $("#resetSubmit");
  submitButton.disabled = true;
  submitButton.textContent = state.resetOtpSent ? "Changing..." : "Sending...";
  try {
    const email = form.get("email");
    if (!state.resetOtpSent) {
      const result = await api("/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, accountType: "seller" }),
      });
      setResetOtpMode(true);
      state.otpResends.reset = 0;
      showToast(result.message || "Reset OTP sent to your email.", "success");
      return;
    }
    if (form.get("password") !== form.get("confirmPassword")) {
      showToast("Passwords do not match.", "error");
      return;
    }
    const result = await api("/auth/password/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        accountType: "seller",
        otp: form.get("otp"),
        password: form.get("password"),
        confirmPassword: form.get("confirmPassword"),
      }),
    });
    event.currentTarget.reset();
    setResetOtpMode(false);
    showAuthMode("login");
    showToast(result.message || "Password changed. Please login.", "success");
  } catch (error) {
    showToast(error.message, "error");
  } finally {
    submitButton.disabled = false;
    setResetOtpMode(state.resetOtpSent);
  }
});

on("#signupResendOtp", "click", () => resendOtp("signup"));
on("#resetResendOtp", "click", () => resendOtp("reset"));

on("#productForm", "submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  const formData = new FormData(form);

  const images = formData.getAll("product_images");
  if (!images.some((file) => file && file.size)) formData.delete("product_images");
  const video = formData.get("product_video");
  if (!video?.size) formData.delete("product_video");

  try {
    const result = await api("/seller/products", { method: "POST", body: formData });
    form.reset();
    await loadDashboard();
    showToast("Product submitted", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
});

on("#translateProductName", "click", async () => {
  const nameInput = $("#productNameInput");
  const urduInput = $("#productForm input[name='name_urdu']");
  const name = nameInput.value.trim();
  if (!name) {
    nameInput.reportValidity();
    return;
  }
  try {
    $("#translateProductName").textContent = "Translating";
    const response = await fetch(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(name)}&langpair=en|ur`);
    const data = await response.json();
    urduInput.value = data.responseData?.translatedText || `(Urdu) ${name}`;
    showToast("Urdu name added", "success");
  } catch (error) {
    urduInput.value = `(Urdu) ${name}`;
    showToast("Translation service unavailable, placeholder added", "error");
  } finally {
    $("#translateProductName").textContent = "Translate";
  }
});

on("#ordersList", "click", async (event) => {
  const ship = event.target.closest("[data-ship]");
  const deliver = event.target.closest("[data-deliver]");
  const id = ship?.dataset.ship || deliver?.dataset.deliver;
  const status = ship ? "shipped" : deliver ? "delivered" : "";
  if (!id || !status) return;
  try {
    await api(`/seller/orders/${id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    await loadDashboard();
    showToast("Order updated", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
});

on("#orderFilter", "change", renderOrders);
on("#productSearch", "input", renderProducts);
on("#productsList", "click", (event) => {
  const button = event.target.closest("[data-receipt]");
  if (!button) return;
  downloadReceipt(button.dataset.receipt);
});
on("#wholesaleProducts", "input", (event) => {
  const quantityInput = event.target.closest("[name='quantity'][data-unit-price]");
  if (!quantityInput) return;
  const form = quantityInput.closest("[data-wholesale-order]");
  const quantity = Number(quantityInput.value || 0);
  const unitPrice = Number(quantityInput.dataset.unitPrice || 0);
  const total = Math.max(0, quantity) * unitPrice;
  const totalTarget = form?.querySelector("[data-wholesale-total]");
  const qrTarget = form?.querySelector("[data-wholesale-qr]");
  if (totalTarget) totalTarget.textContent = money(total);
  if (qrTarget) qrTarget.src = wholesalePaymentQrUrl(total);
});
on("#wholesaleProducts", "submit", async (event) => {
  const form = event.target.closest("[data-wholesale-order]");
  if (!form) return;
  event.preventDefault();
  const formData = new FormData(form);
  const quantity = Number(formData.get("quantity"));
  const unitPrice = Number(form.querySelector("[name='quantity']")?.dataset.unitPrice || 0);
  const total = quantity * unitPrice;
  const confirmed = window.confirm(
    `Wholesale request total: ${money(total)}\n\nPay ${WHOLESALE_PAYMENT.method} ${WHOLESALE_PAYMENT.accountNumber}\nAccount holder: ${WHOLESALE_PAYMENT.accountHolder}\n\nSend this request now?`
  );
  if (!confirmed) return;
  try {
    await api("/seller/wholesale/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: form.dataset.wholesaleOrder,
        quantity,
        note: formData.get("note"),
      }),
    });
    form.reset();
    await loadDashboard();
    showToast("Wholesale request sent to admin", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
});
on("#wholesaleProducts", "click", (event) => {
  const wholesalerButton = event.target.closest("[data-wholesaler-id]");
  const productButton = event.target.closest("[data-wholesale-product-id]");
  const supplierBackButton = event.target.closest("[data-wholesale-supplier-back]");
  const productBackButton = event.target.closest("[data-wholesale-product-back]");
  if (wholesalerButton) {
    state.selectedWholesalerId = wholesalerButton.dataset.wholesalerId;
    state.selectedWholesaleProductId = "";
    renderWholesale();
  }
  if (productButton) {
    state.selectedWholesaleProductId = productButton.dataset.wholesaleProductId;
    renderWholesale();
  }
  if (productBackButton) {
    state.selectedWholesaleProductId = "";
    renderWholesale();
  }
  if (supplierBackButton) {
    state.selectedWholesalerId = "";
    state.selectedWholesaleProductId = "";
    renderWholesale();
  }
});
on("#refreshBtn", "click", loadDashboard);
on("#logoutBtn", "click", () => {
  clearSession();
  showApp(false);
  showToast("Logged out");
});

document.querySelectorAll(".nav a").forEach((link) => {
  link.addEventListener("click", () => {
    document.querySelectorAll(".nav a").forEach((item) => item.classList.remove("active"));
    link.classList.add("active");
    if (link.getAttribute("href") === "#wholesale") {
      state.selectedWholesalerId = "";
      state.selectedWholesaleProductId = "";
      renderWholesale();
    }
  });
});

showApp(Boolean(state.token));
if (state.token) loadDashboard();
