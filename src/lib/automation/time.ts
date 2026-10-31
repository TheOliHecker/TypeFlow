export const localTime = (n: number) =>
  new Date(n - new Date(n).getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
/** Local times skipped or repeated by daylight saving require a different explicit time. */
export function resolveLocalTime(input: string) {
  const n = new Date(input).getTime();
  if (!Number.isFinite(n) || localTime(n) !== input)
    throw new Error(
      "This local time does not exist. Choose another time outside the daylight-saving change.",
    );
  for (const offset of [
    -7200000, -3600000, -1800000, 1800000, 3600000, 7200000,
  ])
    if (localTime(n + offset) === input)
      throw new Error(
        "This local time occurs twice. Choose an unambiguous time outside the daylight-saving change.",
      );
  return n;
}
