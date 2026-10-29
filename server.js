require("dotenv").config();

const crypto = require("crypto");
const path = require("path");

const express = require("express");
const mysql = require("mysql2/promise");

const session = require("express-session");
const bcrypt = require("bcryptjs");

const app = express();

app.use((req, res, next) => {
  console.log("Nhận yêu cầu:", req.method, req.url);
  next();
});
app.use(express.json());
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: 1000 * 60 * 60 * 8
    }
  })
);

const pool = mysql.createPool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 5
});
function requireAdmin(req, res, next) {
  if (req.session && req.session.admin) {
    return next();
  }

  return res.status(401).json({
    error: "Vui lòng đăng nhập Admin."
  });
}
app.post("/api/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (
      typeof username !== "string" ||
      typeof password !== "string"
    ) {
      return res.status(400).json({
        error: "Nhập tài khoản và mật khẩu."
      });
    }

    const usernameOk =
      username === process.env.ADMIN_USERNAME;

    const passwordOk =
      await bcrypt.compare(
        password,
        process.env.ADMIN_PASSWORD_HASH || ""
      );

    if (!usernameOk || !passwordOk) {
      return res.status(401).json({
        error: "Sai tài khoản hoặc mật khẩu."
      });
    }

    req.session.admin = {
      username
    };

    return res.json({
      message: "Đăng nhập thành công."
    });

  } catch (error) {
    console.error("Lỗi đăng nhập:", error);

    return res.status(500).json({
      error: "Không thể đăng nhập."
    });
  }
});
app.get("/api/auth/me", (req, res) => {
  if (!req.session.admin) {
    return res.status(401).json({
      loggedIn: false
    });
  }

  return res.json({
    loggedIn: true,
    username: req.session.admin.username
  });
});


app.post("/api/auth/logout", (req, res) => {
  req.session.destroy((error) => {
    if (error) {
      return res.status(500).json({
        error: "Không đăng xuất được."
      });
    }

    res.clearCookie("connect.sid");

    return res.json({
      message: "Đã đăng xuất."
    });
  });
});
const adminPages = new Set([
  "/",
  "/index.html",
  "/campaigns.html",
  "/email.html",
  "/tracking.html",
  "/products.html",
  "/customers.html"
]);


app.use((req, res, next) => {

  if (
    adminPages.has(req.path) &&
    !req.session.admin
  ) {
    return res.redirect("/login.html");
  }

  next();
});
app.use(express.static(path.join(__dirname, "public")));

// Lấy danh sách khách hàng
app.get("/api/customers", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      `SELECT id, full_name, email, interest_group, subscribed
       FROM customers ORDER BY id DESC`
    );
    res.json(rows);
  } catch (error) {
    console.error("Lỗi lấy khách hàng:", error.message);
    res.status(500).json({ error: "Không lấy được khách hàng" });
  }
});
// Thêm khách hàng
app.post("/api/customers", async (req, res) => {
  const {
    full_name,
    email,
    interest_group,
    subscribed
  } = req.body;

  const validGroups = [
    "basketball",
    "running",
    "sneaker",
    "general"
  ];

  if (
    typeof full_name !== "string" ||
    !full_name.trim() ||
    typeof email !== "string" ||
    !email.trim() ||
    !validGroups.includes(interest_group)
  ) {
    return res.status(400).json({
      error: "Thông tin khách hàng không hợp lệ."
    });
  }

  try {
    const receiveAds = Boolean(subscribed);

    const [result] = await pool.execute(`
      INSERT INTO customers
      (
        full_name,
        email,
        interest_group,
        subscribed,
        consent_at
      )
      VALUES (?, ?, ?, ?, ?)
    `, [
      full_name.trim(),
      email.trim().toLowerCase(),
      interest_group,
      receiveAds,
      receiveAds ? new Date() : null
    ]);

    res.status(201).json({
      id: result.insertId,
      message: "Đã thêm khách hàng."
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "Email này đã tồn tại."
      });
    }

    console.error(error.message);
    res.status(500).json({
      error: "Không thêm được khách hàng."
    });
  }
});


