/**
 * Shared mutable game state.
 *
 * Values that more than one module reassigns (current state, strokes, aim,
 * difficulty, camera mode, scores, ...) live on this one object so every module
 * sees the same value. Each field is initialised by the module that owns it.
 */
export const game = {};
