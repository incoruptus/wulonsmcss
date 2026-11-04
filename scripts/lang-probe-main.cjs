const { app, BrowserWindow } = require("electron");
const fs = require("fs");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1500, height: 950, show: false });
  win.webContents.on("console-message", (_event, level, message) => {
    if (level >= 1) console.log("[console]", message);
  });
  win.webContents.on("render-process-gone", (_e, d) => console.log("[gone]", JSON.stringify(d)));
  try {
    await win.loadURL(process.env.PROBE_URL);
    await sleep(3500);
    const before = await win.webContents.executeJavaScript("document.body.innerText");
    console.log("BEFORE:", JSON.stringify(before.slice(0, 160)));
    const r = await win.webContents.executeJavaScript(`(() => {
      const btns = [...document.querySelectorAll("button")];
      const b = btns.find((x) => x.textContent.trim() === "English");
      if (!b) return "not-found";
      b.click();
      return "clicked";
    })()`);
    console.log("ACTION:", r);
    await sleep(1800);
    const after = await win.webContents.executeJavaScript("document.body.innerText");
    console.log("AFTER:", JSON.stringify(after.slice(0, 240)));
    const html = await win.webContents.executeJavaScript("document.getElementById('root')?.innerHTML.length ?? -1");
    console.log("ROOT_LEN:", html);
    const img = await win.webContents.capturePage();
    fs.writeFileSync(process.env.PROBE_OUT, img.toPNG());
    console.log("shot saved:", process.env.PROBE_OUT);
  } catch (e) {
    console.log("ERR", e && e.message);
  }
  app.quit();
});