// Sửa khách hàng
app.patch("/api/customers/:id", async (req, res) => {
  const id = Number(req.params.id);

  const {
    full_name,
    email,
    interest_group,
    subscribed
  } = req.body;

  const validGroups = [
    "basketball",
    "running",
    "sneaker",
    "general"
  ];

  if (
    !Number.isInteger(id) ||
    id < 1 ||
    typeof full_name !== "string" ||
    !full_name.trim() ||
    typeof email !== "string" ||
    !email.trim() ||
    !validGroups.includes(interest_group)
  ) {
    return res.status(400).json({
      error: "Thông tin khách hàng không hợp lệ."
    });
  }

  try {
    const receiveAds = Boolean(subscribed);

    const [result] = await pool.execute(`
      UPDATE customers
      SET
        full_name = ?,
        email = ?,
        interest_group = ?,
        subscribed = ?,
        consent_at = CASE
          WHEN ? = TRUE AND subscribed = FALSE THEN NOW()
          WHEN ? = FALSE THEN NULL
          ELSE consent_at
        END
      WHERE id = ?
    `, [
      full_name.trim(),
      email.trim().toLowerCase(),
      interest_group,
      receiveAds,
      receiveAds,
      receiveAds,
      id
    ]);

    if (!result.affectedRows) {
      return res.status(404).json({
        error: "Không tìm thấy khách hàng."
      });
    }

    res.json({
      message: "Đã cập nhật khách hàng."
    });
  } catch (error) {
    if (error.code === "ER_DUP_ENTRY") {
      return res.status(409).json({
        error: "Email này đã được sử dụng."
      });
    }

    console.error(error.message);
    res.status(500).json({
      error: "Không sửa được khách hàng."
    });
  }
});
// Lấy danh sách sản phẩm
app.get("/api/products", async (req, res) => {
  try {
    const [rows] = await pool.execute(
      "SELECT * FROM products ORDER BY id DESC"
    );
    res.json(rows);
  } catch (error) {
    console.error("Lỗi lấy sản phẩm:", error.message);
    res.status(500).json({ error: "Không lấy được sản phẩm" });
  }
});
// Thêm sản phẩm giày
app.post("/api/products", async (req, res) => {
  const {
    name,
    category,
    price,
    sale_price,
    image_url,
    product_url,
    description
  } = req.body;

  const normalPrice = Number(price);

  const salePrice =
    sale_price === "" ||
    sale_price === null ||
    sale_price === undefined
      ? null
      : Number(sale_price);

  if (
    typeof name !== "string" ||
    !name.trim() ||
    typeof category !== "string" ||
    !category.trim() ||
    !Number.isFinite(normalPrice) ||
    normalPrice < 0 ||
    (salePrice !== null &&
      (!Number.isFinite(salePrice) || salePrice < 0))
  ) {
    return res.status(400).json({
      error: "Thông tin sản phẩm không hợp lệ."
    });
  }

  try {
    const [result] = await pool.execute(`
      INSERT INTO products
      (
        name,
        category,
        price,
        sale_price,
        image_url,
        product_url,
        description
      )
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [
      name.trim(),
      category.trim(),
      normalPrice,
      salePrice,
      image_url?.trim() || null,
      product_url?.trim() || null,
      description?.trim() || null
    ]);

    res.status(201).json({
      id: result.insertId,
      message: "Đã thêm mẫu giày."
    });
  } catch (error) {
    console.error(error.message);

    res.status(500).json({
      error: "Không thêm được sản phẩm."
    });
  }
});
// ================================
// SỬA SẢN PHẨM
// ================================
app.patch("/api/products/:id", async (req, res) => {
  const id = Number(req.params.id);

  const {
    name,
    category,
    price,
    sale_price,
    image_url,
    product_url,
    description
  } = req.body;

  const normalPrice = Number(price);

  const salePrice =
    sale_price === "" ||
    sale_price === null ||
    sale_price === undefined
      ? null
      : Number(sale_price);

  if (
    !Number.isInteger(id) ||
    id < 1 ||
    typeof name !== "string" ||
    !name.trim() ||
    typeof category !== "string" ||
    !category.trim() ||
    !Number.isFinite(normalPrice) ||
    normalPrice < 0 ||
    (
      salePrice !== null &&
      (!Number.isFinite(salePrice) || salePrice < 0)
    )
  ) {
    return res.status(400).json({
      error: "Thông tin sản phẩm không hợp lệ."
    });
  }

  try {
    const [result] = await pool.execute(`
      UPDATE products
      SET
        name = ?,
        category = ?,
        price = ?,
        sale_price = ?,
        image_url = ?,
        product_url = ?,
        description = ?
      WHERE id = ?
    `, [
      name.trim(),
      category.trim(),
      normalPrice,
      salePrice,
      image_url?.trim() || null,
      product_url?.trim() || null,
      description?.trim() || null,
      id
    ]);

    if (!result.affectedRows) {
      return res.status(404).json({
        error: "Không tìm thấy sản phẩm."
      });
    }

    res.json({
      message: "Đã cập nhật sản phẩm."
    });

  } catch (error) {
    console.error("Lỗi sửa sản phẩm:", error.message);

    res.status(500).json({
      error: "Không sửa được sản phẩm."
    });
  }
});


// ================================
// XÓA SẢN PHẨM
// ================================
app.delete("/api/products/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id <= 0) {
    return res.status(400).json({
      message: "ID sản phẩm không hợp lệ."
    });
  }

  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();

    // Bỏ liên kết sản phẩm khỏi các chiến dịch cũ
    await connection.execute(
      `
      UPDATE campaigns
      SET product_id = NULL
      WHERE product_id = ?
      `,
      [id]
    );

    // Xóa sản phẩm
    const [result] = await connection.execute(
      `
      DELETE FROM products
      WHERE id = ?
      `,
      [id]
    );

    if (result.affectedRows === 0) {
      await connection.rollback();

      return res.status(404).json({
        message: "Không tìm thấy sản phẩm."
      });
    }

    await connection.commit();

    res.json({
      message: "Đã xóa sản phẩm."
    });

  } catch (error) {
    await connection.rollback();

    console.error("Lỗi xóa sản phẩm:", error);

    res.status(500).json({
      message: "Không thể xóa sản phẩm."
    });

  } finally {
    connection.release();
  }
});
// Tạo chiến dịch nháp
app.post("/api/campaigns", async (req, res) => {
  const { name, product_id, target_group, subject } = req.body;
  const productId = Number(product_id);

  const validGroups = ["basketball", "running", "sneaker", "general"];

  if (
    typeof name !== "string" || !name.trim() || name.length > 150 ||
    typeof subject !== "string" || !subject.trim() || subject.length > 255 ||
    !Number.isInteger(productId) || productId < 1 ||
    !validGroups.includes(target_group)
  ) {
    return res.status(400).json({
      error: "Vui lòng điền đầy đủ và đúng thông tin chiến dịch."
    });
  }

  try {
    const [products] = await pool.execute(
      "SELECT id FROM products WHERE id = ?",
      [productId]
    );

    if (products.length === 0) {
      return res.status(400).json({ error: "Sản phẩm không tồn tại." });
    }

    const [result] = await pool.execute(
      `INSERT INTO campaigns
       (name, product_id, target_group, subject)
       VALUES (?, ?, ?, ?)`,
      [name.trim(), productId, target_group, subject.trim()]
    );

    res.status(201).json({
      id: result.insertId,
      message: "Đã lưu chiến dịch nháp!"
    });
  } catch (error) {
    console.error("Lỗi tạo chiến dịch:", error.message);
    res.status(500).json({ error: "Không lưu được chiến dịch." });
  }
});
// Danh sách chiến dịch
app.get("/api/campaigns", async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        c.id, c.name, c.subject, c.target_group,
        c.status, c.created_at,
        COALESCE(p.name, 'Sản phẩm đã xóa') AS product_name
      FROM campaigns c
      LEFT JOIN products p ON p.id = c.product_id
      ORDER BY c.id DESC
    `);

    res.json(rows);
  } catch (error) {
    console.error("Lỗi lấy chiến dịch:", error.message);
    res.status(500).json({
      error: "Không tải được danh sách chiến dịch."
    });
  }
});
// Hủy chiến dịch đang gửi
app.post("/api/campaigns/:id/cancel", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({
      error: "Mã chiến dịch không hợp lệ."
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // Khóa campaign trong lúc hủy
    const [campaigns] = await connection.execute(
      "SELECT status FROM campaigns WHERE id = ? FOR UPDATE",
      [id]
    );

    if (!campaigns.length) {
      await connection.rollback();

      return res.status(404).json({
        error: "Không tìm thấy chiến dịch."
      });
    }

    if (campaigns[0].status !== "sending") {
      await connection.rollback();

      return res.status(409).json({
        error: "Chỉ có thể hủy chiến dịch đang gửi."
      });
    }

    // Ngừng cho worker lấy thêm email
    await connection.execute(
      "UPDATE campaigns SET status = 'cancelled' WHERE id = ?",
      [id]
    );

    // Những email chưa được n8n lấy sẽ bỏ qua
    const [skippedResult] = await connection.execute(`
      UPDATE campaign_recipients
      SET status = 'skipped',
          error_message = 'Chiến dịch đã được hủy.'
      WHERE campaign_id = ?
        AND status = 'pending'
    `, [id]);

    // Kiểm tra có email nào n8n đang xử lý không
    const [sendingRows] = await connection.execute(`
      SELECT COUNT(*) AS total
      FROM campaign_recipients
      WHERE campaign_id = ?
        AND status = 'sending'
    `, [id]);

    await connection.commit();

    res.json({
      message: "Đã hủy chiến dịch.",
      skipped: skippedResult.affectedRows,
      processing: Number(sendingRows[0].total)
    });

  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error("Lỗi hủy chiến dịch:", error.message);

    res.status(500).json({
      error: "Không hủy được chiến dịch."
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// Xóa chiến dịch cũ.
// Không cho xóa chiến dịch đang gửi.
app.delete("/api/campaigns/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({
      error: "Mã chiến dịch không hợp lệ."
    });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [campaigns] = await connection.execute(
      "SELECT status FROM campaigns WHERE id = ? FOR UPDATE",
      [id]
    );

    if (!campaigns.length) {
      await connection.rollback();

      return res.status(404).json({
        error: "Không tìm thấy chiến dịch."
      });
    }

    if (campaigns[0].status === "sending") {
  await connection.rollback();

  return res.status(409).json({
    error: "Hãy hủy gửi trước khi xóa chiến dịch."
  });
}

const [processingRows] = await connection.execute(`
  SELECT COUNT(*) AS total
  FROM campaign_recipients
  WHERE campaign_id = ?
    AND status = 'sending'
`, [id]);

if (Number(processingRows[0].total) > 0) {
  await connection.rollback();

  return res.status(409).json({
    error:
      "Vẫn còn email đang được n8n xử lý. Chờ email đó hoàn tất rồi xóa."
  });
}

    // Xóa kết quả người nhận trước
    await connection.execute(
      "DELETE FROM campaign_recipients WHERE campaign_id = ?",
      [id]
    );

    await connection.execute(
      "DELETE FROM campaigns WHERE id = ?",
      [id]
    );

    await connection.commit();

    res.json({
      message: "Đã xóa chiến dịch."
    });
  } catch (error) {
    if (connection) {
      await connection.rollback();
    }

    console.error(error.message);

    res.status(500).json({
      error: "Không xóa được chiến dịch."
    });
  } finally {
    if (connection) {
      connection.release();
    }
  }
});
// ==========================
// N8N LẤY CHIẾN DỊCH ĐẾN GIỜ
// ==========================
app.get("/api/campaigns/due", async (req, res) => {
  try {
    const [campaigns] = await pool.execute(
      `
      SELECT
        id,
        name,
        scheduled_at
      FROM campaigns
      WHERE status = 'scheduled'
        AND scheduled_at IS NOT NULL
        AND scheduled_at <= NOW()
      ORDER BY scheduled_at ASC
      LIMIT 20
      `
    );

    return res.json({
      campaigns
    });

  } catch (error) {
    console.error("Lỗi lấy campaign đến giờ:", error);

    return res.status(500).json({
      message: "Không lấy được chiến dịch đến giờ."
    });
  }
});
// =====================================================
// N8N W3 - RETRY EMAIL LỖI
// Các route automation mới dùng cùng x-api-key với W2.
// =====================================================
app.get("/api/retry/failed", requireN8nKey, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        r.id,
        r.campaign_id,
        c.name AS campaign_name,
        r.recipient_email,
        r.retry_count,
        r.failed_at,
        r.error_message
      FROM campaign_recipients r
      JOIN campaigns c ON c.id = r.campaign_id
      WHERE r.status = 'failed'
        AND r.retry_count < 3
        AND r.send_round = c.send_round
        AND c.status IN ('sending', 'failed')
      ORDER BY (r.failed_at IS NULL) ASC, r.failed_at ASC, r.id ASC
      LIMIT 20
    `);

    return res.json(rows);
  } catch (error) {
    console.error("Lỗi lấy email cần retry:", error.message);
    return res.status(500).json({ error: "Không lấy được email lỗi." });
  }
});

app.post("/api/retry/requeue", requireN8nKey, async (req, res) => {
  const recipientId = Number(req.body.recipient_id);

  if (!Number.isInteger(recipientId) || recipientId < 1) {
    return res.status(400).json({ error: "recipient_id không hợp lệ." });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute(`
      SELECT
        r.id,
        r.campaign_id,
        r.send_round,
        r.status,
        r.retry_count,
        c.status AS campaign_status,
        c.send_round AS campaign_send_round
      FROM campaign_recipients r
      JOIN campaigns c ON c.id = r.campaign_id
      WHERE r.id = ?
      FOR UPDATE
    `, [recipientId]);

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Không tìm thấy email lỗi." });
    }

    const item = rows[0];

    if (item.status !== "failed") {
      await connection.rollback();
      return res.status(409).json({ error: "Email này hiện không ở trạng thái failed." });
    }

    if (Number(item.retry_count) >= 3) {
      await connection.rollback();
      return res.status(409).json({ error: "Email đã vượt quá 3 lần retry." });
    }

    if (Number(item.send_round) !== Number(item.campaign_send_round)) {
      await connection.rollback();
      return res.status(409).json({ error: "Email lỗi thuộc lần gửi cũ, không retry nữa." });
    }

    if (!["sending", "failed"].includes(item.campaign_status)) {
      await connection.rollback();
      return res.status(409).json({ error: "Chiến dịch hiện không cho phép retry." });
    }

    await connection.execute(`
      UPDATE campaign_recipients
      SET status = 'pending',
          retry_count = retry_count + 1,
          sent_at = NULL,
          error_message = NULL
      WHERE id = ?
    `, [recipientId]);

    await connection.execute(`
      UPDATE campaigns
      SET status = 'sending'
      WHERE id = ?
        AND status IN ('sending', 'failed')
    `, [item.campaign_id]);

    await connection.commit();

    return res.json({
      message: "Đã đưa email lỗi trở lại hàng chờ.",
      recipient_id: recipientId,
      retry_count: Number(item.retry_count) + 1
    });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Lỗi requeue email:", error.message);
    return res.status(500).json({ error: "Không đưa lại email vào hàng chờ." });
  } finally {
    if (connection) connection.release();
  }
});

// =====================================================
// N8N W4 - THEO DÕI / ĐỒNG BỘ TRẠNG THÁI CHIẾN DỊCH
// =====================================================
app.get("/api/campaigns/stats", requireN8nKey, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        c.id AS campaign_id,
        c.name AS campaign_name,
        c.status AS current_status,
        c.send_round,
        COUNT(r.id) AS total,
        SUM(CASE WHEN r.status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN r.status = 'sending' THEN 1 ELSE 0 END) AS processing,
        SUM(CASE WHEN r.status = 'sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN r.status = 'failed' THEN 1 ELSE 0 END) AS failed,
        SUM(CASE WHEN r.status = 'skipped' THEN 1 ELSE 0 END) AS skipped
      FROM campaigns c
      LEFT JOIN campaign_recipients r
        ON r.campaign_id = c.id
       AND r.send_round = c.send_round
      WHERE c.send_round > 0
        AND c.status IN ('sending', 'failed', 'completed')
      GROUP BY c.id, c.name, c.status, c.send_round
      ORDER BY c.id DESC
    `);

    const result = rows.map((row) => {
      const pending = Number(row.pending || 0);
      const processing = Number(row.processing || 0);
      const failed = Number(row.failed || 0);

      let status = "completed";
      if (pending > 0 || processing > 0) status = "sending";
      else if (failed > 0) status = "failed";

      return {
        campaign_id: row.campaign_id,
        campaign_name: row.campaign_name,
        send_round: Number(row.send_round || 0),
        total: Number(row.total || 0),
        pending,
        processing,
        sent: Number(row.sent || 0),
        failed,
        skipped: Number(row.skipped || 0),
        current_status: row.current_status,
        status
      };
    });

    return res.json(result);
  } catch (error) {
    console.error("Lỗi lấy thống kê chiến dịch:", error.message);
    return res.status(500).json({ error: "Không lấy được thống kê chiến dịch." });
  }
});

