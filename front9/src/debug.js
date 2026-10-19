/**
 * Test hooks for automated play (window.G). Only installed with ?debug=1.
 */
import { $ } from "./config.js";
import { camera } from "./renderer.js";
import { bunkers, groundY, holeIndex } from "./course.js";
import { sunFollow } from "./lighting.js";
import { cupPos } from "./props.js";
import { ball, club, clubTotal, curLie, distPin, putMax } from "./player.js";
import { camLook, camPos } from "./camera.js";
import { introFly, shoot, startHole } from "./game.js";
import { peekCard, showCard } from "./scorecard.js";
import { endFly, setDiff } from "./ui.js";
import { render, tick } from "./main.js";
import { competitionHoleDone } from "./competition.js";
import { game } from "./state.js";

// ---------- test hooks (only with ?debug=1) ----------
export function installTestHooks() {
  window.G = {
    get state() {
      return game.state;
    },
    get hole() {
      return holeIndex;
    },
    startHole,
    introFly,
    /** competition: finish the current hole with a given score / skills value */
    compFinishHole: (v) => {
      if (game.comp.format.key == "skills") game.skillResult = v;
      else game.strokes = v;
      game.state = "done";
      return competitionHoleDone();
    },
    get comp() {
      return game.comp;
    },
    showCard,
    peekCard,
    SCORES: () => game.scores,
    setScores: (a) => {
      game.scores = a;
    },
    get strokes() {
      return game.strokes;
    },
    ball,
    cupP: cupPos,
    BUNK: bunkers,
    lie: () => curLie(),
    distPin,
    skip: endFly,
    play: () => $("playB").onclick(),
    auto: () => {
      if (game.state != "aim") return false;
      const c = club();
      let p =
        c.n == "Putter"
          ? Math.min(1, (distPin() * 1.02) / putMax())
          : Math.min(1, distPin() / clubTotal(c, curLie()));
      const d = distPin();
      if (window._ld && Math.abs(window._ld - d) < 3) window._boost = (window._boost || 0) + 0.12;
      else window._boost = 0;
      window._ld = d;
      shoot(Math.min(1, p + window._boost), 0);
      return true;
    },
    shoot,
    advance: (sec, fps = 60) => {
      const n = Math.round(sec * fps);
      for (let i = 0; i < n; i++) tick(1 / fps);
      render();
    },
    run: () => {
      let n = 0;
      while ((game.state == "fly" || game.state == "wait") && n++ < 20000) tick(1 / 30);
      render();
      return game.state;
    },
    view: (pos, look) => {
      game.camMode = "free";
      camPos.set(...pos);
      camLook.set(...look);
      camera.position.copy(camPos);
      camera.lookAt(camLook);
      sunFollow(camLook);
      render();
    },
    hV: groundY,
    setDiff,
    stats: () => game.stats,
    resume: () => {
      game.camMode = "aim";
    },
  };
}
