type RefreshOptions = {
  force?: boolean;
};

/** Coalesce identical in-flight snapshots and ignore results superseded by newer snapshots. */
export function createSnapshotRefreshGate() {
  let generation = 0;
  let completedSignature: string | null = null;
  let active: { signature: string; generation: number; promise: Promise<void> } | null = null;

  return {
    refresh<T>(
      signature: string,
      load: () => Promise<T>,
      apply: (value: T) => void,
      { force = false }: RefreshOptions = {},
    ): Promise<void> {
      if (active?.signature === signature) return active.promise;
      if (!force && completedSignature === signature) return Promise.resolve();

      const requestGeneration = ++generation;
      const promise = load()
        .then((value) => {
          if (requestGeneration !== generation) return;
          apply(value);
          completedSignature = signature;
        })
        .finally(() => {
          if (active?.generation === requestGeneration) active = null;
        });

      active = { signature, generation: requestGeneration, promise };
      return promise;
    },
  };
}