app.post("/api/campaigns/update-status", requireN8nKey, async (req, res) => {
  const campaignId = Number(req.body.campaign_id);
  const status = String(req.body.status || "");

  if (!Number.isInteger(campaignId) || campaignId < 1) {
    return res.status(400).json({ error: "campaign_id không hợp lệ." });
  }

  if (!["sending", "failed", "completed"].includes(status)) {
    return res.status(400).json({ error: "Trạng thái chiến dịch không hợp lệ." });
  }

  try {
    const [result] = await pool.execute(`
      UPDATE campaigns
      SET status = ?
      WHERE id = ?
        AND status IN ('sending', 'failed', 'completed')
    `, [status, campaignId]);

    if (!result.affectedRows) {
      const [rows] = await pool.execute(
        "SELECT id, status FROM campaigns WHERE id = ?",
        [campaignId]
      );

      if (!rows.length) {
        return res.status(404).json({ error: "Không tìm thấy chiến dịch." });
      }

      return res.status(409).json({
        error: `Không cập nhật trạng thái từ ${rows[0].status}.`
      });
    }

    return res.json({
      message: "Đã đồng bộ trạng thái chiến dịch.",
      campaign_id: campaignId,
      status
    });
  } catch (error) {
    console.error("Lỗi cập nhật trạng thái chiến dịch:", error.message);
    return res.status(500).json({ error: "Không cập nhật được trạng thái chiến dịch." });
  }
});

