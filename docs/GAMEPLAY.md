# Gameplay

Bolo Ball is a two-color scoring duel on a shared maze. Players take turns dropping marbles from the top. Paths are deterministic given the board and RNG used for random arrows and black-hole exits.

## Setup

- Board size: **29 columns × 18 rows**
- Each player starts with **one marble available per column** (29 marbles)
- Player 1’s color (blue or red) is chosen at random; the other side gets the opposite color
- First player to move is randomized each game

### Modes

| Mode | Levels |
|------|--------|
| Short | 1 |
| Long | 3 |
| Extended | 5 |

Higher levels and longer modes place more arrows, occasional random arrows, and more bonuses. Extended boards also get an extra clear vertical “shaft.”

## Turn flow

1. Move the pusher to a column that still has one of your marbles available and is not blocked at the entrance.
2. Drop. The marble follows gravity and tile rules until it stops or exits the bottom.
3. Score for that drop is added immediately (depth + collected bonuses).
4. Play continues until both players have spent all marbles for the level.

You cannot drop into a column where your marble for that column is already used, or where the entrance is blocked.

## Tile types

| Tile | Behavior |
|------|----------|
| **Empty** | Fall through / rest here if blocked below |
| **Gray** | Solid shelf — blocks movement |
| **Arrow** | Ball never enters the arrow cell; it stands on the cell above and slides left or right. If sideways motion is blocked, it stops above the arrow (and that resting ball becomes an obstacle). Passing an arrow can **flip** its direction for later drops. |
| **Random arrow** | Same as arrow, but direction is chosen randomly when resolved |
| **Bonus** | Entering awards the tile’s face value (5, 10, or 15; default 10). Tile is cleared after collection |
| **Black hole** | Teleports to another open hole at random. If no other open exit exists, the ball can rest on the hole and plug it |

## Scoring

For each drop:

```
score = depthPoints + bonusPoints
```

| Outcome | Depth points |
|---------|----------------|
| Rest on row `r` (0-based from top) | `(r + 1) × 2` |
| Reach the bottom | **60** (then exits toward the nearer side) |

Bonus points are the sum of face values collected along the path.

### End-of-level cascade

After all marbles are placed:

1. All **gray** tiles are removed.
2. Every remaining ball falls again from its cell (bottom-most first).
3. The cascade awards **no points** and collects no bonus tiles. A ball’s score is fixed the moment it first comes to rest.

### Multi-level carry

In long / extended games, balls still on the board after a level become **bonus spots** carried into the next generated board.

## Winning

After the final level (and its cascade), the higher total score wins. Equal scores are a draw.

In 1-player mode, you are always player 0; the AI is player 1.

## AI (1-player)

The AI scores candidate columns by simulated depth, weighted bonuses, and a light “deny opponent” term. Difficulty changes how aggressively it values bonuses and blocking:

- **Easy** — weak bonus chase
- **Normal** — balanced; will detour for nearby strong bonuses
- **Hard** — strongly prioritizes bonuses and denial

The AI walks the pusher to its chosen column before dropping.

## Helpers

- **Peek** — temporarily reveal the opponent’s remaining marbles
- **Quick Finish** — auto-plays remaining drops for the level with shortened animation timing
- **Themes** — Classic / Polished / Arty (visual only; rules unchanged)
