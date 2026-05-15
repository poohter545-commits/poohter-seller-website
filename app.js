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
  payouts: null,
  profile: null,
  signupStep: 1,
};

const $ = (selector) => document.querySelector(selector);
const toast = $("#toast");

const on = (selector, eventName, handler) => {
  const element = $(selector);
  if (element) element.addEventListener(eventName, handler);
};

const showToast = (message, type = "") => {
  toast.textContent = message;
  toast.className = `toast show ${type}`;
  setTimeout(() => (toast.className = "toast"), 3200);
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
  state.payouts = null;
  state.profile = null;
  localStorage.removeItem("poohterSellerToken");
  localStorage.removeItem("poohterSeller");
};

const showApp = (isAuthed) => {
  $("#authScreen").classList.toggle("hidden", isAuthed);
  $("#appShell").classList.toggle("hidden", !isAuthed);
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
const uploadUrl = (path) => {
  if (!path) return "";
  if (String(path).startsWith("http")) return path;
  return `${ASSET_BASE}/${String(path).replace(/^uploads[\\/]/, "uploads/").replace(/\\/g, "/")}`;
};

const productDisplayName = (product) => {
  const name = product.name || "Untitled product";
  const urduName = product.name_urdu ? ` (${product.name_urdu})` : "";
  return `${name}${urduName}`;
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
        .map((product) => `
          <tr>
            <td><strong>${productDisplayName(product)}</strong></td>
            <td><strong>${money(product.price)}</strong></td>
            <td><strong>${product.expected_stock ?? product.stock_quantity ?? 0}</strong></td>
            <td><span class="badge ${product.status || "pending"}">${productStatusLabel(product.status)}</span></td>
            <td>${product.admin_media_required ? '<span class="media-chip">Admin media</span>' : '<span class="muted">Seller provided</span>'}</td>
            <td>
              ${product.product_uid ? `<button class="mini-btn" data-receipt="${product.id}">Download</button><span class="muted">${product.product_uid}</span>` : '<span class="muted">After approval</span>'}
            </td>
          </tr>
        `)
        .join("")
    : `<tr class="empty-row"><td colspan="6">No products found. Add your first listing below.</td></tr>`;
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

  const wholesalers = [...products.reduce((map, product) => {
    const id = String(product.wholesaler_id || "");
    if (!id) return map;
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

  if (state.selectedWholesalerId && !wholesalers.some((wholesaler) => wholesaler.id === state.selectedWholesalerId)) {
    state.selectedWholesalerId = "";
  }

  const selectedWholesaler = wholesalers.find((wholesaler) => wholesaler.id === state.selectedWholesalerId);

  if (!products.length) {
    productWrap.innerHTML = `<div class="stock-ok">No wholesale products are available yet.</div>`;
  } else if (!selectedWholesaler) {
    productWrap.innerHTML = `
      <div class="wholesale-directory">
        ${wholesalers.map((wholesaler) => {
          const stock = wholesaler.products.reduce((sum, product) => sum + Number(product.available_stock || 0), 0);
          return `
            <article class="wholesaler-card">
              <div>
                <span class="muted">Wholesaler</span>
                <h3>${wholesaler.shop}</h3>
                <p>${wholesaler.city}${wholesaler.phone ? ` - ${wholesaler.phone}` : ""}</p>
              </div>
              <div class="wholesale-meta">
                <span>${wholesaler.products.length} products</span>
                <span>${stock} units available</span>
              </div>
              <button class="mini-btn" type="button" data-wholesaler-id="${wholesaler.id}">View products</button>
            </article>
          `;
        }).join("")}
      </div>
    `;
  } else {
    productWrap.innerHTML = `
      <div class="wholesale-selected-head">
        <div>
          <span class="muted">Selected wholesaler</span>
          <h3>${selectedWholesaler.shop}</h3>
          <p>${selectedWholesaler.city}${selectedWholesaler.phone ? ` - ${selectedWholesaler.phone}` : ""}</p>
        </div>
        <button class="outline-btn" type="button" data-wholesale-back>All wholesalers</button>
      </div>
      <div class="wholesale-product-list">
        ${selectedWholesaler.products.map((product) => {
          const minOrder = Math.max(25, Number(product.min_order_quantity || 25));
          const image = uploadUrl(product.image_url);
          return `
            <article class="wholesale-card">
              <div class="wholesale-image">${image ? `<img src="${image}" alt="${product.name}" />` : `<span>W</span>`}</div>
              <div class="wholesale-body">
                <div>
                  <span class="muted">${product.product_uid || `Wholesale #${product.id}`}</span>
                  <h3>${product.name}</h3>
                  <p>${product.description || "Wholesale supply ready for seller investment."}</p>
                </div>
                <div class="wholesale-meta">
                  <strong>${money(product.wholesale_price)}</strong>
                  <span>Min ${minOrder} units</span>
                  <span>${product.available_stock} available</span>
                </div>
                <form class="wholesale-order-form" data-wholesale-order="${product.id}">
                  <input name="quantity" type="number" min="${minOrder}" max="${product.available_stock}" value="${minOrder}" required />
                  <input name="note" placeholder="Optional note for admin" />
                  <button class="mini-btn" type="submit">Request</button>
                </form>
              </div>
            </article>
          `;
        }).join("")}
      </div>
    `;
  }

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
  $("#loginMode").classList.add("active");
  $("#signupMode").classList.remove("active");
  $("#loginForm").classList.remove("hidden");
  $("#signupForm").classList.add("hidden");
});

on("#signupMode", "click", () => {
  $("#signupMode").classList.add("active");
  $("#loginMode").classList.remove("active");
  $("#signupForm").classList.remove("hidden");
  $("#loginForm").classList.add("hidden");
  setSignupStep(1);
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
    showToast(error.message, "error");
  }
});

on("#signupForm", "submit", async (event) => {
  event.preventDefault();
  const formData = new FormData(event.currentTarget);
  const front = formData.get("cnic_front");
  const back = formData.get("cnic_back");
  if (!front?.size) formData.delete("cnic_front");
  if (!back?.size) formData.delete("cnic_back");
  try {
    const result = await api("/seller/register", { method: "POST", body: formData });
    event.currentTarget.reset();
    $("#loginMode").classList.add("active");
    $("#signupMode").classList.remove("active");
    $("#loginForm").classList.remove("hidden");
    $("#signupForm").classList.add("hidden");
    setSignupStep(1);
    showToast(result.message || "Seller account submitted. Admin approval is required before login.", "success");
  } catch (error) {
    showToast(error.message, "error");
  }
});

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
on("#wholesaleProducts", "submit", async (event) => {
  const form = event.target.closest("[data-wholesale-order]");
  if (!form) return;
  event.preventDefault();
  try {
    await api("/seller/wholesale/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        product_id: form.dataset.wholesaleOrder,
        quantity: Number(new FormData(form).get("quantity")),
        note: new FormData(form).get("note"),
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
  const backButton = event.target.closest("[data-wholesale-back]");
  if (wholesalerButton) {
    state.selectedWholesalerId = wholesalerButton.dataset.wholesalerId;
    renderWholesale();
  }
  if (backButton) {
    state.selectedWholesalerId = "";
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
  });
});

showApp(Boolean(state.token));
if (state.token) loadDashboard();