// =====================================================
// N8N W5 - BÁO CÁO CHIẾN DỊCH HOÀN TẤT
// =====================================================
app.get("/api/reports/completed-campaigns", requireN8nKey, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        c.id AS campaign_id,
        c.name AS campaign_name,
        c.send_round,
        COUNT(r.id) AS total,
        SUM(CASE WHEN r.status = 'sent' THEN 1 ELSE 0 END) AS sent,
        SUM(CASE WHEN r.first_opened_at IS NOT NULL THEN 1 ELSE 0 END) AS opened,
        SUM(CASE WHEN r.first_clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS clicked
      FROM campaigns c
      LEFT JOIN campaign_recipients r
        ON r.campaign_id = c.id
       AND r.send_round = c.send_round
      WHERE c.status = 'completed'
        AND c.send_round > 0
      GROUP BY c.id, c.name, c.send_round
      ORDER BY c.id DESC
      LIMIT 50
    `);

    return res.json(rows.map((row) => ({
      campaign_id: row.campaign_id,
      campaign_name: row.campaign_name,
      send_round: Number(row.send_round || 0),
      total: Number(row.total || 0),
      sent: Number(row.sent || 0),
      opened: Number(row.opened || 0),
      clicked: Number(row.clicked || 0)
    })));
  } catch (error) {
    console.error("Lỗi tạo dữ liệu báo cáo:", error.message);
    return res.status(500).json({ error: "Không lấy được dữ liệu báo cáo." });
  }
});

// =====================================================
// N8N W6 - CẢNH BÁO LỖI GẦN ĐÂY
// =====================================================
app.get("/api/errors/recent", requireN8nKey, async (req, res) => {
  try {
    const [rows] = await pool.execute(`
      SELECT
        r.id,
        r.recipient_email,
        r.status,
        r.retry_count,
        r.failed_at,
        r.error_message,
        c.id AS campaign_id,
        c.name AS campaign_name
      FROM campaign_recipients r
      JOIN campaigns c ON c.id = r.campaign_id
      WHERE r.failed_at IS NOT NULL
        AND r.failed_at >= DATE_SUB(NOW(), INTERVAL 5 MINUTE)
      ORDER BY r.failed_at DESC
      LIMIT 10
    `);

    if (!rows.length) {
      return res.json({
        has_error: false,
        message: "",
        created_at: null,
        total_errors: 0
      });
    }

    const latest = rows[0];
    const detail = latest.error_message || "Email đã từng gửi lỗi và có thể đang được retry.";

    return res.json({
      has_error: true,
      message:
        `Có ${rows.length} email phát sinh lỗi trong 5 phút gần đây. ` +
        `Gần nhất: chiến dịch #${latest.campaign_id} - ${latest.campaign_name}, ` +
        `email ${latest.recipient_email}. Chi tiết: ${detail}`,
      created_at: latest.failed_at,
      total_errors: rows.length,
      campaign_id: latest.campaign_id,
      recipient_email: latest.recipient_email,
      retry_count: Number(latest.retry_count || 0)
    });
  } catch (error) {
    console.error("Lỗi lấy cảnh báo gần đây:", error.message);
    return res.status(500).json({ error: "Không lấy được lỗi gần đây." });
  }
});

