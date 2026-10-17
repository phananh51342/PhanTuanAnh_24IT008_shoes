let customerCache = [];
const form = document.getElementById("customer-form");
const cancelButton = document.getElementById("customer-cancel");

function resetCustomerForm() {
  form.reset();
  document.getElementById("customer-id").value = "";
  document.getElementById("customer-subscribed").checked = true;
  document.getElementById("customer-save").textContent = "Thêm khách hàng";
  cancelButton.hidden = true;
}

function renderCustomers(customers) {
  const tbody = document.getElementById("customers");
  tbody.replaceChildren();
  for (const customer of customers) {
    const tr = document.createElement("tr");
    [customer.full_name, customer.email, GROUP_LABELS[customer.interest_group] || customer.interest_group].forEach(value => { const td = document.createElement("td"); td.textContent = value; tr.appendChild(td); });
    const subscribed = document.createElement("td"); subscribed.appendChild(Number(customer.subscribed) === 1 ? badge("Đã đăng ký", "badge-green") : badge("Chưa đăng ký", "badge-gray")); tr.appendChild(subscribed);
    const action = document.createElement("td");
    const edit = document.createElement("button"); edit.type = "button"; edit.className = "btn btn-soft"; edit.textContent = "Sửa";
    edit.addEventListener("click", () => {
      document.getElementById("customer-id").value = customer.id;
      document.getElementById("customer-name").value = customer.full_name;
      document.getElementById("customer-email").value = customer.email;
      document.getElementById("customer-group").value = customer.interest_group;
      document.getElementById("customer-subscribed").checked = Number(customer.subscribed) === 1;
      document.getElementById("customer-save").textContent = "Lưu thay đổi";
      cancelButton.hidden = false;
      scrollTo({ top: 0, behavior: "smooth" });
    });
    action.appendChild(edit); tr.appendChild(action); tbody.appendChild(tr);
  }
  if (!customers.length) tbody.innerHTML = '<tr><td colspan="5" class="empty">Không tìm thấy khách hàng.</td></tr>';
}

async function loadCustomers() {
  const status = document.getElementById("customer-status");
  try {
    customerCache = await api("/api/customers");
    renderCustomers(customerCache);
    setMessage(status, `Tổng cộng ${customerCache.length} khách hàng.`);
  } catch (error) { setMessage(status, error.message, "error"); }
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = document.getElementById("customer-id").value;
  const message = document.getElementById("customer-form-message");
  try {
    const result = await api(id ? `/api/customers/${id}` : "/api/customers", {
      method: id ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        full_name: document.getElementById("customer-name").value,
        email: document.getElementById("customer-email").value,
        interest_group: document.getElementById("customer-group").value,
        subscribed: document.getElementById("customer-subscribed").checked
      })
    });
    resetCustomerForm(); setMessage(message, result.message, "success"); await loadCustomers();
  } catch (error) { setMessage(message, error.message, "error"); }
});

cancelButton.addEventListener("click", () => { resetCustomerForm(); setMessage(document.getElementById("customer-form-message"), ""); });
document.getElementById("customer-search").addEventListener("input", (event) => {
  const q = event.target.value.trim().toLowerCase();
  renderCustomers(customerCache.filter(c => !q || c.full_name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)));
});

loadCustomers();
