"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  getInvestigationLabel,
  getInvestigationResult,
  isPassageBlocked,
  resolveEncounterAction,
} from "./renderSafeEncounterLogic";
import {
  applyRandomizedHazardReduction,
  getMandatoryEncounters,
  rollEncounterThreats,
} from "./renderSafeLevels";
import { prepareLevel2Encounters } from "./renderSafeLevel2";
import {
  canMoveTo,
  computeCameraY,
  distancePx,
  encounterProgress,
  encounterRouteIndex,
  encounterToTile,
  findStartPosition,
  findTargetCenter,
  MAP_HEIGHT,
  MAP_WIDTH,
  playerProgress,
  playerRouteIndex,
  prepareRenderSafeLevelRun,
  tileCenterPx,
  TILE_SIZE,
  VIEWPORT_HEIGHT,
} from "./renderSafeMap";
import { RenderSafeMapCanvas, type ChemlightMarker } from "./RenderSafeMapCanvas";
import type { PlayerFacing } from "./renderSafeGraphics";
import {
  buildRunResult,
  calculateCompletionBonus,
  calculateTimeBonus,
  SCORE_VALUES,
} from "./renderSafeScoring";
import { RenderSafeActionAnimationOverlay } from "./RenderSafeActionAnimationOverlay";
import type { RenderSafeActionAnimationType } from "./renderSafeActionAnimations";
import { RenderSafeControls } from "./RenderSafeControls";
import { RenderSafeEncounterModal } from "./RenderSafeEncounterModal";
import {
  RenderSafeFailureModal,
  RenderSafeFeedbackModal,
} from "./RenderSafeFeedbackModal";
import { RenderSafeHud } from "./RenderSafeHud";
import { RenderSafeInvestigationPanel } from "./RenderSafeInvestigationPanel";
import type {
  RenderSafeActionId,
  RenderSafeEncounter,
  RenderSafeEncounterRunState,
  RenderSafeGameState,
  RenderSafeLevel,
  RenderSafeRunResult,
} from "./renderSafeTypes";
import { GameRotatePrompt } from "@/app/components/games/GameRotatePrompt";
import { useGamePlayingBodyClass } from "@/app/components/games/useGamePlayingBodyClass";

const MOVE_SPEED = 2.2;
const TRIGGER_THRESHOLD = 3;
const FOLLOWER_LAG = 6;
const FINAL_ROOM_TIMER_SECONDS = 60;

interface Props {
  level: RenderSafeLevel;
  onComplete: (result: RenderSafeRunResult) => void;
  onRestart: () => void;
  onExit: () => void;
  immersive?: boolean;
}

function createInitialRunState() {
  const start = findStartPosition();
  return {
    score: 0,
    mistakes: 0,
    resolvedCount: 0,
    correctDecisions: 0,
    threatsIdentified: 0,
    playerX: start.x,
    playerY: start.y,
    startTime: Date.now(),
    missionStatus: "Moving",
    feedbackMessage: null as string | null,
    feedbackType: "success" as "success" | "warning",
  };
}

