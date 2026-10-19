/**
 * HUD, toasts, club picker, settings panel and start screen.
 */
import { $, DIFF, quality, qualitySetting, store } from "./config.js";
import { HOLE, playHeight } from "./course.js";
import { cupPos } from "./props.js";
import { audioInit, master } from "./audio.js";
import { LIEN, wind, windNow } from "./physics.js";
import { ball, club, clubTotal, curLie, distPin, putMax } from "./player.js";
import { updPreview } from "./preview.js";
import { aimCamTarget, camLook, camPos, tl, tp } from "./camera.js";
import { totStr } from "./holes.js";
import { introFly, newRound, settle, startReplay } from "./game.js";
import { peekCard } from "./scorecard.js";
import { meterTap, setPreviewPower } from "./swing.js";
import { competitionQuit } from "./competition.js";
import { game } from "./state.js";

export function toast(t, ms = 1700) {
  const m = $("msg");
  m.innerHTML = t;
  m.style.opacity = 1;
  clearTimeout(game.toastT);
  game.toastT = setTimeout(() => (m.style.opacity = 0), ms);
}
// ---------- UI ----------
export function updClubUI() {
  const c = club();
  $("clubN").textContent = c.n;
  $("clubD").textContent =
    c.n == "Putter" ? "max " + putMax() + " m" : Math.round(clubTotal(c, curLie())) + " m";
}
$("cPrev").onclick = () => {
  if (game.state != "aim") return;
  game.clubI = (game.clubI + 7) % 8;
  updClubUI();
  setPreviewPower();
  updPreview();
};
$("cNext").onclick = () => {
  if (game.state != "aim") return;
  game.clubI = (game.clubI + 1) % 8;
  updClubUI();
  setPreviewPower();
  updPreview();
};
document.querySelectorAll("#shape button").forEach(
  (b) =>
    (b.onclick = () => {
      game.shape = +b.dataset.s;
      document.querySelectorAll("#shape button").forEach((x) => x.classList.toggle("on", x == b));
      updPreview();
    }),
);
$("swingB").addEventListener("pointerdown", (e) => {
  e.stopPropagation();
  meterTap();
});
$("replayB").onclick = () => {
  if (game.state == "aim") startReplay();
};
$("aimL").onclick = () => {
  game.aim -= club().n == "Putter" ? 0.01 : 0.02;
  updPreview();
};
$("aimR").onclick = () => {
  game.aim += club().n == "Putter" ? 0.01 : 0.02;
  updPreview();
};
export function uiMode() {
  $("meterBox").style.display = game.ctrl == "meter" ? "" : "none";
  $("dragBox").style.display = game.ctrl == "drag" ? "" : "none";
  $("swingB").style.display = game.ctrl == "meter" ? "" : "none";
  $("shape").style.visibility = club().n == "Putter" ? "hidden" : "visible";
}
export function hud() {
  $("st").textContent = game.strokes;
  $("dp").textContent = Math.round(distPin()) + " m";
  const l = curLie();
  const dh = playHeight(ball.x, ball.z) - playHeight(cupPos.x, cupPos.z);
  $("lie").textContent = LIEN[l] + " · " + (dh >= 0 ? "↑" : "↓") + Math.abs(dh).toFixed(1) + " m";
  const w = windNow();
  $("wsp").textContent = Math.round(w.s * 3.6) + " km/h";
  const yaw = Math.atan2(camLook.z - camPos.z, camLook.x - camPos.x);
  $("warr").style.transform = `rotate(${wind.dir - yaw}rad)`;
  $("dbadge").textContent = game.diff.name;
  updClubUI();
}
export function setDiff(k) {
  game.diffKey = k;
  game.diff = DIFF[k];
  store.cgDiff = k;
  document.querySelectorAll("#diffs button").forEach((b) => b.classList.toggle("on", b.dataset.d == k));
  document
    .querySelectorAll(".best")
    .forEach(
      (el) =>
        (el.textContent = store["cgBest_" + el.dataset.d] ? "Best " + store["cgBest_" + el.dataset.d] : ""),
    );
}
document.querySelectorAll("#diffs button").forEach((b) => (b.onclick = () => setDiff(b.dataset.d)));
setDiff(game.diffKey);
function selGroup(id, val, cb) {
  document.querySelectorAll("#" + id + " button").forEach((b) => {
    b.classList.toggle("on", b.dataset.v == val);
    b.onclick = () => {
      document.querySelectorAll("#" + id + " button").forEach((x) => x.classList.toggle("on", x == b));
      cb(b.dataset.v);
    };
  });
}
selGroup("qsel", qualitySetting, (v) => {
  store.cgQ = v;
  if (v == "auto") delete store.cgQAuto;
  location.reload();
});
selGroup("csel", game.ctrl, (v) => {
  game.ctrl = v;
  store.cgCtrl = v;
  uiMode();
});
selGroup("ssel", game.sound ? "1" : "0", (v) => {
  game.sound = v == "1";
  store.cgSnd = v;
  if (master) master.gain.value = game.sound ? 0.8 : 0;
});
$("qinfo").textContent = "Running: " + quality.toUpperCase();
$("gear").onclick = () => {
  $("setO").style.display = "flex";
};
$("setClose").onclick = () => {
  $("setO").style.display = "none";
};
$("setDiff").onclick = () => {
  $("setO").style.display = "none";
  toStart();
};
export function toStart() {
  if (game.comp) return competitionQuit();
  game.state = "start";
  game.camMode = "orbit";
  $("start").style.display = "flex";
  $("hud").style.display = "none";
  $("ctl").style.display = "none";
}
$("playB").onclick = () => {
  audioInit();
  $("start").style.display = "none";
  newRound();
  introFly();
};
$("cardB").onclick = peekCard;
export function endFly() {
  if (game.state != "intro") return;
  $("flyO").style.display = "none";
  $("hud").style.display = "";
  $("ctl").style.display = "";
  settle();
  aimCamTarget();
  camPos.copy(tp);
  camLook.copy(tl);
  toast(
    "Hole " +
      HOLE.n +
      " · Par " +
      HOLE.par +
      " · " +
      HOLE.m +
      " m<br><small>" +
      game.diff.name +
      " · " +
      totStr() +
      "</small>",
    1800,
  );
}
$("skipB").onclick = endFly;
