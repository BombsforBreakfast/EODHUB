import type { MutableRefObject } from "react";
import type { GameInput } from "./rainbowCowboyEngine";

/** Shared action surface for keyboard + mobile controls — maps into {@link GameInput}. */
export type RainbowCowboyInputActions = {
  setMoveLeft: (active: boolean) => void;
  setMoveRight: (active: boolean) => void;
  setDuck: (active: boolean) => void;
  pressJump: () => void;
  pressSlurp: () => void;
  pressSpecial: () => void;
  pressWeapon: () => void;
  setWeaponHeld: (held: boolean) => void;
  releaseWeapon: () => void;
  releaseMovement: () => void;
};

export function createRainbowCowboyInputBridge(
  inputRef: MutableRefObject<GameInput>,
): RainbowCowboyInputActions {
  return {
    setMoveLeft(active) {
      inputRef.current.left = active;
    },
    setMoveRight(active) {
      inputRef.current.right = active;
    },
    setDuck(active) {
      inputRef.current.down = active;
    },
    pressJump() {
      inputRef.current.jumpPressed = true;
    },
    pressSlurp() {
      inputRef.current.tonguePressed = true;
    },
    pressSpecial() {
      inputRef.current.rainbowPressed = true;
    },
    pressWeapon() {
      inputRef.current.gunPressed = true;
    },
    setWeaponHeld(held) {
      inputRef.current.gunHeld = held;
    },
    releaseWeapon() {
      inputRef.current.gunHeld = false;
    },
    releaseMovement() {
      inputRef.current.left = false;
      inputRef.current.right = false;
      inputRef.current.down = false;
    },
  };
}
