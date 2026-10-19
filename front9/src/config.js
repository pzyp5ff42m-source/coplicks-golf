/**
 * User settings, device detection, graphics quality tiers and difficulty presets.
 */
import { game } from "./state.js";

export const $ = (id) => document.getElementById(id);
export const store = localStorage;
export const params = new URLSearchParams(location.search);
// ---------- settings / tiers ----------
const IS_MOBILE =
  /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && innerWidth < 900);
function autoQ() {
  if (store.cgQAuto) return store.cgQAuto;
  if (IS_MOBILE) return (navigator.hardwareConcurrency || 4) >= 8 ? "med" : "low";
  return "high";
}
export const qualitySetting = params.get("q") || store.cgQ || "auto";
export const quality = qualitySetting == "auto" ? autoQ() : qualitySetting;
export const tier = {
  low: {
    pr: 1,
    shadow: 0,
    trees: 800,
    tufts: 0,
    bush: 100,
    bloom: false,
    maxE: 3,
    step: 3,
    parts: 0,
    tex: 256,
    clouds: 10,
  },
  med: {
    pr: 1.5,
    shadow: 1024,
    trees: 1700,
    tufts: 3500,
    bush: 260,
    bloom: false,
    maxE: 2.2,
    step: 2,
    parts: 140,
    tex: 256,
    clouds: 20,
  },
  high: {
    pr: 2,
    shadow: 2048,
    trees: 3000,
    tufts: 9000,
    bush: 900,
    bloom: true,
    maxE: 1.5,
    step: 2,
    parts: 320,
    tex: 512,
    clouds: 30,
  },
}[quality];
export const DIFF = {
  easy: {
    name: "Easy",
    speed: 0.6,
    win: 0.11,
    wind: [0, 2.2],
    gust: 0,
    arc: true,
    putt: "full",
    rough: 0.9,
    sand: 0.78,
    roughMu: 0.42,
    curveK: 5,
    tick: true,
  },
  medium: {
    name: "Medium",
    speed: 1,
    win: 0.06,
    wind: [1.5, 5],
    gust: 0.15,
    arc: true,
    putt: "short",
    rough: 0.8,
    sand: 0.62,
    roughMu: 0.5,
    curveK: 12,
    tick: true,
  },
  pro: {
    name: "Pro",
    speed: 1.55,
    win: 0.03,
    wind: [4, 9],
    gust: 0.45,
    arc: false,
    putt: "none",
    rough: 0.7,
    sand: 0.5,
    roughMu: 0.6,
    curveK: 24,
    tick: false,
  },
};
game.diffKey = DIFF[store.cgDiff] ? store.cgDiff : "medium";
game.diff = DIFF[game.diffKey];
game.ctrl = store.cgCtrl || "meter";
game.sound = store.cgSnd != "0";
