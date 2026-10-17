let selectedCampaign = null;
const campaignSelect = document.getElementById("edit-campaign");
const subjectInput = document.getElementById("edit-subject");
const htmlInput = document.getElementById("edit-html");
const editorInfo = document.getElementById("editor-info");
const editorMessage = document.getElementById("editor-message");
const aiProductName = document.getElementById("ai-product-name");
const aiPromotion = document.getElementById("ai-promotion");
const aiTone = document.getElementById("ai-tone");
const aiExtraRequest = document.getElementById("ai-extra-request");
const aiMessage = document.getElementById("ai-message");
const generateAiButton = document.getElementById("generate-ai-email");

function showEmailPreview() {
  const content = htmlInput.value
    .replaceAll("{{name}}", "Khách hàng mẫu")
    .replaceAll("{{product_url}}", "#");
  document.getElementById("email-preview").srcdoc = `<!DOCTYPE html><html lang="vi"><head><meta charset="UTF-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; form-action 'none'; base-uri 'none'"></head><body>${content}</body></html>`;
}

function updateEditorInfo() {
  if (!selectedCampaign) { editorInfo.textContent = "Chưa chọn chiến dịch."; return; }
  const status = CAMPAIGN_STATUS[selectedCampaign.status]?.[0] || selectedCampaign.status;
  editorInfo.textContent = `Sản phẩm: ${selectedCampaign.product_name} • Nhóm: ${GROUP_LABELS[selectedCampaign.target_group] || selectedCampaign.target_group} • Khách đủ điều kiện: ${selectedCampaign.recipient_count} • Trạng thái: ${status}`;
}

async function refreshCampaignOptions() {
  try {
    const campaigns = await api("/api/campaigns");
    const current = campaignSelect.value;
    campaignSelect.replaceChildren(new Option("Chọn chiến dịch cần soạn", ""));
    for (const campaign of campaigns) campaignSelect.add(new Option(`#${campaign.id} — ${campaign.name}`, campaign.id));
    if (campaigns.some(c => String(c.id) === current)) campaignSelect.value = current;
  } catch (error) { setMessage(editorMessage, error.message, "error"); }
}

