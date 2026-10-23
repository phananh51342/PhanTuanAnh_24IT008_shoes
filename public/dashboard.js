let campaignStatusChart = null;
let customerGroupChart = null;


(async function loadDashboard() {

  const message =
    document.getElementById("dashboard-message");

  try {

    // =========================
    // LẤY DỮ LIỆU
    // =========================

    const [
      products,
      customers,
      campaigns
    ] = await Promise.all([

      api("/api/products"),

      api("/api/customers"),

      api("/api/campaigns")

    ]);


    // =========================
    // CARD THỐNG KÊ
    // =========================

    document.getElementById(
      "stat-products"
    ).textContent =
      products.length;


    document.getElementById(
      "stat-customers"
    ).textContent =
      customers.length;


    document.getElementById(
      "stat-campaigns"
    ).textContent =
      campaigns.length;


    document.getElementById(
      "stat-sending"
    ).textContent =
      campaigns.filter(
        campaign =>
          campaign.status === "sending"
      ).length;


    // =========================
    // CHIẾN DỊCH GẦN ĐÂY
    // =========================

    const tbody =
      document.getElementById(
        "recent-campaigns"
      );


    tbody.replaceChildren();


    for (
      const campaign
      of campaigns.slice(0, 6)
    ) {

      const tr =
        document.createElement("tr");


      const id =
        document.createElement("td");

      id.textContent =
        campaign.id;


      const name =
        document.createElement("td");

      name.textContent =
        campaign.name;


      const status =
        document.createElement("td");

      status.appendChild(
        statusBadge(
          campaign.status
        )
      );


      tr.append(
        id,
        name,
        status
      );


      tbody.appendChild(tr);
    }


    if (!campaigns.length) {

      tbody.innerHTML = `
        <tr>
          <td
            colspan="3"
            class="empty"
          >
            Chưa có chiến dịch.
          </td>
        </tr>
      `;

    }


    // =========================
    // VẼ BIỂU ĐỒ
    // =========================

    drawCampaignStatusChart(
      campaigns
    );


    drawCustomerGroupChart(
      customers
    );


  } catch (error) {

    setMessage(
      message,
      error.message,
      "error"
    );

  }

})();



// ===================================
// BIỂU ĐỒ TRẠNG THÁI CHIẾN DỊCH
// ===================================

function drawCampaignStatusChart(
  campaigns
) {

  const canvas =
    document.getElementById(
      "campaign-status-chart"
    );


  if (!canvas) return;


  const counts = {

    draft: 0,

    approved: 0,

    sending: 0,

    completed: 0,

    failed: 0,

    cancelled: 0

  };


  campaigns.forEach(
    campaign => {

      if (
        counts[
          campaign.status
        ] !== undefined
      ) {

        counts[
          campaign.status
        ]++;

      }

    }
  );


  if (campaignStatusChart) {

    campaignStatusChart.destroy();

  }


  campaignStatusChart =
    new Chart(
      canvas,
      {

        type: "doughnut",

        data: {

          labels: [

            "Bản nháp",

            "Đã duyệt",

            "Đang gửi",

            "Hoàn tất",

            "Lỗi",

            "Đã hủy"

          ],


          datasets: [

            {

              data: [

                counts.draft,

                counts.approved,

                counts.sending,

                counts.completed,

                counts.failed,

                counts.cancelled

              ],


              backgroundColor: [

                "#94a3b8",

                "#3b82f6",

                "#f59e0b",

                "#22c55e",

                "#ef4444",

                "#64748b"

              ],


              borderWidth: 0

            }

          ]

        },


        options: {

          responsive: true,

          maintainAspectRatio: false,


          cutout: "67%",


          plugins: {

            legend: {

              position: "bottom",

              labels: {

                usePointStyle: true,

                padding: 18

              }

            }

          }

        }

      }
    );

}



// ===================================
// BIỂU ĐỒ NHÓM KHÁCH HÀNG
// ===================================

function drawCustomerGroupChart(
  customers
) {

  const canvas =
    document.getElementById(
      "customer-group-chart"
    );


  if (!canvas) return;


  const groups = {

    basketball: 0,

    running: 0,

    sneaker: 0,

    general: 0

  };


  customers.forEach(
    customer => {

      if (
        groups[
          customer.interest_group
        ] !== undefined
      ) {

        groups[
          customer.interest_group
        ]++;

      }

    }
  );


  if (customerGroupChart) {

    customerGroupChart.destroy();

  }


  customerGroupChart =
    new Chart(
      canvas,
      {

        type: "bar",

        data: {

          labels: [

            "Bóng rổ",

            "Chạy bộ",

            "Sneaker",

            "Nhóm chung"

          ],


          datasets: [

            {

              label:
                "Khách hàng",

              data: [

                groups.basketball,

                groups.running,

                groups.sneaker,

                groups.general

              ],


              backgroundColor:
                "#2563eb",


              borderRadius: 8,

              borderSkipped: false

            }

          ]

        },


        options: {

          responsive: true,

          maintainAspectRatio: false,


          plugins: {

            legend: {

              display: false

            }

          },


          scales: {

            y: {

              beginAtZero: true,

              ticks: {

                precision: 0

              },

              grid: {

                color:
                  "#eef2f7"

              }

            },


            x: {

              grid: {

                display: false

              }

            }

          }

        }

      }
    );

}