// Xem chi tiết chiến dịch và số khách đủ điều kiện
app.get("/api/campaigns/:id", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Mã chiến dịch không hợp lệ." });
  }

  try {
    const [rows] = await pool.execute(`
      SELECT c.*,
             COALESCE(p.name, 'Sản phẩm đã xóa') AS product_name,
             p.price, p.sale_price, p.description,
             p.product_url, p.image_url
      FROM campaigns c
      LEFT JOIN products p ON p.id = c.product_id
      WHERE c.id = ?
    `, [id]);

    if (!rows.length) {
      return res.status(404).json({ error: "Không tìm thấy chiến dịch." });
    }

    const campaign = rows[0];

    const [counts] = await pool.execute(`
      SELECT COUNT(*) AS total
      FROM customers
      WHERE subscribed = TRUE AND interest_group = ?
    `, [campaign.target_group]);

    res.json({
      ...campaign,
      recipient_count: Number(counts[0].total)
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Không tải được chiến dịch." });
  }
});

// Lưu nội dung. Sửa chiến dịch đã duyệt sẽ chuyển lại thành bản nháp.
app.patch("/api/campaigns/:id", async (req, res) => {
  const id = Number(req.params.id);
  const { subject, html_content } = req.body;

  if (
    !Number.isInteger(id) || id < 1 ||
    typeof subject !== "string" ||
    !subject.trim() || subject.length > 255 ||
    typeof html_content !== "string" ||
    !html_content.trim() || html_content.length > 50000
  ) {
    return res.status(400).json({
      error: "Nhập tiêu đề và nội dung hợp lệ; nội dung tối đa 50.000 ký tự."
    });
  }

  try {
    const [result] = await pool.execute(`
      UPDATE campaigns
SET subject = ?, html_content = ?, status = 'draft'
WHERE id = ?
  AND status IN (
    'draft',
    'approved',
    'completed',
    'failed',
    'cancelled'
  )
    `, [subject.trim(), html_content.trim(), id]);

    if (!result.affectedRows) {
      return res.status(409).json({
        error: "Không tìm thấy hoặc chiến dịch không còn được phép sửa."
      });
    }

    res.json({ message: "Đã lưu nội dung dưới dạng bản nháp." });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Không lưu được nội dung." });
  }
});

// Duyệt nội dung, chưa gửi email
app.post("/api/campaigns/:id/approve", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Mã chiến dịch không hợp lệ." });
  }

  try {
    const [result] = await pool.execute(`
      UPDATE campaigns
      SET status = 'approved'
      WHERE id = ?
        AND status = 'draft'
        AND CHAR_LENGTH(TRIM(subject)) > 0
        AND CHAR_LENGTH(TRIM(html_content)) > 0
    `, [id]);

    if (!result.affectedRows) {
      return res.status(409).json({
        error: "Chỉ duyệt được bản nháp đã có tiêu đề và nội dung."
      });
    }

    res.json({ message: "Đã duyệt nội dung. Email chưa được gửi." });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Không duyệt được chiến dịch." });
  }
});
// Chỉ n8n có đúng khóa mới được lấy công việc và cập nhật kết quả.
function requireN8nKey(req, res, next) {
  const expected = process.env.N8N_API_KEY;
  const provided = req.get("x-api-key");

  if (!expected || provided !== expected) {
    return res.status(401).json({ error: "Khóa kết nối không đúng." });
  }

  next();
}

function escapeEmailHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  }[char]));
}
function getPublicBaseUrl() {
  const configured = String(process.env.PUBLIC_BASE_URL || "").trim();

  if (configured) {
    return configured.replace(/\/+$/, "");
  }

  const port = Number(process.env.PORT) || 3001;
  return `http://127.0.0.1:${port}`;
}

function validTrackingToken(token) {
  return /^[a-f0-9]{64}$/.test(String(token || ""));
}

const trackingPixel = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==",
  "base64"
);

function safeRedirectUrl(value, fallback) {
  try {
    const url = new URL(value);

    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.toString();
    }
  } catch {}

  return fallback;
}
// Hoàn tất chiến dịch khi không còn thư chờ hoặc đang xử lý.
async function finishCampaign(
  connection,
  campaignId,
  sendRound
) {
  await connection.execute(`
    UPDATE campaigns

    SET status = CASE

      WHEN EXISTS (
        SELECT 1
        FROM campaign_recipients
        WHERE campaign_id = ?
          AND send_round = ?
          AND status = 'failed'
      )

      THEN 'failed'

      ELSE 'completed'

    END

    WHERE id = ?
      AND status = 'sending'
      AND send_round = ?

      AND NOT EXISTS (
        SELECT 1
        FROM campaign_recipients
        WHERE campaign_id = ?
          AND send_round = ?
          AND status IN ('pending', 'sending')
      )
  `, [
    campaignId,
    sendRound,

    campaignId,
    sendRound,

    campaignId,
    sendRound
  ]);
}

// ======================================
// ĐƯA CHIẾN DỊCH VÀO HÀNG CHỜ
// HỖ TRỢ GỬI LẦN 1, LẦN 2, LẦN 3...
// ======================================

