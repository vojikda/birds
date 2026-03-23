const ROUNDS = 15;
const SCORE_CORRECT = 1;
const SCORE_WRONG = -1;

const $ = (sel) => document.querySelector(sel);

const els = {
  loading: $("#loading"),
  quiz: $("#quiz"),
  score: $("#score"),
  round: $("#round"),
  birdImage: $("#birdImage"),
  answerForm: $("#answerForm"),
  answerInput: $("#answerInput"),
  answerSubmit: $("#answerSubmit"),
  feedbackText: $("#feedbackText"),
  correctReveal: $("#correctReveal"),
  nextBtn: $("#nextBtn"),
  restartBtn: $("#restartBtn"),
  birdInfoBox: $("#birdInfoBox"),
};

function showLoading(show) {
  els.loading.classList.toggle("show", show);
  els.quiz.style.display = show ? "none" : "";
}

function normalizeAnswerText(s) {
  return String(s ?? "")
    .normalize("NFC")
    // Strip BOM / zero-width chars that can break “first word” checks
    .replace(/[\u200b-\u200d\ufeff]/g, "")
    // NBSP and other space-like code points → normal space (then collapse)
    .replace(/[\u00a0\u1680\u2000-\u200a\u202f\u205f\u3000]/g, " ")
    .trim()
    .replace(/\s+/g, " ")
    // Unicode default lowercasing is consistent across engines; avoids locale quirks.
    .toLowerCase()
    // Typo-tolerant: accented letters treated like plain ASCII for scoring only.
    .replace(/á/g, "a")
    .replace(/é/g, "e")
    .replace(/ě/g, "e")
    .replace(/í/g, "i")
    .replace(/ú/g, "u")
    .replace(/ů/g, "u")
    .replace(/ý/g, "y");
}

/**
 * Full name must match, or the player may type only the first word of a
 * multi-word name (e.g. "racek" for "RACEK CHECHTAVÝ").
 */
function evaluateAnswer(guess, correctName) {
  const g = normalizeAnswerText(guess);
  const full = normalizeAnswerText(correctName);
  if (!g) return { correct: false, partial: false };
  if (g === full) return { correct: true, partial: false };
  // First word only: normalized full name must start with guess + word boundary (space).
  if (full.length > g.length && full.startsWith(g) && full[g.length] === " ") {
    return { correct: true, partial: true };
  }
  return { correct: false, partial: false };
}

function setAnswerControlsDisabled(disabled) {
  if (els.answerInput) els.answerInput.disabled = disabled;
  if (els.answerSubmit) els.answerSubmit.disabled = disabled;
}

function clearAnswerInputStyles() {
  if (els.answerInput) els.answerInput.classList.remove("correct", "wrong");
}

function setFeedback({ text, correctRevealText, isFinal = false }) {
  els.feedbackText.textContent = text || "";
  if (correctRevealText) {
    els.correctReveal.hidden = false;
    els.correctReveal.textContent = correctRevealText;
  } else {
    els.correctReveal.hidden = true;
    els.correctReveal.textContent = "";
  }
  // Keep DOM structure stable; only control content/hidden state.
  els.nextBtn.disabled = isFinal;
}

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Minimal CSV parser supporting quoted fields (no external deps).
function parseCsv(text) {
  const rows = [];
  let i = 0;
  let field = "";
  let row = [];
  let inQuotes = false;

  const pushField = () => {
    row.push(field);
    field = "";
  };

  const pushRow = () => {
    // Skip empty lines
    if (row.length === 1 && row[0].trim() === "") return;
    rows.push(row);
    row = [];
  };

  while (i < text.length) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        // Escaped quote: ""
        if (text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }

    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }

    if (c === ",") {
      pushField();
      i++;
      continue;
    }

    if (c === "\n") {
      pushField();
      pushRow();
      i++;
      continue;
    }

    if (c === "\r") {
      i++;
      continue;
    }

    field += c;
    i++;
  }

  // Flush last row
  if (field.length > 0 || row.length > 0) {
    pushField();
    pushRow();
  }

  return rows;
}

async function loadBirdData() {
  const res = await fetch("./data/birds.csv", { cache: "no-store" });
  if (!res.ok) throw new Error(`Failed to load birds.csv (${res.status})`);
  const text = await res.text();

  const rawRows = parseCsv(text);
  if (rawRows.length === 0) throw new Error("Bird CSV is empty.");

  // Expect header: imageSrc,czechName
  const header = rawRows[0].map((h) => h.trim());
  const hasHeader =
    header.length >= 2 &&
    (header[0].toLowerCase().includes("image") ||
      header[0].toLowerCase().includes("pictures") ||
      header[0].toLowerCase().includes("src"));

  const dataRows = hasHeader ? rawRows.slice(1) : rawRows;

  const rows = [];
  for (const r of dataRows) {
    if (!r || r.length < 2) continue;
    const imageSrc = String(r[0] ?? "").trim();
    const czechName = String(r[1] ?? "").trim();
    const info = String(r[2] ?? "").trim();
    if (!imageSrc || !czechName) continue;
    rows.push({ imageSrc, czechName, info });
  }

  if (rows.length < 1) {
    throw new Error(`Need at least 1 bird row in data. Found ${rows.length}.`);
  }

  // Build map of names -> rows (some species may have multiple pictures).
  const rowsByName = new Map();
  for (const row of rows) {
    if (!rowsByName.has(row.czechName)) rowsByName.set(row.czechName, []);
    rowsByName.get(row.czechName).push(row);
  }

  return { rows, rowsByName };
}

