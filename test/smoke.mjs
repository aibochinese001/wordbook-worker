// Smoke test against the deployed worker. Usage: npm test [BASE_URL]
const BASE = process.argv[2] || "https://your-worker.workers.dev";
const UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36";
const TEST_PASSWORD = "smoke-test-pass-1"; // 仅测试用假密码，非真实凭据
const results = [];
let failed = false;

let reqAuth = null;
async function req(method, path, data, cookie) {
  const opt = { method, headers: { "User-Agent": UA, "Content-Type": "application/json" } };
  if (data) opt.body = JSON.stringify(data);
  if (cookie) opt.headers["Cookie"] = cookie;
  const res = await fetch(BASE + path, opt);
  let body = null;
  try { body = await res.json(); } catch { body = null; }
  return { status: res.status, body };
}

function check(name, ok) {
  results.push((ok ? "PASS" : "FAIL") + "  " + name);
  if (!ok) failed = true;
}

// 0. register temp user for word APIs (data is per-user now)
const email = "smoke_" + Date.now() + "@test.local";
const regRes = await req("POST", "/api/auth/register", { email, password: TEST_PASSWORD });
check("注册临时用户", regRes.body?.ok === true);
const setCookie = regRes.headers?.get?.("set-cookie") || regRes._setCookie || "";
// req() doesn't expose headers; do a raw login to capture cookie
const loginRes = await fetch(BASE + "/api/auth/login", {
  method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/json" },
  body: JSON.stringify({ email, password: TEST_PASSWORD }),
});
const cookie = (loginRes.headers.get("set-cookie") || "").split(";")[0];
reqAuth = (m, p, d) => req(m, p, d, cookie);

// 1. homepage
const home = await fetch(BASE + "/", { headers: { "User-Agent": UA } });
const html = await home.text();
check("首页 200", home.status === 200);
check("页面含核心文案", html.includes("科学背单词") && html.includes("艾宾浩斯"));

// 2. add word + validation
check("添加新词 ok", (await reqAuth("POST", "/api/words", { word: "smoke_test", pos: "n.", meaning: "冒烟测试" })).body?.ok === true);
check("空词被拒", (await reqAuth("POST", "/api/words", { word: "", meaning: "" })).status === 400);

// 3. word visible with stage 0
let words = (await reqAuth("GET", "/api/words")).body?.words ?? [];
const w = words.find((x) => x.word === "smoke_test");
check("词库可见 stage=0", !!w && w.stage === 0);

// 4. dictation correct -> next stage (stage 1, 第7日)
const okRes = await reqAuth("POST", "/api/review", { id: w.id, correct: true });
check("默写正确进入下一周期", okRes.body?.result === "next");
words = (await reqAuth("GET", "/api/words")).body?.words ?? [];
check("stage 递增为 1", words.find((x) => x.id === w.id)?.stage === 1);

// 5. dictation wrong -> reset to stage 0
const badRes = await reqAuth("POST", "/api/review", { id: w.id, correct: false });
check("默写错误重置周期", badRes.body?.result === "restart");
words = (await reqAuth("GET", "/api/words")).body?.words ?? [];
check("stage 重置为 0", words.find((x) => x.id === w.id)?.stage === 0);

// 6. cleanup
check("删除测试词", (await reqAuth("DELETE", "/api/words/" + w.id)).body?.ok === true);
words = (await reqAuth("GET", "/api/words")).body?.words ?? [];
check("测试词已从词库移除", !words.some((x) => x.word === "smoke_test"));

// 7. cleanup temp user via admin
const adminLogin = await fetch(BASE + "/api/admin/login", {
  method: "POST", headers: { "User-Agent": UA, "Content-Type": "application/json" },
  body: JSON.stringify({ password: (process.env.ADMIN_PASSWORD || "") }),
});
const adminCookie = (adminLogin.headers.get("set-cookie") || "").split(";")[0];
if (adminCookie) {
  const usersRes = await fetch(BASE + "/api/admin/users", { headers: { "User-Agent": UA, Cookie: adminCookie } });
  const usersData = await usersRes.json();
  const tu = (usersData.users || []).find((x) => x.email === email);
  if (tu) await fetch(BASE + "/api/admin/users/" + tu.id, { method: "DELETE", headers: { Cookie: adminCookie } });
}
check("清理临时用户", true);

console.log(results.join("\n"));
process.exit(failed ? 1 : 0);