export function RenderSafeGame({ level, onComplete, onRestart, onExit, immersive = true }: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  useGamePlayingBodyClass(immersive, shellRef);
  const [mapSeed, setMapSeed] = useState(1);
  const [startPos, setStartPos] = useState(() => findStartPosition());
  const [targetPos, setTargetPos] = useState(() => findTargetCenter());

  const [gameState, setGameState] = useState<RenderSafeGameState>("playing");
  const [run, setRun] = useState(createInitialRunState);
  const [activeEncounter, setActiveEncounter] = useState<RenderSafeEncounter | null>(null);
  const [decisionPhase, setDecisionPhase] = useState<"initial" | "post_investigation">("initial");
  const [investigationResult, setInvestigationResult] = useState<string | null>(null);
  const [investigationScanning, setInvestigationScanning] = useState(false);
  const [targetReached, setTargetReached] = useState(false);
  const [finishPulse, setFinishPulse] = useState(0);
  const [chemlights, setChemlights] = useState<ChemlightMarker[]>([]);
  const [failureMessage, setFailureMessage] = useState("");
  const [failureVariant, setFailureVariant] = useState<"mission_failed" | "player_killed">("mission_failed");
  const [actionAnimation, setActionAnimation] = useState<RenderSafeActionAnimationType | null>(null);
  const [pendingAfterAnimation, setPendingAfterAnimation] = useState<(() => void) | null>(null);
  const [displayScale, setDisplayScale] = useState(2);
  const [cameraY, setCameraY] = useState(0);
  const [positionHistory, setPositionHistory] = useState<Array<{ x: number; y: number }>>([]);
  const [playerFacing, setPlayerFacing] = useState<PlayerFacing>("up");
  const [finalRoomTimer, setFinalRoomTimer] = useState<number | null>(null);
  const finalRoomFailedRef = useRef(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const [activeEncounters, setActiveEncounters] = useState(level.encounters);
  const encounterThreatsRef = useRef(rollEncounterThreats(level.encounters));
  const encounterStatesRef = useRef<Record<string, RenderSafeEncounterRunState>>({});
  const triggeredRef = useRef<Set<string>>(new Set());
  const keysRef = useRef<Set<string>>(new Set());
  const runRef = useRef(run);
  runRef.current = run;

  const mandatoryEncounters = useMemo(
    () => getMandatoryEncounters({ ...level, encounters: activeEncounters }),
    [level, activeEncounters],
  );
  const totalEncounters = mandatoryEncounters.length;

  useEffect(() => {
    const runSeed = Math.floor(Math.random() * 0xffffffff);
    const isInterior = level.mapTheme === "building_interior";
    const encounters = isInterior
      ? prepareLevel2Encounters(level.encounters, runSeed)
      : applyRandomizedHazardReduction(level.encounters, runSeed);
    const seed = prepareRenderSafeLevelRun(encounters, runSeed, level.mapTheme);
    setActiveEncounters(encounters);
    setMapSeed(seed);
    setStartPos(findStartPosition());
    setTargetPos(findTargetCenter());
    encounterThreatsRef.current = rollEncounterThreats(encounters);
    encounterStatesRef.current = {};
    triggeredRef.current = new Set();
    finalRoomFailedRef.current = false;
    setFinalRoomTimer(null);
    setRun(createInitialRunState());
    setGameState("playing");
    setActiveEncounter(null);
    setChemlights([]);
    setTargetReached(false);
    setFinishPulse(0);
    setPositionHistory([]);
    setPlayerFacing("up");
  }, [level.id, level.encounters, level.mapTheme]);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const updateScale = () => {
      const rect = el.getBoundingClientRect();
      const scaleX = Math.floor(rect.width / MAP_WIDTH);
      const scaleY = Math.floor(rect.height / VIEWPORT_HEIGHT);
      const scale = Math.max(1, Math.min(scaleX || 1, scaleY || 1));
      setDisplayScale(scale);
    };

    updateScale();
    const observer = new ResizeObserver(updateScale);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setCameraY(computeCameraY(run.playerY, VIEWPORT_HEIGHT));
  }, [run.playerY]);

  useEffect(() => {
    if (!targetReached) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      setFinishPulse((now - start) / 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [targetReached]);

  const getEncounterState = useCallback((id: string): RenderSafeEncounterRunState => {
    if (!encounterStatesRef.current[id]) {
      encounterStatesRef.current[id] = {
        isThreat: encounterThreatsRef.current[id]?.isThreat ?? false,
        investigated: false,
        resolved: false,
        chemlightPlaced: false,
        entered: false,
      };
    }
    return encounterStatesRef.current[id];
  }, []);

  const markEncounterEntered = useCallback((encounterId: string) => {
    const state = getEncounterState(encounterId);
    state.entered = true;
  }, [getEncounterState]);

  const markResolved = useCallback((encounter: RenderSafeEncounter, chemlight?: boolean) => {
    const state = getEncounterState(encounter.id);
    state.resolved = true;
    if (chemlight) {
      state.chemlightPlaced = true;
      const tile = encounterToTile(encounter);
      setChemlights((prev) => [...prev, { col: tile.col, row: tile.row }]);
    }
    setRun((r) => ({
      ...r,
      resolvedCount: encounter.optionalDecoy ? r.resolvedCount : r.resolvedCount + 1,
    }));
    triggeredRef.current.add(encounter.id);
  }, [getEncounterState]);

  const playActionAnimation = useCallback(
    (type: RenderSafeActionAnimationType, then: () => void) => {
      setActionAnimation(type);
      setPendingAfterAnimation(() => then);
      setGameState("action_animation");
    },
    [],
  );

  const handleActionAnimationComplete = useCallback(() => {
    setActionAnimation(null);
    const then = pendingAfterAnimation;
    setPendingAfterAnimation(null);
    then?.();
  }, [pendingAfterAnimation]);

  const finishAfterContinue = useCallback(
    (result: Extract<ReturnType<typeof resolveEncounterAction>, { type: "continue" }>) => {
      if (result.message) {
        setGameState("feedback");
      } else {
        setActiveEncounter(null);
        setGameState("playing");
        setRun((r) => ({ ...r, missionStatus: "Moving" }));
      }
    },
    [],
  );

  const finishLevel = useCallback(() => {
    const current = runRef.current;
    const durationSeconds = Math.floor((Date.now() - current.startTime) / 1000);
    const { completionBonus, perfectBonus } = calculateCompletionBonus(
      current.mistakes,
      false,
      level.id,
    );
    const timeBonus = calculateTimeBonus(durationSeconds);
    const finalScore = current.score + completionBonus + perfectBonus + timeBonus;

    const roomsCleared = activeEncounters.filter(
      (e) => e.roomTitle && encounterStatesRef.current[e.id]?.resolved,
    ).length;

    const result = buildRunResult({
      levelId: level.id,
      levelSlug: level.slug,
      score: finalScore,
      mistakes: current.mistakes,
      durationSeconds,
      completed: true,
      roomsCleared,
      threatsIdentified: current.threatsIdentified,
      correctDecisions: current.correctDecisions,
    });

    setGameState("completed");
    onComplete(result);
  }, [level, onComplete, activeEncounters]);

  const triggerTargetReached = useCallback(() => {
    triggeredRef.current.add(
      activeEncounters.find((e) => e.type === "target_building")?.id ?? "target",
    );
    playActionAnimation("target_assault", () => {
      setTargetReached(true);
      setRun((r) => ({
        ...r,
        missionStatus: "Target Secured",
        playerX: targetPos.x,
        playerY: targetPos.y,
      }));
      setTimeout(() => {
        finishLevel();
      }, 900);
    });
    setRun((r) => ({ ...r, missionStatus: "Breaching target…" }));
  }, [finishLevel, activeEncounters, playActionAnimation, targetPos]);

  const tryTriggerEncounter = useCallback(
    (encounter: RenderSafeEncounter, px: number, py: number) => {
      if (triggeredRef.current.has(encounter.id)) return;

      const progress = playerProgress(py);
      const tile = encounterToTile(encounter);
      const center = tileCenterPx(tile.col, tile.row);
      const dist = distancePx(px, py, center.x, center.y);
      const playerIdx = playerRouteIndex(px, py);
      const encIdx = encounterRouteIndex(encounter);

      if (encounter.type === "target_building") {
        if (playerIdx >= encIdx - 2 || progress >= encounter.lanePosition - TRIGGER_THRESHOLD) {
          triggeredRef.current.add(encounter.id);
          triggerTargetReached();
        }
        return;
      }

      if (encounter.optionalDecoy) {
        if (dist < TILE_SIZE * 0.95) {
          triggeredRef.current.add(encounter.id);
          markEncounterEntered(encounter.id);
          setActiveEncounter(encounter);
          setDecisionPhase("initial");
          setGameState("encounter");
          setRun((r) => ({ ...r, missionStatus: "Off-route cue" }));
        }
        return;
      }

      const reachedOnRoute = playerIdx >= encIdx - 1 && dist < TILE_SIZE * 1.65;
      const reachedByProgress =
        progress >= encounterProgress(encounter) - TRIGGER_THRESHOLD && dist < TILE_SIZE * 1.75;

      if (reachedOnRoute || reachedByProgress) {
        triggeredRef.current.add(encounter.id);
        markEncounterEntered(encounter.id);
        setActiveEncounter(encounter);
        setDecisionPhase("initial");
        setGameState("encounter");
        if (encounter.type === "final_room") {
          setFinalRoomTimer(FINAL_ROOM_TIMER_SECONDS);
          setRun((r) => ({ ...r, missionStatus: "THREAT CONFIRMED" }));
        } else {
          setRun((r) => ({
            ...r,
            missionStatus: encounter.roomTitle ? encounter.roomTitle : "Encounter",
          }));
        }
      }
    },
    [triggerTargetReached, markEncounterEntered],
  );

  const handleMove = useCallback(
    (dir: "up" | "down" | "left" | "right") => {
      if (gameState !== "playing" || targetReached) return;

      setRun((r) => {
        let { playerX, playerY } = r;
        if (dir === "up") playerY -= MOVE_SPEED;
        if (dir === "down") playerY += MOVE_SPEED;
        if (dir === "left") playerX -= MOVE_SPEED;
        if (dir === "right") playerX += MOVE_SPEED;
        setPlayerFacing(dir);

        const isResolved = (id: string) => getEncounterState(id).resolved;
        if (
          isPassageBlocked(activeEncounters, r.playerY, playerY, isResolved)
        ) {
          const blocker = activeEncounters.find(
            (e) => e.blocksPassage && !isResolved(e.id),
          );
          if (blocker && !triggeredRef.current.has(blocker.id)) {
            triggeredRef.current.add(blocker.id);
            markEncounterEntered(blocker.id);
            setActiveEncounter(blocker);
            setDecisionPhase("initial");
            setGameState("encounter");
            setRun((prev) => ({ ...prev, missionStatus: "Blocked — Trip Line" }));
          }
          return r;
        }

        if (!canMoveTo(playerX, playerY)) {
          return r;
        }

        playerX = Math.max(8, Math.min(MAP_WIDTH - 8, playerX));
        playerY = Math.max(8, Math.min(MAP_HEIGHT - 8, playerY));

        return { ...r, playerX, playerY, missionStatus: "Moving" };
      });
    },
    [gameState, targetReached, activeEncounters, getEncounterState, markEncounterEntered],
  );

  useEffect(() => {
    if (gameState !== "playing" || targetReached) return;
    setPositionHistory((hist) => {
      const next = [...hist, { x: run.playerX, y: run.playerY }];
      if (next.length > 1 && next[next.length - 1].x === next[next.length - 2]?.x && next[next.length - 1].y === next[next.length - 2]?.y) {
        return hist;
      }
      return next.slice(-40);
    });
  }, [run.playerX, run.playerY, gameState, targetReached]);

  useEffect(() => {
    if (gameState !== "playing" || targetReached) return;
    for (const enc of activeEncounters) {
      tryTriggerEncounter(enc, run.playerX, run.playerY);
    }
  }, [gameState, activeEncounters, run.playerX, run.playerY, targetReached, tryTriggerEncounter]);

  useEffect(() => {
    if (finalRoomTimer == null || finalRoomTimer <= 0) return;
    if (gameState === "completed" || gameState === "mission_failed") return;

    const interval = window.setInterval(() => {
      setFinalRoomTimer((t) => {
        if (t == null || t <= 1) {
          if (!finalRoomFailedRef.current) {
            finalRoomFailedRef.current = true;
            setFailureMessage("You stayed too long. The device detonated. Mission failed.");
            setFailureVariant("mission_failed");
            playActionAnimation("detonation", () => {
              setGameState("mission_failed");
              setRun((r) => ({ ...r, missionStatus: "Mission Compromised" }));
            });
          }
          return 0;
        }
        return t - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [finalRoomTimer, gameState, playActionAnimation]);

  const handleAction = useCallback(
    (actionId: RenderSafeActionId) => {
      if (!activeEncounter) return;
      const encState = getEncounterState(activeEncounter.id);
      const result = resolveEncounterAction(activeEncounter, actionId, encState, decisionPhase);

      if (result.type === "investigate") {
        setGameState("investigating");
        setInvestigationScanning(true);
        setInvestigationResult(null);
        setRun((r) => ({ ...r, missionStatus: "Investigating" }));

        setTimeout(() => {
          encState.investigated = true;
          const invResult = getInvestigationResult(activeEncounter, encState.isThreat);
          setInvestigationResult(invResult);
          setInvestigationScanning(false);
          setRun((r) => ({
            ...r,
            missionStatus:
              activeEncounter.type === "trip_wire"
                ? "Trace Complete"
                : encState.isThreat
                  ? "Threat Confirmed"
                  : "Moving",
          }));

          setTimeout(() => {
            if (activeEncounter.type === "trip_wire") {
              if (encState.isThreat) {
                setRun((r) => ({
                  ...r,
                  score: r.score + SCORE_VALUES.threatIdentified,
                  threatsIdentified: r.threatsIdentified + 1,
                }));
              }
              setDecisionPhase("post_investigation");
              setGameState("post_investigation_decision");
              return;
            }
            if (encState.isThreat) {
              setRun((r) => ({
                ...r,
                score: r.score + SCORE_VALUES.threatIdentified,
                threatsIdentified: r.threatsIdentified + 1,
              }));
            }
            if (!encState.isThreat) {
              setGameState("feedback");
              const noThreatMsg = activeEncounter.optionalDecoy
                ? "No threat — but that cue was off the assault route."
                : "No threat detected. You kept the force moving.";
              setRun((r) => ({
                ...r,
                score: r.score + (activeEncounter.points || SCORE_VALUES.noThreatInvestigated),
                correctDecisions: r.correctDecisions + 1,
                feedbackMessage: noThreatMsg,
                feedbackType: activeEncounter.optionalDecoy ? "warning" : "success",
              }));
              markResolved(activeEncounter);
            } else {
              setDecisionPhase("post_investigation");
              setGameState("post_investigation_decision");
            }
          }, 1200);
        }, 1500);
        return;
      }

      if (result.type === "mission_failed") {
        setFailureMessage(result.message);
        setFailureVariant("mission_failed");
        playActionAnimation("detonation", () => {
          setGameState("mission_failed");
          setRun((r) => ({ ...r, missionStatus: "Mission Compromised" }));
        });
        return;
      }

      if (result.type === "player_killed") {
        setFailureMessage(result.message);
        setFailureVariant("player_killed");
        playActionAnimation("detonation", () => {
          setGameState("player_killed");
        });
        return;
      }

      if (result.type === "level_complete") {
        setFinalRoomTimer(null);
        setRun((r) => ({
          ...r,
          score: r.score + result.scoreDelta,
          correctDecisions: r.correctDecisions + 1,
          feedbackMessage: result.message,
          feedbackType: "success",
        }));
        markResolved(activeEncounter);
        playActionAnimation("avalanche_evac", () => {
          setTargetReached(true);
          setTimeout(() => finishLevel(), 400);
        });
        return;
      }

      if (result.type === "continue") {
        const scoreDelta = result.scoreDelta;
        const mistake = result.mistake ?? false;
        setRun((r) => ({
          ...r,
          score: r.score + scoreDelta,
          mistakes: mistake ? r.mistakes + 1 : r.mistakes,
          correctDecisions: result.correctDecision ? r.correctDecisions + 1 : r.correctDecisions,
          feedbackMessage: result.message || null,
          feedbackType: mistake ? "warning" : "success",
        }));
        markResolved(activeEncounter, result.chemlight);

        const afterAnimation = () => finishAfterContinue(result);

        if (result.chemlight) {
          playActionAnimation("chemlight_toss", afterAnimation);
          return;
        }
        if (actionId === "cut_and_secure" && activeEncounter.type === "trip_wire") {
          playActionAnimation("trip_wire_secure", afterAnimation);
          return;
        }
        if (actionId === "remote_move" && activeEncounter.type === "bridge_crossing") {
          playActionAnimation("bridge_remote_pull", afterAnimation);
          return;
        }

        finishAfterContinue(result);
      }
    },
    [
      activeEncounter,
      decisionPhase,
      getEncounterState,
      markResolved,
      playActionAnimation,
      finishAfterContinue,
      finishLevel,
    ],
  );

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
      if (gameState === "encounter" || gameState === "post_investigation_decision") {
        if (!activeEncounter) return;
        const options =
          decisionPhase === "initial"
            ? activeEncounter.initialOptions
            : activeEncounter.postInvestigationOptions;
        const action = options[Number(e.key) - 1];
        if (action) {
          handleAction(action);
        }
      }
      if (gameState === "playing" && !targetReached) {
        if (e.key === "ArrowUp" || e.key === "w") handleMove("up");
        if (e.key === "ArrowDown" || e.key === "s") handleMove("down");
        if (e.key === "ArrowLeft" || e.key === "a") handleMove("left");
        if (e.key === "ArrowRight" || e.key === "d") handleMove("right");
      }
    };
    const onKeyUp = (e: KeyboardEvent) => keysRef.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [gameState, activeEncounter, decisionPhase, handleAction, handleMove, targetReached]);

  useEffect(() => {
    if (gameState !== "playing" || targetReached) return;
    let frame: number;
    const tick = () => {
      const keys = keysRef.current;
      if (keys.has("arrowup") || keys.has("w")) handleMove("up");
      if (keys.has("arrowdown") || keys.has("s")) handleMove("down");
      if (keys.has("arrowleft") || keys.has("a")) handleMove("left");
      if (keys.has("arrowright") || keys.has("d")) handleMove("right");
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [gameState, handleMove, targetReached]);

  const handleFeedbackContinue = () => {
    setActiveEncounter(null);
    setGameState("playing");
    setRun((r) => ({
      ...r,
      missionStatus: "Moving",
      feedbackMessage: null,
    }));
  };

  const handleEncounterClick = (encounter: RenderSafeEncounter) => {
    if (gameState !== "playing" || targetReached) return;
    const state = getEncounterState(encounter.id);
    if (state.resolved || encounter.type === "target_building") return;

    const tile = encounterToTile(encounter);
    const center = tileCenterPx(tile.col, tile.row);
    if (distancePx(run.playerX, run.playerY, center.x, center.y) > TILE_SIZE * 2.5) return;

    triggeredRef.current.add(encounter.id);
    markEncounterEntered(encounter.id);
    setActiveEncounter(encounter);
    setDecisionPhase("initial");
    setGameState("encounter");
    setRun((r) => ({ ...r, missionStatus: "Encounter" }));
  };

  const progress = playerProgress(run.playerY);

  const followers = useMemo(() => {
    if (targetReached) {
      return [
        { x: targetPos.x - 10, y: targetPos.y + 8 },
        { x: targetPos.x + 10, y: targetPos.y + 8 },
        { x: targetPos.x - 6, y: targetPos.y + 14 },
        { x: targetPos.x + 6, y: targetPos.y + 14 },
      ];
    }
    const hist = positionHistory;
    return [1, 2, 3].map((lag) => {
      const idx = hist.length - lag * FOLLOWER_LAG;
      if (idx >= 0) return hist[idx];
      return { x: startPos.x, y: startPos.y + lag * 4 };
    });
  }, [positionHistory, startPos, targetPos, targetReached]);

  const shellStyle: React.CSSProperties = immersive
    ? {
        position: "relative",
        width: "100%",
        height: "100%",
        flex: 1,
        minHeight: 0,
        display: "flex",
        flexDirection: "column",
        overflow: "hidden",
      }
    : {
        position: "relative",
        width: "100%",
        maxWidth: 640,
        margin: "0 auto",
      };

  return (
    <div
      ref={shellRef}
      className={`render-safe-game-shell${immersive ? " render-safe-immersive arcade-game-shell" : ""}`}
      style={shellStyle}
    >
      <button
        type="button"
        onClick={onExit}
        style={{
          position: "absolute",
          top: 8,
          right: 8,
          zIndex: 30,
          padding: "6px 12px",
          borderRadius: 8,
          border: "1px solid rgba(249,115,22,0.5)",
          background: "rgba(8,12,8,0.85)",
          color: "#f0f0f0",
          fontSize: 11,
          fontWeight: 700,
          cursor: "pointer",
          fontFamily: "monospace",
        }}
      >
        Exit Game
      </button>

      <div
        ref={containerRef}
        style={{
          position: "relative",
          flex: immersive ? 1 : undefined,
          width: "100%",
          minHeight: immersive ? 0 : 360,
          height: immersive ? "100%" : undefined,
          display: "flex",
          alignItems: "stretch",
          justifyContent: "stretch",
          background: "#060a06",
          borderRadius: immersive ? 0 : 12,
          border: immersive ? "none" : "2px solid #2a3a2a",
          overflow: "hidden",
        }}
      >
        <RenderSafeHud
          level={level}
          score={run.score}
          mistakes={run.mistakes}
          progress={progress}
          missionStatus={run.missionStatus}
          finalRoomTimer={finalRoomTimer}
          overlay
        />

        <div className={immersive ? "render-safe-map-host" : undefined} style={immersive ? { position: "absolute", inset: 0, zIndex: 0 } : undefined}>
          <RenderSafeMapCanvas
            playerX={run.playerX}
            playerY={run.playerY}
            followers={followers}
            encounters={activeEncounters}
            getEncounterState={getEncounterState}
            chemlights={chemlights}
            targetReached={targetReached}
            finishPulse={finishPulse}
            onEncounterClick={handleEncounterClick}
            displayScale={displayScale}
            cameraY={cameraY}
            viewportHeight={VIEWPORT_HEIGHT}
            playerFacing={playerFacing}
            mapSeed={mapSeed}
            fillContainer={immersive}
            showTargetBanner={level.mapTheme !== "building_interior"}
          />
        </div>

        <RenderSafeControls onMove={handleMove} disabled={gameState !== "playing" || targetReached} overlay />
      </div>

      {actionAnimation && gameState === "action_animation" && (
        <RenderSafeActionAnimationOverlay
          type={actionAnimation}
          onComplete={handleActionAnimationComplete}
        />
      )}

      {(gameState === "encounter" || gameState === "post_investigation_decision") && activeEncounter && (
        <RenderSafeEncounterModal
          encounter={activeEncounter}
          options={
            decisionPhase === "initial"
              ? activeEncounter.initialOptions
              : activeEncounter.postInvestigationOptions
          }
          finalRoomTimer={activeEncounter.type === "final_room" ? finalRoomTimer : null}
          onAction={handleAction}
        />
      )}

      {gameState === "investigating" && (
        <RenderSafeInvestigationPanel
          result={investigationResult}
          scanning={investigationScanning}
          scanningLabel={
            activeEncounter ? getInvestigationLabel(activeEncounter) : undefined
          }
        />
      )}

      {gameState === "feedback" && run.feedbackMessage && (
        <RenderSafeFeedbackModal
          message={run.feedbackMessage}
          type={run.feedbackType}
          onContinue={handleFeedbackContinue}
        />
      )}

      {(gameState === "mission_failed" || gameState === "player_killed") && (
        <RenderSafeFailureModal message={failureMessage} variant={failureVariant} onRestart={onRestart} />
      )}

      {immersive ? (
        <GameRotatePrompt
          emoji="💣"
          title="Turn your phone sideways"
          subtitle="Landscape mode gives you the full mission map and touch controls."
        />
      ) : null}

      <style>{`
        .render-safe-immersive .render-safe-map-host {
          position: absolute;
          inset: 0;
          z-index: 0;
        }

        @media (max-width: 900px) {
          .render-safe-play-area {
            height: 100dvh !important;
          }
        }
      `}</style>
    </div>
  );
}