function renderQuestion({ roundIndex, totalRounds, correctRow, correctName }) {
  els.round.textContent = `${roundIndex} / ${totalRounds}`;

  els.birdImage.alt = correctName;
  els.birdImage.src = correctRow.imageSrc;

  // If the image fails to load, still allow answering.
  els.birdImage.onerror = () => {
    els.birdImage.alt = `${correctName} (image not found)`;
  };

  if (els.answerInput) {
    els.answerInput.value = "";
    els.answerInput.classList.remove("correct", "wrong");
  }

  els.nextBtn.disabled = true;
  els.restartBtn.hidden = true;
  els.correctReveal.hidden = true;
  els.feedbackText.textContent = "Type the Czech name of the bird, then press Answer or Enter.";
  setAnswerControlsDisabled(false);

  // Clear feedback content from any previous question.
  els.correctReveal.textContent = "";

  // Clear bird info until the player answers.
  els.birdInfoBox.hidden = true;
  els.birdInfoBox.textContent = "";

  requestAnimationFrame(() => {
    els.answerInput?.focus();
  });
}

let state = null;

function startNewQuiz(birdState) {
  // Enforce the "each concrete picture exactly once per game" rule.
  // Some datasets might contain duplicate `imageSrc` values across rows.
  const seenImages = new Set();
  const uniquePictureRows = [];
  for (const row of birdState.rows) {
    if (!row?.imageSrc) continue;
    if (seenImages.has(row.imageSrc)) continue;
    seenImages.add(row.imageSrc);
    uniquePictureRows.push(row);
  }

  if (uniquePictureRows.length < ROUNDS) {
    throw new Error(
      `Need at least ${ROUNDS} bird pictures to run a full game without repeats. Found ${uniquePictureRows.length}.`
    );
  }

  // Create a per-game order of unique picture entries (no repeats within a game).
  const questionItems = shuffleInPlace(uniquePictureRows.slice()).slice(0, ROUNDS);

  state = {
    birdState,
    round: 1,
    score: 0,
    finished: false,
    currentCorrectName: null,
    currentInfo: null,
    questionItems,
  };

  els.score.textContent = String(state.score);
  els.restartBtn.hidden = true;

  renderCurrentRound();
}

function renderCurrentRound() {
  const totalRounds = ROUNDS;
  const roundIndex = state.round;

  if (roundIndex > totalRounds) {
    finishQuiz();
    return;
  }

  const currentItem = state.questionItems[roundIndex - 1];
  if (!currentItem) {
    finishQuiz();
    return;
  }

  // Correct picture comes from unique per-game order.
  const correctName = currentItem.czechName;
  const correctRow = currentItem;
  state.currentCorrectName = correctName;
  state.currentInfo = correctRow.info || "";

  renderQuestion({
    roundIndex,
    totalRounds,
    correctRow,
    correctName,
  });
}

function handleAnswerSubmit(e) {
  e.preventDefault();
  if (!state || state.finished) return;
  if (els.answerInput?.disabled) return;

  const guess = els.answerInput?.value ?? "";
  if (!normalizeAnswerText(guess)) {
    els.feedbackText.textContent = "Enter a name, then press Answer.";
    els.answerInput?.focus();
    return;
  }

  const correctName = state.currentCorrectName;
  const { correct: isCorrect, partial: isPartialName } = evaluateAnswer(
    guess,
    correctName
  );

  setAnswerControlsDisabled(true);
  clearAnswerInputStyles();

  if (els.answerInput) {
    if (isCorrect) els.answerInput.classList.add("correct");
    else els.answerInput.classList.add("wrong");
  }

  if (isCorrect) {
    state.score += SCORE_CORRECT;
    els.score.textContent = String(state.score);
    setFeedback({
      text: "Correct!",
      correctRevealText: isPartialName
        ? `Full name: ${correctName}`
        : null,
      isFinal: false,
    });
  } else {
    state.score += SCORE_WRONG;
    els.score.textContent = String(state.score);
    setFeedback({
      text: "Incorrect.",
      correctRevealText: `Correct answer: ${correctName}`,
      isFinal: false,
    });
  }

  els.nextBtn.disabled = false;

  // Show bird info after the player answers.
  const infoText = state.currentInfo;
  if (infoText) {
    els.birdInfoBox.textContent = infoText;
    els.birdInfoBox.hidden = false;
  } else {
    els.birdInfoBox.textContent = "";
    els.birdInfoBox.hidden = true;
  }
}

function finishQuiz() {
  state.finished = true;
  els.nextBtn.disabled = true;
  setAnswerControlsDisabled(true);
  els.restartBtn.hidden = false;

  setFeedback({
    text: `Finished! Final score: ${state.score}`,
    correctRevealText: null,
    isFinal: true,
  });
}

function nextRound() {
  if (!state || state.finished) return;
  state.round += 1;
  els.correctReveal.hidden = true;
  renderCurrentRound();
}

function restartQuiz() {
  if (!state) return;
  startNewQuiz(state.birdState);
}

function wireEvents() {
  els.answerForm?.addEventListener("submit", handleAnswerSubmit);
  els.nextBtn.addEventListener("click", nextRound);
  els.restartBtn.addEventListener("click", restartQuiz);
}

async function bootstrap() {
  wireEvents();
  showLoading(true);
  try {
    const birdState = await loadBirdData();
    showLoading(false);
    startNewQuiz(birdState);
  } catch (err) {
    showLoading(false);
    els.quiz.style.display = "";
    els.score.textContent = "0";
    els.round.textContent = `0 / ${ROUNDS}`;
    setAnswerControlsDisabled(true);
    setFeedback({
      text: "Could not start quiz.",
      correctRevealText: err?.message ? String(err.message) : String(err),
      isFinal: true,
    });
    els.restartBtn.hidden = false;
    els.restartBtn.textContent = "Reload";
    els.restartBtn.onclick = () => location.reload();
  }
}

bootstrap();

