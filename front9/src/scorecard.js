/**
 * 9-hole scorecard overlay and per-difficulty best scores.
 */
import { $, DIFF, store } from "./config.js";
import { HOLE, HOLES, PAR, holeIndex } from "./course.js";
import { introFly, newRound, startHole, startReplay } from "./game.js";
import { toStart } from "./ui.js";
import { competitionHoleDone } from "./competition.js";
import { game } from "./state.js";

function bestKey(k = game.diffKey) {
  return "cgF9Best_" + k;
}
function cardHTML(final) {
  const td = (v, i) => {
    if (v == null) return "<td></td>";
    const d = v - HOLES[i].par;
    return `<td class="sc ${d < 0 ? "u" : d > 0 ? "o" : ""}">${v}</td>`;
  };
  let tot = 0,
    tp = 0,
    run = [];
  game.scores.forEach((v, i) => {
    if (v != null) {
      tot += v;
      tp += HOLES[i].par;
    }
    run.push(v != null ? tot - tp : null);
  });
  const fs = (r) => (r == null ? "" : r == 0 ? "E" : r > 0 ? "+" + r : r);
  const tm = HOLES.reduce((s, h) => s + h.m, 0),
    tpar = HOLES.reduce((s, h) => s + h.par, 0);
  const pu = game.holeStats.reduce((s, x) => s + (x ? x.putts : 0), 0),
    fir = game.holeStats.filter((x) => x && x.fir).length,
    fa = game.holeStats.filter((x, i) => x && HOLES[i].par > 3).length,
    gir = game.holeStats.filter((x) => x && x.gir).length,
    gn = game.holeStats.filter((x) => x).length;
  return `<div class="sct"><table><tr><th>Hole</th>${HOLES.map((h) => `<th class="${h.n - 1 == holeIndex ? "cur" : ""}">${h.n}</th>`).join("")}<th>Out</th></tr>
 <tr><td>m</td>${HOLES.map((h) => `<td class="sm">${h.m}</td>`).join("")}<td class="sm">${tm}</td></tr>
 <tr><td>Par</td>${HOLES.map((h) => `<td>${h.par}</td>`).join("")}<td>${tpar}</td></tr>
 <tr><td>Score</td>${HOLES.map((h, i) => td(game.scores[i], i)).join("")}<td class="sc">${tot || ""}</td></tr>
 <tr><td>±</td>${run.map((r) => `<td class="sm">${fs(r)}</td>`).join("")}<td class="sm">${fs(run.filter((r) => r != null).pop())}</td></tr></table></div>
 <div class="sm">Putts ${pu} · Fairways ${fir}/${fa} · GIR ${gir}/${gn}</div>`;
}
function bestsHTML() {
  return `<table><tr><th>Best 9</th><th>Easy</th><th>Medium</th><th>Pro</th></tr><tr><td></td>${Object.keys(
    DIFF,
  )
    .map((k) => `<td>${store[bestKey(k)] || "–"}</td>`)
    .join("")}</tr></table>`;
}
export function showCard() {
  if (game.comp) return competitionHoleDone();
  game.scores[holeIndex] = game.strokes;
  game.holeStats[holeIndex] = { ...game.stats };
  const last = holeIndex >= HOLES.length - 1;
  const d = game.strokes - PAR;
  let extra = "";
  if (last) {
    const tot = game.scores.reduce((a, b) => a + (b || 0), 0);
    const full = game.scores.filter((v) => v != null).length == HOLES.length;
    const prev = +(store[bestKey()] || 0);
    const nb = full && (!prev || tot < prev);
    if (nb) store[bestKey()] = tot;
    extra =
      `<div class="sm" style="font-size:15px;margin:6px">${nb ? "🏆 New best 9 for " + game.diff.name + ": <b>" + tot + "</b>!" : "Front 9: <b>" + tot + "</b> · Best (" + game.diff.name + "): " + (store[bestKey()] || "–")}</div>` +
      bestsHTML();
  }
  $("card").innerHTML =
    `<h2>${last ? "Front 9 complete" : "Hole " + HOLE.n + " · " + (d == 0 ? "Par" : d > 0 ? "+" + d : d)}</h2><div class="sm">Coplicks · Tallebudgera · <b>${game.diff.name}</b></div>${cardHTML()}${extra}
 <div>${last ? '<button class="big" id="againB">Play again ↻</button>' : '<button class="big" id="nextB">Hole ' + (holeIndex + 2) + " ➜</button>"}</div><div><button id="cReplay">Replay last shot</button> <button id="cDiff">${last ? "Change difficulty" : "Quit round"}</button></div>`;
  $("cardO").style.display = "flex";
  if (last)
    $("againB").onclick = () => {
      $("cardO").style.display = "none";
      newRound();
      introFly();
    };
  else
    $("nextB").onclick = () => {
      $("cardO").style.display = "none";
      startHole(holeIndex + 1);
      introFly();
    };
  $("cReplay").onclick = () => {
    $("cardO").style.display = "none";
    startReplay(() => {
      $("cardO").style.display = "flex";
    });
  };
  $("cDiff").onclick = () => {
    $("cardO").style.display = "none";
    toStart();
  };
}
export function peekCard() {
  if (game.state == "fly" || game.state == "replay") return;
  $("card").innerHTML =
    `<h2>Scorecard</h2><div class="sm">Coplicks · Tallebudgera · <b>${game.diff.name}</b></div>${cardHTML()}${bestsHTML()}<div><button class="big" id="pkC">Back ⛳</button></div>`;
  $("cardO").style.display = "flex";
  $("pkC").onclick = () => {
    $("cardO").style.display = "none";
  };
}
