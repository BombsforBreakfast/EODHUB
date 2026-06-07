"use client";



import { useTheme } from "@/app/lib/ThemeContext";

import type { RenderSafeLevel, RenderSafeRunResult } from "./renderSafeTypes";



interface Props {

  result: RenderSafeRunResult;

  level?: RenderSafeLevel | null;

  personalBestMessage: string;

  isAuthenticated: boolean;

  onPlayAgain: () => void;

  onBackToLevels: () => void;

  nextLevel?: { title: string } | null;

  onNextLevel?: () => void;

}



export function RenderSafeEndScreen({

  result,

  level,

  personalBestMessage,

  isAuthenticated,

  onPlayAgain,

  onBackToLevels,

  nextLevel,

  onNextLevel,

}: Props) {

  const { t } = useTheme();

  const minutes = Math.floor(result.durationSeconds / 60);

  const seconds = result.durationSeconds % 60;

  const title = level?.completionTitle ?? "Target Reached";

  const subtitle =

    level?.completionSubtitle ?? "The assault force made it to the building.";

  const isLevel2 = result.levelId === "level-2";



  return (

    <div

      style={{

        border: `2px solid #f97316`,

        borderRadius: 16,

        background: t.surface,

        padding: "28px 22px",

        maxWidth: 480,

        margin: "0 auto",

        textAlign: "center",

      }}

    >

      <div style={{ fontSize: 40, marginBottom: 8 }}>{isLevel2 ? "🏢" : "🎯"}</div>

      <h2 style={{ margin: "0 0 4px", color: "#f97316" }}>{title}</h2>

      <p style={{ color: t.textMuted, fontSize: 14, marginBottom: 20 }}>{subtitle}</p>



      <div

        style={{

          display: "grid",

          gridTemplateColumns: "1fr 1fr",

          gap: 12,

          textAlign: "left",

          marginBottom: 20,

        }}

      >

        <Stat label="Score" value={String(result.score)} t={t} />

        <Stat label="Rank" value={result.rank} t={t} />

        <Stat label="Mistakes" value={String(result.mistakes)} t={t} />

        <Stat

          label="Time"

          value={`${minutes}:${seconds.toString().padStart(2, "0")}`}

          t={t}

        />

        {isLevel2 && result.roomsCleared != null && (

          <Stat label="Rooms Cleared" value={String(result.roomsCleared)} t={t} />

        )}

        {isLevel2 && result.threatsIdentified != null && (

          <Stat label="Threats Identified" value={String(result.threatsIdentified)} t={t} />

        )}

        {isLevel2 && result.correctDecisions != null && (

          <Stat label="Correct Decisions" value={String(result.correctDecisions)} t={t} />

        )}

      </div>



      <div

        style={{

          padding: 14,

          borderRadius: 10,

          background: "rgba(249,115,22,0.1)",

          border: "1px solid rgba(249,115,22,0.3)",

          marginBottom: 16,

          fontSize: 14,

          color: t.text,

        }}

      >

        {personalBestMessage}

        {!isAuthenticated && (

          <div style={{ marginTop: 8, fontSize: 13, color: t.textMuted }}>

            Sign in to save your personal best.

          </div>

        )}

      </div>



      <div style={{ display: "flex", gap: 10, flexWrap: "wrap", justifyContent: "center" }}>

        {nextLevel && onNextLevel && (

          <button

            type="button"

            onClick={onNextLevel}

            style={{

              padding: "12px 24px",

              borderRadius: 10,

              border: "none",

              background: "linear-gradient(135deg, #f97316, #ea580c)",

              color: "#fff",

              fontWeight: 700,

              cursor: "pointer",

            }}

          >

            Next Level: {nextLevel.title}

          </button>

        )}

        <button

          type="button"

          onClick={onPlayAgain}

          style={{

            padding: "12px 24px",

            borderRadius: 10,

            border: "none",

            background: "#f97316",

            color: "#fff",

            fontWeight: 700,

            cursor: "pointer",

          }}

        >

          Play Again

        </button>

        <button

          type="button"

          onClick={onBackToLevels}

          style={{

            padding: "12px 24px",

            borderRadius: 10,

            border: `1px solid ${t.border}`,

            background: t.surface,

            color: t.text,

            cursor: "pointer",

          }}

        >

          Level Select

        </button>

      </div>

    </div>

  );

}



function Stat({ label, value, t }: { label: string; value: string; t: { textMuted: string; text: string } }) {

  return (

    <div

      style={{

        padding: 12,

        borderRadius: 8,

        background: t.textMuted + "11",

      }}

    >

      <div style={{ fontSize: 11, color: t.textMuted, textTransform: "uppercase" }}>{label}</div>

      <div style={{ fontSize: 18, fontWeight: 700, color: t.text, marginTop: 4 }}>{value}</div>

    </div>

  );

}

