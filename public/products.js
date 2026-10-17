let currentProducts = [];

function resetProductForm() {
  const form = document.getElementById("product-form");
  form.reset();
  document.getElementById("product-id").value = "";
  document.getElementById("product-save").textContent = "Thêm mẫu giày";
  document.getElementById("product-cancel").hidden = true;
}

function editProduct(product) {
  document.getElementById("product-id").value = product.id;
  document.getElementById("product-name").value = product.name || "";
  document.getElementById("product-category").value = product.category || "general";
  document.getElementById("product-price").value = product.price ?? "";
  document.getElementById("product-sale-price").value = product.sale_price ?? "";
  document.getElementById("product-image-url").value = product.image_url || "";
  document.getElementById("product-url").value = product.product_url || "";
  document.getElementById("product-description").value = product.description || "";
  document.getElementById("product-save").textContent = "Lưu thay đổi";
  document.getElementById("product-cancel").hidden = false;
  document.getElementById("product-form-message").textContent = "Đang sửa sản phẩm #" + product.id;
  document.getElementById("product-name").focus();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function deleteProduct(product) {
  const ok = window.confirm(`Xóa sản phẩm #${product.id} - ${product.name}?`);
  if (!ok) return;

  try {
    const result = await api(`/api/products/${product.id}`, {
      method: "DELETE"
    });
    setMessage(
      document.getElementById("product-form-message"),
      result.message || "Đã xóa sản phẩm.",
      "success"
    );
    if (String(document.getElementById("product-id").value) === String(product.id)) {
      resetProductForm();
    }
    await loadProducts();
  } catch (error) {
    setMessage(
      document.getElementById("product-form-message"),
      error.message,
      "error"
    );
  }
}

async function loadProducts() {
  const container = document.getElementById("products");
  const status = document.getElementById("product-status");
  try {
    const products = await api("/api/products");
    currentProducts = products;
    container.replaceChildren();

    for (const product of products) {
      const card = document.createElement("article");
      card.className = "product-card";

      const image = document.createElement("div");
      image.className = "product-image";
      if (product.image_url) {
        const img = document.createElement("img");
        img.src = product.image_url;
        img.alt = product.name;
        img.referrerPolicy = "no-referrer";
        image.appendChild(img);
      } else {
        image.textContent = "👟";
      }

      const content = document.createElement("div");
      content.className = "product-content";

      const name = document.createElement("h3");
      name.textContent = product.name;

      const category = badge(
        GROUP_LABELS[product.category] || product.category,
        "badge-blue"
      );

      const description = document.createElement("p");
      description.textContent = product.description || "Chưa có mô tả.";

      const price = document.createElement("div");
      price.className = "product-price";
      price.textContent = currency.format(
        Number(product.sale_price ?? product.price)
      );

      if (
        product.sale_price !== null &&
        product.sale_price !== "" &&
        Number(product.sale_price) < Number(product.price)
      ) {
        const old = document.createElement("span");
        old.className = "product-old-price";
        old.textContent = currency.format(Number(product.price));
        price.appendChild(old);
      }

      const actions = document.createElement("div");
      actions.className = "product-actions";

      const editButton = document.createElement("button");
      editButton.type = "button";
      editButton.className = "btn btn-soft";
      editButton.textContent = "Sửa";
      editButton.addEventListener("click", () => editProduct(product));

      const deleteButton = document.createElement("button");
      deleteButton.type = "button";
      deleteButton.className = "btn btn-danger";
      deleteButton.textContent = "Xóa";
      deleteButton.addEventListener("click", () => deleteProduct(product));

      actions.append(editButton, deleteButton);
      content.append(name, category, description, price, actions);
      card.append(image, content);
      container.appendChild(card);
    }

    status.textContent = `Có ${products.length} sản phẩm.`;
  } catch (error) {
    status.textContent = error.message;
  }
}

document.getElementById("product-form").addEventListener("submit", async (event) => {
  event.preventDefault();

  const id = document.getElementById("product-id").value;
  const message = document.getElementById("product-form-message");
  const saveButton = document.getElementById("product-save");

  const data = {
    name: document.getElementById("product-name").value,
    category: document.getElementById("product-category").value,
    price: document.getElementById("product-price").value,
    sale_price: document.getElementById("product-sale-price").value,
    image_url: document.getElementById("product-image-url").value,
    product_url: document.getElementById("product-url").value,
    description: document.getElementById("product-description").value
  };

  saveButton.disabled = true;

  try {
    const result = await api(
      id ? `/api/products/${id}` : "/api/products",
      {
        method: id ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      }
    );

    resetProductForm();
    setMessage(
      message,
      result.message || (id ? "Đã cập nhật sản phẩm." : "Đã thêm mẫu giày."),
      "success"
    );
    await loadProducts();
  } catch (error) {
    setMessage(message, error.message, "error");
  } finally {
    saveButton.disabled = false;
  }
});

document.getElementById("product-cancel").addEventListener("click", () => {
  resetProductForm();
  document.getElementById("product-form-message").textContent = "";
});

loadProducts();
