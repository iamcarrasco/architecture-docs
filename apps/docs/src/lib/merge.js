export const normalizeLineEndings = (text) => {
  return text.replace(/\r\n?/g, "\n");
};

const splitLines = (text) => {
  if (text.length === 0) return [];
  return text.split("\n");
};

const lcsTable = (a, b) => {
  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = m - 1; i >= 0; i -= 1) {
    for (let j = n - 1; j >= 0; j -= 1) {
      if (a[i] === b[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }
  return dp;
};

const buildEdits = (baseLines, otherLines) => {
  const dp = lcsTable(baseLines, otherLines);
  const edits = [];
  let i = 0;
  let j = 0;
  while (i < baseLines.length || j < otherLines.length) {
    if (i < baseLines.length && j < otherLines.length && baseLines[i] === otherLines[j]) {
      i += 1;
      j += 1;
      continue;
    }

    const baseStart = i;
    const otherStart = j;

    while (
      i < baseLines.length ||
      j < otherLines.length
    ) {
      if (i < baseLines.length && j < otherLines.length && baseLines[i] === otherLines[j]) {
        break;
      }
      if (i < baseLines.length && j < otherLines.length) {
        if (dp[i + 1][j] >= dp[i][j + 1]) {
          i += 1;
        } else {
          j += 1;
        }
      } else if (i < baseLines.length) {
        i += 1;
      } else {
        j += 1;
      }
    }

    const baseEnd = i;
    const otherEnd = j;
    const lines = otherLines.slice(otherStart, otherEnd);
    edits.push({ baseStart, baseEnd, lines });
  }
  return edits;
};

const linesEqual = (a, b) => {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false;
  }
  return true;
};

const advanceEdits = (edits, index, baseIndex) => {
  let nextIndex = index;
  while (nextIndex < edits.length && edits[nextIndex].baseStart < baseIndex) {
    nextIndex += 1;
  }
  return nextIndex;
};

const formatConflictMarkers = (oursLines, theirsLines) => {
  return [
    "<<<<<<< ours",
    ...oursLines,
    "=======",
    ...theirsLines,
    ">>>>>>> theirs",
  ];
};

export const threeWayMerge = (baseText, theirsText, oursText) => {
  const normalizedBase = normalizeLineEndings(baseText);
  const normalizedTheirs = normalizeLineEndings(theirsText);
  const normalizedOurs = normalizeLineEndings(oursText);
  const keepTrailingNewline = normalizedOurs.endsWith("\n");

  const baseLines = splitLines(normalizedBase.replace(/\n$/, ""));
  const theirsLines = splitLines(normalizedTheirs.replace(/\n$/, ""));
  const oursLines = splitLines(normalizedOurs.replace(/\n$/, ""));

  const oursEdits = buildEdits(baseLines, oursLines);
  const theirsEdits = buildEdits(baseLines, theirsLines);

  let i = 0;
  let oi = 0;
  let ti = 0;
  const result = [];
  const hunks = [];

  while (i <= baseLines.length) {
    oi = advanceEdits(oursEdits, oi, i);
    ti = advanceEdits(theirsEdits, ti, i);

    const nextO = oi < oursEdits.length ? oursEdits[oi] : null;
    const nextT = ti < theirsEdits.length ? theirsEdits[ti] : null;

    const nextStart = Math.min(
      nextO ? nextO.baseStart : Number.POSITIVE_INFINITY,
      nextT ? nextT.baseStart : Number.POSITIVE_INFINITY
    );

    if (nextStart === Number.POSITIVE_INFINITY) {
      if (i < baseLines.length) {
        result.push(...baseLines.slice(i));
      }
      break;
    }

    if (nextStart > i) {
      result.push(...baseLines.slice(i, nextStart));
      i = nextStart;
      continue;
    }

    const hasO = nextO && nextO.baseStart === i;
    const hasT = nextT && nextT.baseStart === i;

    if (hasO && hasT) {
      const oEnd = nextO.baseEnd;
      const tEnd = nextT.baseEnd;
      if (oEnd === tEnd && linesEqual(nextO.lines, nextT.lines)) {
        result.push(...nextO.lines);
        i = oEnd;
        oi += 1;
        ti += 1;
        continue;
      }
      const maxEnd = Math.max(oEnd, tEnd);
      const oursChunk = nextO.lines;
      const theirsChunk = nextT.lines;
      hunks.push({
        baseStart: i,
        baseEnd: maxEnd,
        oursLines: oursChunk,
        theirsLines: theirsChunk,
      });
      result.push(...formatConflictMarkers(oursChunk, theirsChunk));
      i = maxEnd;
      oi += 1;
      ti += 1;
      continue;
    }

    if (hasO) {
      if (nextT && nextT.baseStart < nextO.baseEnd) {
        const maxEnd = Math.max(nextO.baseEnd, nextT.baseEnd);
        hunks.push({
          baseStart: i,
          baseEnd: maxEnd,
          oursLines: nextO.lines,
          theirsLines: nextT.lines,
        });
        result.push(...formatConflictMarkers(nextO.lines, nextT.lines));
        i = maxEnd;
        oi += 1;
        ti += 1;
        continue;
      }
      result.push(...nextO.lines);
      i = nextO.baseEnd;
      oi += 1;
      continue;
    }

    if (hasT) {
      if (nextO && nextO.baseStart < nextT.baseEnd) {
        const maxEnd = Math.max(nextO.baseEnd, nextT.baseEnd);
        hunks.push({
          baseStart: i,
          baseEnd: maxEnd,
          oursLines: nextO.lines,
          theirsLines: nextT.lines,
        });
        result.push(...formatConflictMarkers(nextO.lines, nextT.lines));
        i = maxEnd;
        oi += 1;
        ti += 1;
        continue;
      }
      result.push(...nextT.lines);
      i = nextT.baseEnd;
      ti += 1;
      continue;
    }

    if (i < baseLines.length) {
      result.push(baseLines[i]);
      i += 1;
      continue;
    }
    break;
  }

  const mergedText = result.join("\n") + (keepTrailingNewline ? "\n" : "");

  if (hunks.length > 0) {
    return {
      clean: false,
      conflict: {
        hunks,
        markers: mergedText,
      },
    };
  }

  return {
    clean: true,
    mergedText,
  };
};
