/** Run an async task with a timeout that is always released on completion. */
export async function runWithTimeout(task, timeoutMs, message = "operation timeout") {
  let timeout;
  try {
    return await Promise.race([
      Promise.resolve().then(task),
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
      }),
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}
