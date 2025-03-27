// ########## 配置区域（必须修改）##########
const USERNAME = "admin"; // 用户名和密码
const PASSWORD = "password";
const KV_NAMESPACE_NAME = "URL_MONITOR";
const TELEGRAM_BOT_TOKEN = ""; // 格式类似 123456:ABC-DEF1234
const TELEGRAM_CHAT_ID = "";    // 数字格式如 123456789
// ####################################

async function checkAuth(request) {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Basic ")) return false;

  const base64Credentials = authHeader.split(" ")[1];
  const credentials = atob(base64Credentials);
  return credentials === `${USERNAME}:${PASSWORD}`;
}

function generateHTML(config = {}, lastResult = {}) {
  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <title>URL监控服务</title>
    <style>
      body { font-family: Arial, sans-serif; max-width: 800px; margin: 20px auto; padding: 20px; }
      .form-group { margin-bottom: 15px; }
      label { display: block; margin-bottom: 5px; }
      textarea, input { width: 100%; padding: 8px; box-sizing: border-box; }
      button { background: #007bff; color: white; border: none; padding: 10px 20px; cursor: pointer; }
      .results { margin-top: 20px; padding: 15px; background: #f8f9fa; border-radius: 5px; }
    </style>
  </head>
  <body>
    <h1>URL监控配置</h1>
    
    <form id="configForm" onsubmit="return false">
      <div class="form-group">
        <label>监控地址（每行一个URL）：</label>
        <textarea name="urls" rows="6" required>${config.urls?.join("\n") || ""}</textarea>
      </div>
      
      <div class="form-group">
        <label>检查频率（分钟）：</label>
        <input type="number" name="interval" value="${config.interval || 5}" min="1" required>
      </div>
      
      <button onclick="saveConfig()">保存配置</button>
    </form>

    <div class="results">
      <h2>最近一次检查结果</h2>
      <div id="resultList">${lastResult.html || "暂无数据"}</div>
    </div>

    <script>
      async function saveConfig() {
        const interval = parseInt(document.querySelector('[name="interval"]').value);
        if (interval < 1) {
          alert("检查间隔不能小于1分钟");
          return;
        }

        const formData = {
          urls: document.querySelector('[name="urls"]').value.split("\\n"),
          interval: interval
        };

        try {
          const response = await fetch("/save", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(formData)
          });
          
          if (!response.ok) throw new Error("保存失败");
          alert("配置保存成功");
          location.reload();
        } catch (error) {
          alert(error.message);
        }
      }

      (async () => {
        try {
          const response = await fetch("/results");
          const results = await response.json();
          document.getElementById("resultList").innerHTML = results.html;
        } catch {}
      })();
    </script>
  </body>
  </html>
  `;
}

async function sendTelegramAlert(failedItems) {
  const message = failedItems.map(item => 
    `🛑 监控报警\n` +
    `地址: ${item.url}\n` +
    `时间: ${item.timestamp}\n` +
    `错误: ${item.error || item.status}`
  ).join("\n\n");

  try {
    const response = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: TELEGRAM_CHAT_ID,
          text: message,
          disable_notification: false
        })
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Telegram API error: ${error}`);
    }
  } catch (error) {
    console.error("Telegram通知失败:", error);
  }
}

async function handleRequest(request, env) {
  const url = new URL(request.url);
  const kv = env[KV_NAMESPACE_NAME];

  if (url.pathname === "/save" && request.method === "POST") {
    if (!await checkAuth(request)) return new Response("Unauthorized", { status: 401 });
    
    const config = await request.json();
    await kv.put("config", JSON.stringify(config));
    return new Response(JSON.stringify({ success: true }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  if (url.pathname === "/results") {
    const results = await kv.get("last_results");
    return new Response(results || JSON.stringify({ html: "暂无数据" }), {
      headers: { "Content-Type": "application/json; charset=UTF-8" }
    });
  }

  if (url.pathname === "/") {
    if (!await checkAuth(request)) {
      return new Response("需要认证", {
        status: 401,
        headers: { 
          "WWW-Authenticate": 'Basic realm="监控面板"',
          "Content-Type": "text/plain; charset=UTF-8"
        }
      });
    }

    const config = JSON.parse(await kv.get("config") || "{}");
    const lastResults = JSON.parse(await kv.get("last_results") || "{}");
    return new Response(generateHTML(config, lastResults), {
      headers: { "Content-Type": "text/html; charset=UTF-8" }
    });
  }

  return new Response("Not Found", { status: 404 });
}

async function handleScheduled(event, env) {
  const kv = env[KV_NAMESPACE_NAME];
  const now = Date.now();
  
  const [configStr, lastRunStr] = await Promise.all([
    kv.get("config"),
    kv.get("last_run")
  ]);
  
  const config = JSON.parse(configStr || "{}");
  const lastRun = lastRunStr ? parseInt(lastRunStr) : 0;
  const intervalMs = Math.max(config.interval || 1, 1) * 60 * 1000;
  
  if (now - lastRun >= intervalMs) {
    const results = [];
    for (const url of config.urls || []) {
      try {
        const response = await fetch(url, { timeout: 10000 });
        results.push({
          url,
          status: response.status,
          success: response.ok,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        results.push({
          url,
          success: false,
          error: error.message,
          timestamp: new Date().toISOString()
        });
      }
    }

    const failedItems = results.filter(item => !item.success);
    if (failedItems.length > 0) {
      await sendTelegramAlert(failedItems);
    }

    const html = results.map(r => `
      <div style="color: ${r.success ? 'green' : 'red'}; margin: 5px 0;">
        [${r.timestamp}] ${r.url} - ${r.success ? '成功' : `失败：${r.error || r.status}`}
      </div>
    `).join("");

    await Promise.all([
      kv.put("last_results", JSON.stringify({ html, raw: results })),
      kv.put("last_run", now.toString())
    ]);
  }
}

// 模块导出必须使用这个结构
export default {
  async fetch(request, env, ctx) {
    return handleRequest(request, env);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(handleScheduled(event, env));
  }
};