app.post("/api/campaigns/:id/queue", async (req, res) => {

  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({
      error: "Mã chiến dịch không hợp lệ."
    });
  }

  let connection;

  try {

    connection = await pool.getConnection();
    await connection.beginTransaction();


    // Lấy chiến dịch
    const [campaigns] = await connection.execute(
      `
      SELECT *
      FROM campaigns
      WHERE id = ?
      FOR UPDATE
      `,
      [id]
    );

    const campaign = campaigns[0];


    if (!campaign) {

      await connection.rollback();

      return res.status(404).json({
        error: "Không tìm thấy chiến dịch."
      });
    }


    // Không cho gửi chồng khi đang gửi
    if (campaign.status === "sending") {

      await connection.rollback();

      return res.status(409).json({
        error: "Chiến dịch đang gửi."
      });
    }


    // Các trạng thái được phép gửi
    const allowedStatuses = [
  "approved",
  "scheduled",
  "completed",
  "failed",
  "cancelled"
];


    if (!allowedStatuses.includes(campaign.status)) {

      await connection.rollback();

      return res.status(409).json({
        error: "Hãy lưu và duyệt chiến dịch trước khi gửi."
      });
    }


    // Tính lần gửi tiếp theo
    const nextRound =
      Number(campaign.send_round || 0) + 1;


    // Lấy khách hàng thuộc nhóm
    const [customers] = await connection.execute(`
      SELECT
        id,
        email

      FROM customers

      WHERE subscribed = TRUE
        AND interest_group = ?
    `, [
      campaign.target_group
    ]);


    if (!customers.length) {

      await connection.rollback();

      return res.status(400).json({
        error: "Không có khách hàng thuộc nhóm này."
      });
    }


    // Tạo danh sách người nhận cho lần gửi mới
    for (const customer of customers) {

      await connection.execute(`
        INSERT INTO campaign_recipients
        (
          campaign_id,
          customer_id,
          recipient_email,
          tracking_token,
          status,
          send_round
        )

        VALUES (?, ?, ?, ?, 'pending', ?)
      `, [
        id,
        customer.id,
        customer.email,
        crypto.randomBytes(32).toString("hex"),
        nextRound
      ]);
    }


    // Cập nhật campaign
    await connection.execute(`
      UPDATE campaigns

      SET
        status = 'sending',
        send_round = ?

      WHERE id = ?
    `, [
      nextRound,
      id
    ]);


    await connection.commit();


    res.json({
      message:
        `Đã đưa ${customers.length} email vào hàng chờ - Lần ${nextRound}.`
    });


  } catch (error) {

    if (connection) {
      await connection.rollback();
    }


    console.error(
      "Lỗi tạo hàng chờ:",
      error.message
    );


    res.status(500).json({
      error: "Không tạo được hàng chờ gửi."
    });


  } finally {

    if (connection) {
      connection.release();
    }

  }
});
// n8n lấy MỘT email mỗi lần, khóa hàng để tránh lấy trùng.
app.post("/api/worker/next", requireN8nKey, async (req, res) => {
  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.query(`
  SELECT
    r.id,
    r.campaign_id,
    r.send_round,
    r.recipient_email,
    r.tracking_token,
    u.full_name,
    u.subscribed,
    c.subject,
    c.html_content,
    p.product_url
  FROM campaign_recipients r
  JOIN customers u ON u.id = r.customer_id
  JOIN campaigns c ON c.id = r.campaign_id
  LEFT JOIN products p ON p.id = c.product_id
  WHERE r.status = 'pending'
  AND c.status = 'sending'
  AND r.send_round = c.send_round
  ORDER BY r.id
  LIMIT 1
  FOR UPDATE SKIP LOCKED
`);

    if (!rows.length) {
      await connection.commit();
      return res.json({ has_job: false });
    }

    const job = rows[0];

    // Kiểm tra lại đăng ký nhận thư ngay trước khi giao việc.
    if (!Number(job.subscribed)) {
      await connection.execute(`
        UPDATE campaign_recipients
        SET status = 'skipped'
        WHERE id = ?
      `, [job.id]);

      await finishCampaign(
  connection,
  job.campaign_id,
  job.send_round
);
      await connection.commit();
      return res.json({ has_job: false });
    }

    await connection.execute(`
      UPDATE campaign_recipients SET status = 'sending' WHERE id = ?
    `, [job.id]);

    await connection.commit();

    const baseUrl = getPublicBaseUrl();

const clickUrl =
  `${baseUrl}/t/c/${job.tracking_token}`;

const openUrl =
  `${baseUrl}/t/o/${job.tracking_token}.gif`;

const unsubscribeUrl =
  `${baseUrl}/unsubscribe/${job.tracking_token}`;

let html = job.html_content
  .replaceAll(
    "{{name}}",
    escapeEmailHtml(job.full_name)
  )
  .replaceAll(
    "{{product_url}}",
    escapeEmailHtml(clickUrl)
  );

html += `
  <hr style="border:0;border-top:1px solid #ddd;margin-top:30px">

  <p style="font-size:12px;color:#64748b">
    Bạn nhận email vì đã đăng ký nhận thông tin quảng cáo từ shop.
    <a href="${escapeEmailHtml(unsubscribeUrl)}">
      Hủy đăng ký nhận quảng cáo
    </a>
  </p>

  <img
    src="${escapeEmailHtml(openUrl)}"
    width="1"
    height="1"
    alt=""
    style="display:block;width:1px;height:1px;border:0"
  >
`;

res.json({
  has_job: true,
  recipient_id: job.id,
  email: job.recipient_email,
  subject: job.subject.replaceAll(
    "{{name}}",
    job.full_name
  ),
  html
});
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error.message);
    res.status(500).json({ error: "Không lấy được công việc gửi." });
  } finally {
    if (connection) connection.release();
  }
});

