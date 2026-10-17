const GROUP_LABELS = {
  basketball: "Giày bóng rổ",
  running: "Giày chạy bộ",
  sneaker: "Sneaker",
  general: "Nhóm chung"
};

const CAMPAIGN_STATUS = {
  draft: ["Bản nháp", "badge-gray"],
  approved: ["Đã duyệt", "badge-blue"],
  scheduled: ["Đã hẹn giờ", "badge-violet"],
  sending: ["Đang gửi", "badge-orange"],
  completed: ["Hoàn tất", "badge-green"],
  failed: ["Lỗi", "badge-red"],
  cancelled: ["Đã hủy", "badge-gray"]
};

const RECIPIENT_STATUS = {
  pending: ["Đang chờ", "badge-gray"],
  sending: ["Đang xử lý", "badge-orange"],
  sent: ["Đã gửi", "badge-green"],
  failed: ["Lỗi", "badge-red"],
  skipped: ["Bỏ qua", "badge-gray"]
};

const currency = new Intl.NumberFormat("vi-VN", {
  style: "currency",
  currency: "VND"
});

async function api(url, options = {}) {
  const response = await fetch(url, options);
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json")
    ? await response.json()
    : { error: await response.text() };

  if (!response.ok) {
    throw new Error(data.error || `Yêu cầu thất bại (${response.status})`);
  }
  return data;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[character]));
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString("vi-VN") : "—";
}

function badge(text, className = "badge-gray") {
  const span = document.createElement("span");
  span.className = `badge ${className}`;
  span.textContent = text;
  return span;
}

function statusBadge(status, map = CAMPAIGN_STATUS) {
  const item = map[status] || [status, "badge-gray"];
  return badge(item[0], item[1]);
}

function setMessage(element, text, type = "") {
  element.textContent = text || "";
  element.className = `message${type ? ` ${type}` : ""}`;
}

function markActiveNav() {
  const current = location.pathname.split("/").pop() || "index.html";
  document.querySelectorAll(".nav a").forEach((link) => {
    const href = link.getAttribute("href");
    link.classList.toggle("active", href === current || (current === "" && href === "index.html"));
  });
}

markActiveNav();
