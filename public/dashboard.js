(async function loadDashboard() {
  const message = document.getElementById("dashboard-message");
  try {
    const [products, customers, campaigns] = await Promise.all([
      api("/api/products"),
      api("/api/customers"),
      api("/api/campaigns")
    ]);

    document.getElementById("stat-products").textContent = products.length;
    document.getElementById("stat-customers").textContent = customers.length;
    document.getElementById("stat-campaigns").textContent = campaigns.length;
    document.getElementById("stat-sending").textContent = campaigns.filter(c => c.status === "sending").length;

    const tbody = document.getElementById("recent-campaigns");
    tbody.replaceChildren();
    for (const campaign of campaigns.slice(0, 6)) {
      const tr = document.createElement("tr");
      const id = document.createElement("td"); id.textContent = campaign.id;
      const name = document.createElement("td"); name.textContent = campaign.name;
      const status = document.createElement("td"); status.appendChild(statusBadge(campaign.status));
      tr.append(id, name, status);
      tbody.appendChild(tr);
    }
    if (!campaigns.length) {
      tbody.innerHTML = '<tr><td colspan="3" class="empty">Chưa có chiến dịch.</td></tr>';
    }
  } catch (error) {
    setMessage(message, error.message, "error");
  }
})();