// n8n báo kết quả gửi về backend.
app.post("/api/worker/result", requireN8nKey, async (req, res) => {
  const id = Number(req.body.recipient_id);
  const status = req.body.status;
  const errorMessage = String(req.body.error || "").slice(0, 2000);

  if (!Number.isInteger(id) || id < 1 ||
      !["sent", "failed"].includes(status)) {
    return res.status(400).json({ error: "Kết quả không hợp lệ." });
  }

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    const [rows] = await connection.execute(
  `
  SELECT
    campaign_id,
    send_round

  FROM campaign_recipients

  WHERE id = ?
  `,
  [id]
);

    if (!rows.length) {
      await connection.rollback();
      return res.status(404).json({ error: "Không tìm thấy người nhận." });
    }

    const campaignId = rows[0].campaign_id;
    const sendRound = rows[0].send_round;

    // Tuần tự hóa việc tính trạng thái tổng của cùng chiến dịch.
    await connection.execute(
      "SELECT id FROM campaigns WHERE id = ? FOR UPDATE", [campaignId]
    );

    const [result] = await connection.execute(`
      UPDATE campaign_recipients
      SET status = ?,
          sent_at = CASE WHEN ? = 'sent' THEN NOW() ELSE NULL END,
          error_message = ?,
          failed_at = CASE WHEN ? = 'failed' THEN NOW() ELSE failed_at END
      WHERE id = ? AND status = 'sending'
    `, [
      status, status,
      status === "failed" ? errorMessage : null,
      status,
      id
    ]);

    if (!result.affectedRows) {
      const [existing] = await connection.execute(
        "SELECT status FROM campaign_recipients WHERE id = ?", [id]
      );

      if (existing[0].status !== status) {
        await connection.rollback();
        return res.status(409).json({
          error: "Trạng thái không phù hợp để cập nhật."
        });
      }
    }

    await finishCampaign(
  connection,
  campaignId,
  sendRound
);
    await connection.commit();
    res.json({ message: "Đã ghi nhận kết quả." });
  } catch (error) {
    if (connection) await connection.rollback();
    console.error(error.message);
    res.status(500).json({ error: "Không ghi được kết quả." });
  } finally {
    if (connection) connection.release();
  }
});
// Ghi nhận mở email
app.get("/t/o/:token.gif", async (req, res) => {
  const token = req.params.token;

  try {
    if (validTrackingToken(token)) {
      await pool.execute(`
        UPDATE campaign_recipients
        SET first_opened_at = COALESCE(first_opened_at, NOW())
        WHERE tracking_token = ?
      `, [token]);
    }
  } catch (error) {
    console.error("Lỗi tracking mở:", error.message);
  }

  res.set({
    "Content-Type": "image/gif",
    "Content-Length": trackingPixel.length,
    "Cache-Control": "no-store, no-cache, must-revalidate, private",
    "Pragma": "no-cache",
    "Expires": "0"
  });

  res.end(trackingPixel);
});


// Ghi nhận click
app.get("/t/c/:token", async (req, res) => {
  const token = req.params.token;

  if (!validTrackingToken(token)) {
    return res.status(400).send("Liên kết không hợp lệ.");
  }

  try {
    const [rows] = await pool.execute(`
      SELECT r.id, p.product_url
      FROM campaign_recipients r
      JOIN campaigns c ON c.id = r.campaign_id
      LEFT JOIN products p ON p.id = c.product_id
      WHERE r.tracking_token = ?
      LIMIT 1
    `, [token]);

    if (!rows.length) {
      return res.status(404).send("Không tìm thấy liên kết.");
    }

    const recipient = rows[0];

    await pool.execute(`
      UPDATE campaign_recipients
      SET first_clicked_at = COALESCE(first_clicked_at, NOW())
      WHERE id = ?
    `, [recipient.id]);

   const destination =
  `${getPublicBaseUrl()}/shop.html`;

res.redirect(302, destination);
  } catch (error) {
    console.error("Lỗi tracking click:", error.message);
    res.status(500).send("Không mở được liên kết.");
  }
});


// Trang xác nhận hủy đăng ký
app.get("/unsubscribe/:token", (req, res) => {
  const token = req.params.token;

  if (!validTrackingToken(token)) {
    return res.status(400).send("Liên kết không hợp lệ.");
  }

  res.type("html").send(`
    <!DOCTYPE html>
    <html lang="vi">
    <head>
      <meta charset="UTF-8">
      <title>Hủy đăng ký</title>
    </head>
    <body style="font-family:Arial;max-width:600px;margin:60px auto">
      <h1>Hủy đăng ký nhận quảng cáo</h1>

      <p>Bạn có chắc muốn ngừng nhận email quảng cáo?</p>

      <form method="POST" action="/unsubscribe/${token}">
        <button type="submit">
          Xác nhận hủy đăng ký
        </button>
      </form>
    </body>
    </html>
  `);
});


