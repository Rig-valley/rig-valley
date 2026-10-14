/** A player-facing error. `message` is shown in the game, so it must be friendly English. */
export class GameError extends Error {
  constructor(
    public code: string,
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}

export function fail(code: string, message: string, status = 400): never {
  throw new GameError(code, message, status);
}

export const TOO_TIRED = "You're too tired for that. Eat something or go to bed.";
