/**
 * 3-tap swing meter and pointer/keyboard input (incl. slingshot drag mode).
 */
import { $ } from "./config.js";
import { renderer } from "./renderer.js";
import { SFX, audioInit } from "./audio.js";
import { club, clubTotal, curLie, distPin } from "./player.js";
import { updPreview } from "./preview.js";
import { hud, toast } from "./ui.js";
import { shoot } from "./game.js";
import { game } from "./state.js";

// ---------- swing meter ----------
const meterCanvas = $("meter"),
  meterCtx = meterCanvas.getContext("2d");
game.meterS = "idle";
let mp = 0;
let mPow = 0;
let mAcc = 0;
const METER_MIN = -0.2,
  METER_MAX = 1.12;
function targetPower() {
  const c = club();
  return Math.min(1, distPin() / clubTotal(c, curLie()));
}
export function setPreviewPower() {
  game.previewPower = Math.max(0.05, targetPower());
}
export function meterTap() {
  if (game.state != "aim") return;
  audioInit();
  SFX.tick();
  if (game.meterS == "idle") {
    game.meterS = "up";
    mp = 0;
  } else if (game.meterS == "up") {
    mPow = mp;
    if (mPow < 0.03) {
      game.meterS = "idle";
      return;
    }
    game.meterS = "down";
  } else if (game.meterS == "down") {
    mAcc = mp;
    finishMeter();
  }
}
function finishMeter() {
  let e = 0;
  const w = game.diff.win;
  if (Math.abs(mAcc) > w) e = (mAcc > 0 ? mAcc - w : mAcc + w) * 4;
  if (mPow > 1) e += (Math.random() - 0.5) * 0.25 * (mPow - 1) * 10;
  game.meterS = "idle";
  shoot(mPow, e);
  if (Math.abs(e) < 0.01) toast(club().n == "Putter" ? "" : "Pure! ✨", 800);
  else if (Math.abs(e) > 0.3) toast(e > 0 ? "Slice! ↪" : "Hook! ↩", 1000);
}
export function updMeter(dt) {
  const sp = game.diff.speed * (club().n == "Putter" ? 0.75 : 1);
  if (game.meterS == "up") {
    mp += dt * sp * 0.95;
    if (mp >= METER_MAX) {
      mp = METER_MAX;
      mPow = 1.1;
      game.meterS = "down";
    }
  } else if (game.meterS == "down") {
    mp -= dt * sp * 1.25;
    if (mp <= METER_MIN) {
      mAcc = METER_MIN;
      finishMeter();
    }
  }
  drawMeter();
}
function drawMeter() {
  const dp = Math.min(devicePixelRatio, 2),
    W = meterCanvas.clientWidth,
    H = meterCanvas.clientHeight;
  if (meterCanvas.width != W * dp) {
    meterCanvas.width = W * dp;
    meterCanvas.height = H * dp;
  }
  meterCtx.setTransform(dp, 0, 0, dp, 0, 0);
  meterCtx.clearRect(0, 0, W, H);
  const pad = 8,
    bw = W - pad * 2,
    X = (p) => pad + ((p - METER_MIN) / (METER_MAX - METER_MIN)) * bw,
    y = H * 0.3,
    h = H * 0.4;
  meterCtx.fillStyle = "#0009";
  meterCtx.beginPath();
  meterCtx.roundRect(pad - 4, y - 6, bw + 8, h + 12, 10);
  meterCtx.fill();
  const gr = meterCtx.createLinearGradient(X(0), 0, X(1), 0);
  gr.addColorStop(0, "#3b8a2e");
  gr.addColorStop(0.6, "#e8c547");
  gr.addColorStop(1, "#e8792a");
  meterCtx.fillStyle = gr;
  meterCtx.fillRect(X(0), y, X(1) - X(0), h);
  meterCtx.fillStyle = "#c62d2d";
  meterCtx.fillRect(X(1), y, X(METER_MAX) - X(1), h);
  meterCtx.fillStyle = "#2b4a2a";
  meterCtx.fillRect(X(METER_MIN), y, X(0) - X(METER_MIN), h);
  meterCtx.fillStyle = "#ffffffcc";
  meterCtx.fillRect(X(-game.diff.win), y - 3, X(game.diff.win) - X(-game.diff.win), h + 6);
  for (let q = 0.25; q < 1; q += 0.25) {
    meterCtx.fillStyle = "#0005";
    meterCtx.fillRect(X(q) - 0.5, y, 1, h);
  }
  if (game.diff.tick && game.state == "aim") {
    const t = targetPower();
    meterCtx.fillStyle = "#fff";
    meterCtx.beginPath();
    meterCtx.moveTo(X(t), y - 2);
    meterCtx.lineTo(X(t) - 5, y - 9);
    meterCtx.lineTo(X(t) + 5, y - 9);
    meterCtx.fill();
  }
  if (game.meterS == "down") {
    meterCtx.fillStyle = "#fff";
    meterCtx.fillRect(X(mPow) - 2, y - 4, 4, h + 8);
  }
  if (game.meterS != "idle") {
    meterCtx.fillStyle = "#111";
    meterCtx.fillRect(X(mp) - 2.5, y - 7, 5, h + 14);
    meterCtx.fillStyle = "#fff";
    meterCtx.fillRect(X(mp) - 1, y - 6, 2, h + 12);
  }
  meterCtx.fillStyle = "#fff";
  meterCtx.font = "600 11px system-ui";
  meterCtx.textAlign = "center";
  meterCtx.fillText(
    game.meterS == "idle"
      ? "TAP to start swing"
      : game.meterS == "up"
        ? "TAP to set power"
        : "TAP in the white zone",
    W / 2,
    y + h + 15,
  );
}
// ---------- input ----------
let ptr = null;
const cv = renderer.domElement;
cv.addEventListener("pointerdown", (e) => {
  audioInit();
  if (game.state != "aim") return;
  ptr = { x: e.clientX, y: e.clientY, a: game.aim, moved: false };
});
addEventListener("pointermove", (e) => {
  if (!ptr) return;
  const dx = e.clientX - ptr.x,
    dy = e.clientY - ptr.y;
  if (Math.hypot(dx, dy) > 8) ptr.moved = true;
  if (!ptr.moved) return;
  const putt = club().n == "Putter";
  game.aim = ptr.a + dx * (putt ? 0.0015 : 0.0035);
  if (game.ctrl == "drag") {
    game.previewPower = Math.max(0, Math.min(1.05, dy / (innerHeight * 0.33)));
    $("pw").style.width = Math.min(100, game.previewPower * 100) + "%";
  }
  updPreview();
  hud();
});
addEventListener("pointerup", (e) => {
  if (!ptr) return;
  const p = ptr;
  ptr = null;
  if (game.state != "aim") return;
  if (game.ctrl == "meter") {
    if (!p.moved) meterTap();
  } else if (p.moved && game.previewPower > 0.04) {
    const e2 = (Math.random() - 0.5) * game.diff.win * 3 * (Math.random() < 0.5 ? 1 : 2);
    shoot(game.previewPower, Math.abs(e2) < game.diff.win * 0.7 ? 0 : e2);
    $("pw").style.width = "0";
  }
});
addEventListener("keydown", (e) => {
  if (e.code == "Space") {
    e.preventDefault();
    if (game.ctrl == "meter") meterTap();
  }
  if (e.code == "ArrowLeft") {
    game.aim -= 0.01;
    updPreview();
  }
  if (e.code == "ArrowRight") {
    game.aim += 0.01;
    updPreview();
  }
});