campaignSelect.addEventListener("change", async () => {
  const id = campaignSelect.value;
  selectedCampaign = null; subjectInput.value = ""; htmlInput.value = ""; setMessage(editorMessage, ""); updateEditorInfo(); showEmailPreview();
  if (!id) return;
  try {
    const campaign = await api(`/api/campaigns/${id}`);
    if (campaignSelect.value !== id) return;
    selectedCampaign = campaign;

subjectInput.value = campaign.subject || "";
htmlInput.value = campaign.html_content || "";

// THÊM DÒNG NÀY
aiProductName.value = campaign.product_name || "";

updateEditorInfo();
showEmailPreview();
  } catch (error) { setMessage(editorMessage, error.message, "error"); }
});
// ==========================
// TẠO EMAIL BẰNG AI
// ==========================
generateAiButton.addEventListener("click", async () => {

  const productName = aiProductName.value.trim();
  const promotion = aiPromotion.value.trim();
  const tone = aiTone.value;
  const extraRequest = aiExtraRequest.value.trim();

  if (!selectedCampaign) {
    return setMessage(
      aiMessage,
      "Chọn chiến dịch trước.",
      "error"
    );
  }

  if (!productName) {
    return setMessage(
      aiMessage,
      "Vui lòng nhập tên sản phẩm.",
      "error"
    );
  }

  if (
    htmlInput.value.trim() &&
    !confirm("Thay nội dung email hiện tại bằng nội dung AI?")
  ) {
    return;
  }

  generateAiButton.disabled = true;
  generateAiButton.textContent = "⏳ AI đang tạo...";

  setMessage(
    aiMessage,
    "AI đang tạo nội dung email...",
    ""
  );

  try {

    const data = await api(
      "/api/ai/generate-email",
      {
        method: "POST",

        headers: {
          "Content-Type": "application/json"
        },

        body: JSON.stringify({
          productName,
          promotion,
          tone,
          extraRequest
        })
      }
    );

    if (!data.subject || !data.html) {
      throw new Error(
        "AI trả về nội dung không hợp lệ."
      );
    }

    // Đổ nội dung AI vào form hiện tại
    subjectInput.value = data.subject;
    htmlInput.value = data.html;

    // Hiện ngay bản xem trước
    showEmailPreview();

    setMessage(
      aiMessage,
      "AI đã tạo xong. Kiểm tra nội dung trước khi lưu hoặc duyệt.",
      "success"
    );

  } catch (error) {

    console.error("Lỗi AI:", error);

    setMessage(
      aiMessage,
      error.message || "Không thể tạo nội dung bằng AI.",
      "error"
    );

  } finally {

    generateAiButton.disabled = false;
    generateAiButton.textContent =
      "✨ Tạo nội dung bằng AI";
  }

});
document.getElementById("make-template").addEventListener("click", () => {
  if (!selectedCampaign) return setMessage(editorMessage, "Chọn chiến dịch trước.", "error");
  if (htmlInput.value.trim() && !confirm("Thay nội dung đang soạn bằng mẫu sản phẩm?")) return;

  const p = selectedCampaign;
  const price = Number(p.sale_price ?? p.price);
  const original = Number(p.price);
  const discount = original > price && original > 0 ? Math.round((1 - price / original) * 100) : 0;
  const priceText = currency.format(price);

  htmlInput.value = `
<div style="max-width:620px;margin:0 auto;background:#fff;font-family:Arial,sans-serif;color:#1f2937;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden">
  <div style="background:#2563eb;color:#fff;text-align:center;padding:28px 20px">
    <h1 style="margin:0">SHOP GIÀY</h1>
    <p style="margin:8px 0 0">Ưu đãi dành riêng cho bạn</p>
  </div>
  <div style="padding:30px">
    <p style="font-size:18px">Xin chào <strong>{{name}}</strong>,</p>
    <p>Shop giới thiệu đến bạn mẫu giày:</p>
    <h2 style="color:#1d4ed8">${escapeHtml(p.product_name)}</h2>
    <p style="line-height:1.7;color:#475569">${escapeHtml(p.description || "Mẫu giày nổi bật đang có tại shop.")}</p>
    <p style="font-size:28px;font-weight:bold;color:#dc2626">${escapeHtml(priceText)}</p>
    ${discount ? `<p style="color:#15803d;font-weight:bold">Giảm ${discount}% so với giá gốc.</p>` : ""}
    <p style="text-align:center;margin:30px 0"><a href="{{product_url}}" style="display:inline-block;background:#2563eb;color:white;text-decoration:none;padding:14px 28px;border-radius:10px;font-weight:bold">Xem sản phẩm</a></p>
    <p style="font-size:13px;color:#64748b">Trả lời email này nếu bạn cần tư vấn thêm về sản phẩm hoặc kích cỡ.</p>
  </div>
</div>`.trim();
  showEmailPreview();
  setMessage(editorMessage, "Đã tạo mẫu sản phẩm. Kiểm tra nội dung rồi lưu/duyệt.", "success");
});

document.getElementById("preview-email").addEventListener("click", showEmailPreview);
document.getElementById("refresh-campaigns").addEventListener("click", refreshCampaignOptions);

async function saveEmail(approve) {
  if (!selectedCampaign) return setMessage(editorMessage, "Chọn chiến dịch trước.", "error");
  if (!subjectInput.value.trim() || !htmlInput.value.trim()) return setMessage(editorMessage, "Nhập đủ tiêu đề và nội dung.", "error");

  const buttons = document.querySelectorAll("button");
  buttons.forEach(b => b.disabled = true);
  try {
    await api(`/api/campaigns/${selectedCampaign.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ subject: subjectInput.value, html_content: htmlInput.value })
    });
    selectedCampaign.status = "draft";
    if (approve) {
      await api(`/api/campaigns/${selectedCampaign.id}/approve`, { method: "POST" });
      selectedCampaign.status = "approved";
    }
    updateEditorInfo();
    setMessage(editorMessage, approve ? "Đã lưu và duyệt. Chưa gửi email." : "Đã lưu bản nháp.", "success");
  } catch (error) { setMessage(editorMessage, error.message, "error"); }
  finally { buttons.forEach(b => b.disabled = false); }
}

document.getElementById("save-email").addEventListener("click", () => saveEmail(false));
document.getElementById("approve-email").addEventListener("click", () => saveEmail(true));

document.getElementById("queue-campaign").addEventListener("click", async () => {
  const message = document.getElementById("delivery-message");
  if (!selectedCampaign) return setMessage(message, "Chọn chiến dịch trước.", "error");
  if (!confirm("Đưa chiến dịch này vào hàng chờ gửi email thật?")) return;
  try {
    const result = await api(`/api/campaigns/${selectedCampaign.id}/queue`, { method: "POST" });
    setMessage(message, result.message, "success");
    selectedCampaign.status = "sending"; updateEditorInfo();
  } catch (error) { setMessage(message, error.message, "error"); }
});

refreshCampaignOptions();
showEmailPreview();