// Thực hiện hủy đăng ký
app.post("/unsubscribe/:token", async (req, res) => {
  const token = req.params.token;

  if (!validTrackingToken(token)) {
    return res.status(400).send("Liên kết không hợp lệ.");
  }

  try {
    const [rows] = await pool.execute(`
      SELECT customer_id
      FROM campaign_recipients
      WHERE tracking_token = ?
      LIMIT 1
    `, [token]);

    if (!rows.length) {
      return res.status(404).send("Không tìm thấy đăng ký.");
    }

    await pool.execute(`
      UPDATE customers
      SET subscribed = FALSE
      WHERE id = ?
    `, [rows[0].customer_id]);

    res.send("Đã hủy đăng ký nhận quảng cáo.");
  } catch (error) {
    console.error("Lỗi hủy đăng ký:", error.message);
    res.status(500).send("Không thể hủy đăng ký.");
  }
});
// Web xem kết quả từng người nhận.
app.get("/api/campaigns/:id/recipients", async (req, res) => {
  const id = Number(req.params.id);

  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: "Mã chiến dịch không hợp lệ." });
  }

  try {
    const [rows] = await pool.execute(`
  SELECT
    r.id,
    r.send_round,
    u.full_name,
    r.recipient_email,
    r.status,
    r.sent_at,
    r.first_opened_at,
    r.first_clicked_at,
    r.error_message,
    r.retry_count,
    r.failed_at
  FROM campaign_recipients r
  JOIN customers u
    ON u.id = r.customer_id
  WHERE r.campaign_id = ?
  ORDER BY
    r.send_round DESC,
    r.id DESC
`, [id]);

    res.json(rows);
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ error: "Không tải được kết quả gửi." });
  }
});
// ==========================
// AI TẠO NỘI DUNG EMAIL
// ==========================
// ==========================
// AI TẠO EMAIL BẰNG OLLAMA
// ==========================
app.post("/api/ai/generate-email", async (req, res) => {
  try {
    const {
      productName,
      promotion,
      tone,
      extraRequest
    } = req.body;

    if (!productName || !productName.trim()) {
      return res.status(400).json({
        error: "Vui lòng nhập tên sản phẩm."
      });
    }

  const prompt = `
Bạn là chuyên gia thiết kế email marketing cho shop giày PhanhShoes.

Hãy tạo một email quảng cáo bằng tiếng Việt.

THÔNG TIN:
- Sản phẩm: ${productName}
- Khuyến mãi: ${promotion || "Không có"}
- Phong cách: ${tone || "Trẻ trung"}
- Yêu cầu của người dùng: ${extraRequest || "Không có"}

CHỈ trả về JSON đúng cấu trúc:

{
  "subject": "Tiêu đề email",
  "html": "HTML email hoàn chỉnh"
}

YÊU CẦU THIẾT KẾ HTML:

- Email phải đẹp, hiện đại và chuyên nghiệp.
- Thiết kế giống email marketing của một shop giày thật.
- Chiều rộng tối đa 600px.
- Căn giữa email.
- Nền bên ngoài màu #f3f4f6.
- Nội dung chính nền trắng.
- Bo góc 16px.
- Dùng inline CSS.
- Font Arial, sans-serif.
- Không dùng JavaScript.
- Không dùng CSS bên ngoài.
- Không dùng thẻ style.
- Không dùng markdown.

BỐ CỤC BẮT BUỘC:

1. HEADER:
   - Có chữ PHANHSHOES lớn.
   - Header có màu nổi bật.
   - Có slogan ngắn.

2. HERO:
   - Tiêu đề sản phẩm lớn.
   - Một câu quảng cáo hấp dẫn.
   - Có thể sử dụng emoji phù hợp như 👟 hoặc ✨.
   - Không tự tạo URL ảnh nếu không được cung cấp.

3. NỘI DUNG:
   - Lời chào: Xin chào {{name}},
   - Giới thiệu sản phẩm.
   - Tối đa 2-3 đoạn ngắn.
   - Nội dung dễ đọc.

4. KHUYẾN MÃI:
   ${
     promotion
       ? `- Hiển thị nổi bật chương trình: ${promotion}.
          - Dùng một hộp màu hoặc badge để làm nổi bật ưu đãi.`
       : "- Không cần tạo khuyến mãi giả."
   }

5. CTA:
   - Có nút lớn "XEM SẢN PHẨM NGAY".
   - href bắt buộc là "{{product_url}}".
   - Nút có nền nổi bật.
   - Chữ trắng.
   - Bo góc.

6. FOOTER:
   - Có chữ PhanhShoes.
   - Có lời cảm ơn.
   - Thiết kế nhỏ gọn.

MÀU SẮC:
- Có thể phối 2-3 màu hài hòa.
- Không sử dụng quá nhiều màu gây rối.
- Ưu tiên màu đen, trắng và một màu nhấn nổi bật.
- Nội dung phải có khoảng trắng hợp lý.

QUAN TRỌNG:
- Giữ nguyên {{name}}.
- Giữ nguyên {{product_url}}.
- Không tự đổi hai biến trên.
- Không tạo link sản phẩm giả.
- Không giải thích bên ngoài JSON.
`;

    const response = await fetch(
      "http://127.0.0.1:11434/api/generate",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          model: "qwen2.5:7b",
          prompt,
          stream: false,
          format: "json"
        })
      }
    );

    if (!response.ok) {
      throw new Error("Không kết nối được Ollama.");
    }

    const ollamaData = await response.json();
    const result = JSON.parse(ollamaData.response);

    if (!result.subject || !result.html) {
      throw new Error("AI trả về nội dung không hợp lệ.");
    }

    return res.json({
      subject: result.subject,
      html: result.html
    });

  } catch (error) {
    console.error("Lỗi AI Ollama:", error);

    return res.status(500).json({
      error: error.message || "Không tạo được email bằng AI."
    });
  }
});
// ==========================
// ĐẶT LỊCH GỬI CHIẾN DỊCH
// ==========================
app.post("/api/campaigns/:id/schedule", async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { scheduled_at } = req.body;

    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({
        message: "ID chiến dịch không hợp lệ."
      });
    }

    if (!scheduled_at) {
      return res.status(400).json({
        message: "Vui lòng chọn ngày giờ gửi."
      });
    }

    // datetime-local gửi dạng: 2026-10-20T20:30
    const mysqlDateTime =
      scheduled_at.length === 16
        ? scheduled_at.replace("T", " ") + ":00"
        : scheduled_at.replace("T", " ");

    const [campaigns] = await pool.execute(
      `
      SELECT id, status
      FROM campaigns
      WHERE id = ?
      `,
      [id]
    );

    if (!campaigns.length) {
      return res.status(404).json({
        message: "Không tìm thấy chiến dịch."
      });
    }

    const campaign = campaigns[0];

    if (
  campaign.status !== "approved" &&
  campaign.status !== "scheduled"
) {
  return res.status(400).json({
    message:
      "Chỉ chiến dịch đã duyệt hoặc đến lịch mới được gửi."
  });
}

    await pool.execute(
      `
      UPDATE campaigns
      SET status = 'scheduled',
          scheduled_at = ?
      WHERE id = ?
      `,
      [mysqlDateTime, id]
    );

    return res.json({
      message: `Đã đặt lịch gửi lúc ${mysqlDateTime}.`
    });

  } catch (error) {
    console.error("Lỗi đặt lịch:", error);

    return res.status(500).json({
      message: "Không thể đặt lịch gửi."
    });
  }
});

async function startServer() {
  try {
    await pool.query("SELECT 1");
    console.log("Kết nối MySQL thành công!");

    const port = Number(process.env.PORT) || 3000;
    app.listen(port, "127.0.0.1", () => {
      console.log(`Backend: http://localhost:${port}`);
    });
  } catch (error) {
    console.error("Không kết nối được MySQL:", error.message);
    await pool.end();
    process.exitCode = 1;
  }
}

startServer();