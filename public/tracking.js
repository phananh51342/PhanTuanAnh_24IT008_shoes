const trackingSelect = document.getElementById("tracking-campaign");
const trackingMessage = document.getElementById("tracking-message");

async function loadCampaignOptions() {
  try {
    const campaigns = await api("/api/campaigns");
    trackingSelect.replaceChildren(new Option("Chọn chiến dịch", ""));
    for (const c of campaigns) trackingSelect.add(new Option(`#${c.id} — ${c.name}`, c.id));
  } catch (error) { setMessage(trackingMessage, error.message, "error"); }
}

async function loadTracking() {
  const id = trackingSelect.value;
  const tbody = document.getElementById("tracking-results");
  if (!id) return setMessage(trackingMessage, "Chọn chiến dịch để xem kết quả.", "error");
  setMessage(trackingMessage, "Đang tải...");
  try {
    const rows = await api(`/api/campaigns/${id}/recipients`);
    tbody.replaceChildren();
    let sent = 0, opened = 0, clicked = 0;

    for (const item of rows) {
      if (item.status === "sent") sent++;
      if (item.first_opened_at) opened++;
      if (item.first_clicked_at) clicked++;
      const tr = document.createElement("tr");
      const name = document.createElement("td");
name.textContent = item.full_name;

const email = document.createElement("td");
email.textContent = item.recipient_email;

const round = document.createElement("td");
round.textContent = `Lần ${item.send_round}`;

const status = document.createElement("td");
status.appendChild(
  statusBadge(item.status, RECIPIENT_STATUS)
);
      const sentAt = document.createElement("td"); sentAt.textContent = formatDate(item.sent_at);
      const openAt = document.createElement("td"); openAt.textContent = item.first_opened_at ? `Đã ghi nhận • ${formatDate(item.first_opened_at)}` : "Chưa ghi nhận";
      const clickAt = document.createElement("td"); clickAt.textContent = item.first_clicked_at ? `Đã ghi nhận • ${formatDate(item.first_clicked_at)}` : "Chưa ghi nhận";
      const err = document.createElement("td"); err.textContent = item.error_message || "—";
      tr.append(
  name,
  email,
  round,
  status,
  sentAt,
  openAt,
  clickAt,
  err
); tbody.appendChild(tr);
    }

    if (!rows.length) tbody.innerHTML = '<tr><td colspan="8" class="empty">Chiến dịch chưa có người nhận trong hàng chờ.</td></tr>';
    document.getElementById("track-total").textContent = rows.length;
    document.getElementById("track-sent").textContent = sent;
    document.getElementById("track-open").textContent = opened;
    document.getElementById("track-click").textContent = clicked;
    setMessage(trackingMessage, `Đã tải ${rows.length} người nhận.`, "success");
  } catch (error) { setMessage(trackingMessage, error.message, "error"); }
}

document.getElementById("refresh-tracking").addEventListener("click", loadTracking);
trackingSelect.addEventListener("change", loadTracking);
loadCampaignOptions();
