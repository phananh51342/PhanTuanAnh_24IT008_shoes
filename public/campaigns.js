async function loadProductsForCampaign() {
  const select = document.getElementById("campaign-product");
  try {
    const products = await api("/api/products");
    select.replaceChildren(new Option("Chọn sản phẩm", ""));
    for (const product of products) select.add(new Option(product.name, product.id));
  } catch (error) {
    setMessage(document.getElementById("campaign-status"), error.message, "error");
  }
}

async function loadCampaigns() {
  const tbody = document.getElementById("campaign-list");
  const message = document.getElementById("campaign-list-status");
  setMessage(message, "Đang tải...");
  try {
    const campaigns = await api("/api/campaigns");
    tbody.replaceChildren();

    for (const campaign of campaigns) {
      const tr = document.createElement("tr");
      [campaign.id, campaign.name, campaign.product_name, GROUP_LABELS[campaign.target_group] || campaign.target_group].forEach(value => {
        const td = document.createElement("td"); td.textContent = value; tr.appendChild(td);
      });
      const statusTd = document.createElement("td"); statusTd.appendChild(statusBadge(campaign.status)); tr.appendChild(statusTd);
      const actionTd = document.createElement("td"); actionTd.className = "actions";

      const cancel = document.createElement("button");
      cancel.className = "btn btn-warning"; cancel.type = "button"; cancel.textContent = "Hủy gửi";
      cancel.disabled = campaign.status !== "sending";
      cancel.addEventListener("click", async () => {
        if (!confirm(`Hủy gửi chiến dịch #${campaign.id} - ${campaign.name}?`)) return;
        try {
          const result = await api(`/api/campaigns/${campaign.id}/cancel`, { method: "POST" });
          alert(result.message || "Đã hủy chiến dịch.");
          await loadCampaigns();
        } catch (error) { alert(error.message); }
      });

      const del = document.createElement("button");
      del.className = "btn btn-danger"; del.type = "button"; del.textContent = "Xóa";
      del.disabled = campaign.status === "sending";
      del.addEventListener("click", async () => {
        if (!confirm(`Xóa chiến dịch #${campaign.id} - ${campaign.name}?`)) return;
        try {
          await api(`/api/campaigns/${campaign.id}`, { method: "DELETE" });
          await loadCampaigns();
        } catch (error) { alert(error.message); }
      });

      actionTd.append(cancel, del); tr.appendChild(actionTd); tbody.appendChild(tr);
    }

    if (!campaigns.length) tbody.innerHTML = '<tr><td colspan="6" class="empty">Chưa có chiến dịch.</td></tr>';
    setMessage(message, `Có ${campaigns.length} chiến dịch.`);
  } catch (error) {
    setMessage(message, error.message, "error");
  }
}

document.getElementById("campaign-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = document.getElementById("save-campaign");
  const message = document.getElementById("campaign-status");
  button.disabled = true;
  setMessage(message, "Đang lưu...");
  try {
    const result = await api("/api/campaigns", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: document.getElementById("campaign-name").value,
        product_id: document.getElementById("campaign-product").value,
        target_group: document.getElementById("campaign-group").value,
        subject: document.getElementById("campaign-subject").value
      })
    });
    event.target.reset();
    setMessage(message, `${result.message} Mã: ${result.id}`, "success");
    await loadCampaigns();
  } catch (error) {
    setMessage(message, error.message, "error");
  } finally { button.disabled = false; }
});

document.getElementById("refresh-campaigns").addEventListener("click", loadCampaigns);
loadProductsForCampaign();
loadCampaigns();
