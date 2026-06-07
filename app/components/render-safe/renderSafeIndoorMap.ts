/** Fixed building-interior layout for Level 2: Clearing Rooms (26×80 tiles). */

export function buildClearingRoomsMapRows(): string[] {
  const rows: string[][] = Array.from({ length: 80 }, () => Array(26).fill("w"));

  // Final room (north)
  for (let r = 0; r <= 4; r++) {
    for (let c = 7; c <= 18; c++) rows[r][c] = r <= 1 ? "t" : "p";
  }

  // Main hallway (south → north)
  for (let r = 5; r <= 77; r++) {
    for (let c = 11; c <= 14; c++) rows[r][c] = "p";
  }

  // Entry
  rows[77][12] = "s";
  rows[77][13] = "p";

  const carveRoom = (centerRow: number, leftSide: boolean) => {
    const doorCol = leftSide ? 10 : 15;
    const startCol = leftSide ? 3 : 16;
    const endCol = leftSide ? 9 : 22;
    rows[centerRow][doorCol] = "p";
    for (let r = centerRow - 2; r <= centerRow + 2; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (r >= 0 && r < 80) rows[r][c] = "p";
      }
    }
    for (let c = startCol; c <= endCol; c++) {
      rows[centerRow - 3][c] = "w";
      rows[centerRow + 3][c] = "w";
    }
    for (let r = centerRow - 2; r <= centerRow + 2; r++) {
      rows[r][startCol - 1] = "w";
      rows[r][endCol + 1] = "w";
    }
  };

  carveRoom(68, true); // Room A — left
  carveRoom(58, false); // Room B — right
  carveRoom(48, true); // Room C — left
  carveRoom(38, false); // Room D — right
  carveRoom(28, true); // Room E — left

  // Hallway connector to final room
  for (let r = 5; r <= 8; r++) {
    for (let c = 11; c <= 14; c++) rows[r][c] = "p";
  }

  return rows.map((row) => row.join(""));
}
