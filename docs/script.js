$(function () {
  // --- Global Constants & Sound Effects ---
  const wedges = [
    2500,
    "BANKRUPT",
    900,
    500,
    650,
    500,
    800,
    "LOSE A TURN",
    700,
    "FREE PLAY",
    650,
    "BANKRUPT",
    600,
    500,
    550,
    600,
    "MILLION DOLLAR",
    700,
    500,
    650,
    600,
    700,
    600,
    "WILD CARD",
  ];

  const ding = new Howl({ src: ["assets/sounds/ding.mp3"], volume: 1.0 });
  const spin = new Howl({ src: ["assets/sounds/spin.mp3"], volume: 1.0 });
  const reveal = new Howl({ src: ["assets/sounds/reveal.mp3"], volume: 1.0 });
  const buzzer = new Howl({ src: ["assets/sounds/buzzer.mp3"], volume: 1.0 });
  const solved = new Howl({ src: ["assets/sounds/solved.mp3"], volume: 1.0 });
  const bankrupt = new Howl({
    src: ["assets/sounds/bankrupt.mp3"],
    volume: 1.0,
  });
  const vowels = new Howl({ src: ["assets/sounds/vowels.mp3"], volume: 1.0 });
  const consonants = new Howl({
    src: ["assets/sounds/consonants.mp3"],
    volume: 1.0,
  });
  const tossupMusic = new Howl({
    src: ["assets/sounds/tossup.mp3"],
    volume: 0.5,
    loop: true,
  });
  const tossupSolvedSound = new Howl({
    src: ["assets/sounds/tossupsolved.mp3"],
    volume: 1.0,
  });
  const VOWELS = ["A", "E", "I", "O", "U"];
  const VOWEL_COST = 250;

  // --- Game State Variables ---
  let allPuzzles = [];
  let currentPuzzle = {};
  let guessable = 0;
  let free = 0;
  let currentRotation = 0;
  let usedLetters = [];
  let playerScore = 0;
  let currentSpinValue = 0;
  let gameState = "intro";
  let isFreePlay = false;
  let allVowelsAnnounced = false;
  let allConsonantsAnnounced = false;
  let allConsonantsRevealed = false;
  let hasMillionDollarWedge = false;

  // --- Mode-specific State ---
  let gameMode = "classic";
  let tossUpInterval = null;
  let pointsUpdateInterval = null;
  let tossUpCurrentPoints = 1000;
  let totalTossUpPoints = 0;
  let tossUpRoundsPlayed = 0;
  let tossUpDuration = 0;
  let tossUpStartTime = 0;
  let tossUpPauseTime = 0;
  let remainingLetterTiles = [];
  let solveCallback = null;

  // --- Helper Functions ---
  function splitIntoLines(puzzleText, availableLineLengths) {
    const words = puzzleText.trim().split(/\s+/);
    if (!words.length) return [];
    const lines = [];
    let currentLine = "";
    let lineIndex = 0;
    for (const word of words) {
      const maxLineLength = availableLineLengths[lineIndex] || 12;
      if (currentLine.length === 0) {
        currentLine = word;
      } else if ((currentLine + " " + word).length <= maxLineLength) {
        currentLine += " " + word;
      } else {
        lines.push(currentLine);
        currentLine = word;
        lineIndex++;
        if (lineIndex >= availableLineLengths.length) break;
      }
    }
    if (currentLine) {
      lines.push(currentLine);
    }
    return lines;
  }

  function updateScore(newAmount) {
    playerScore = newAmount;
    $("#score-amount").text(playerScore);
    updateUIForNewTurn();
  }

  function updateUIForNewTurn() {
    $("#solve-btn").prop("disabled", free !== 1);
  }

  function setReadyMessage() {
    if (playerScore >= VOWEL_COST) {
      $("#message-label").text("Press Space to Spin, or a vowel to buy.");
    } else {
      $("#message-label").text("Press Space to Spin.");
    }
  }

  function revealBlank(tileContainer) {
    $(tileContainer).addClass("revealed");
  }

  function revealSymbol(tileContainer, symbol) {
    const letterSpan = $(tileContainer).find(".tile-letter");
    letterSpan.text(symbol).addClass("symbol");
    $(tileContainer).addClass("revealed");
  }

  function revealLetter(tileContainer, letter, playSound = true) {
    const letterSpan = $(tileContainer).find(".tile-letter");

    if (letterSpan.hasClass("symbol")) return; // Don't re-reveal symbols

    if (gameMode === "classic") {
      if (letterSpan.text() === letter.toUpperCase()) return;
      $(tileContainer).removeClass("revealed").addClass("unrevealed");
      if (playSound) {
        ding.play();
      }
      setTimeout(() => {
        letterSpan
          .css({ "background-color": "white", color: "black" })
          .text(letter.toUpperCase());
      }, 1600);
    } else {
      if (letterSpan.text() !== "") return;
      if (playSound) {
        // No ding sound for tossup
      }
      letterSpan.text(letter.toUpperCase());
    }
  }

  function triggerSolveAnimation() {
    const canvas = document.getElementById("particle-canvas");
    const ctx = canvas.getContext("2d");
    canvas.style.display = "block";
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const board = $(".puzzle-board-glow-container");
    const boardOffset = board.offset();
    const explosionX = boardOffset.left + board.width() / 2;
    const explosionY = boardOffset.top + board.height() / 2;

    let particles = [];
    const particleCount = 150;
    const colors = ["#FFFFFF", "#FFFF00", "#FFEA00", "#FFFACD"];

    for (let i = 0; i < particleCount; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * 6 + 2;
      particles.push({
        x: explosionX,
        y: explosionY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: Math.random() * 3 + 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        life: 100,
      });
    }

    let animationFrameId;
    function animateParticles() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      particles.forEach((p, index) => {
        p.x += p.vx;
        p.y += p.vy;
        p.life -= 1.5; // Fade faster

        if (p.life <= 0) {
          particles.splice(index, 1);
        } else {
          ctx.globalAlpha = p.life / 100;
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2, false);
          ctx.fillStyle = p.color;
          ctx.fill();
          ctx.globalAlpha = 1;
        }
      });

      if (particles.length > 0) {
        animationFrameId = requestAnimationFrame(animateParticles);
      } else {
        canvas.style.display = "none";
        cancelAnimationFrame(animationFrameId);
      }
    }

    if (animationFrameId) cancelAnimationFrame(animationFrameId);
    animateParticles();

    setTimeout(() => {
      cancelAnimationFrame(animationFrameId);
      canvas.style.display = "none";
    }, 1500); // Shorter failsafe
  }

  function checkPuzzleCompletion() {
    const puzzleLetters = new Set(
      currentPuzzle.puzzle.toUpperCase().replace(/[^A-Z]/g, "")
    );
    const puzzleVowels = [...puzzleLetters].filter((l) => VOWELS.includes(l));
    const puzzleConsonants = [...puzzleLetters].filter(
      (l) => !VOWELS.includes(l)
    );
    const allVowelsRevealed = puzzleVowels.every((v) =>
      usedLetters.includes(v)
    );

    if (allVowelsRevealed && !allVowelsAnnounced && puzzleVowels.length > 0) {
      allVowelsAnnounced = true;
      vowels.play();
      setTimeout(
        () => $("#message-label").text("All vowels have been revealed!"),
        2500
      );
    }

    const allConsonantsRevealedCheck = puzzleConsonants.every((c) =>
      usedLetters.includes(c)
    );
    if (
      allConsonantsRevealedCheck &&
      !allConsonantsAnnounced &&
      puzzleConsonants.length > 0
    ) {
      allConsonantsAnnounced = true;
      allConsonantsRevealed = true;
      consonants.play();
      setTimeout(
        () => $("#message-label").text("All consonants have been revealed!"),
        2500
      );
    }
  }

  function guessLetter(letter, isVowelPurchase = false) {
    if (usedLetters.includes(letter)) {
      buzzer.play();
      $("#message-label").text(`'${letter}' has already been used.`);
      if (isFreePlay) {
        setTimeout(setReadyMessage, 1500);
      } else {
        free = 1;
        guessable = 0;
        updateUIForNewTurn();
      }
      return;
    }

    usedLetters.push(letter);
    guessable = 0;
    const wasFreePlay = isFreePlay;
    isFreePlay = false;

    const matchingTiles = [];
    $(".tile-container").each(function () {
      const tileLetter = $(this).data("letter");
      if (tileLetter && tileLetter.toUpperCase() === letter.toUpperCase()) {
        matchingTiles.push({ tile: this, letter: tileLetter });
      }
    });

    if (matchingTiles.length > 0) {
      if (!isVowelPurchase && !VOWELS.includes(letter)) {
        const earnings = currentSpinValue * matchingTiles.length;
        updateScore(playerScore + earnings);
      }
      $("#message-label").text("Good guess! Your turn continues.");
      setTimeout(setReadyMessage, 2000);
      checkPuzzleCompletion();
    } else {
      buzzer.play();
      $("#message-label").text(`Sorry, no '${letter}'s. Spin again.`);
      setTimeout(setReadyMessage, 2000);
    }

    $.each(matchingTiles, (i, item) => {
      setTimeout(() => revealLetter(item.tile, item.letter), i * 1000);
    });

    free = 1;
    updateUIForNewTurn();
  }

  function showSolveInput(callback) {
    solveCallback = callback;
    $("#solve-input-container").show();
    $("#solve-input").focus();
    if (gameMode === "tossup") {
      $("#solve-points-display")
        .text(`For ${tossUpCurrentPoints} points!`)
        .show();
    } else {
      $("#solve-points-display").hide();
    }
  }

  function solvePuzzle() {
    if (free === 0 && guessable === 0) return;
    showSolveInput((attempt) => {
      const solutionAlphaOnly = currentPuzzle.puzzle
        .toUpperCase()
        .replace(/[^A-Z]/g, "");
      const attemptAlphaOnly = attempt.toUpperCase().replace(/[^A-Z]/g, "");

      if (attemptAlphaOnly === solutionAlphaOnly) {
        triggerSolveAnimation();
        solved.play();
        $("#message-label").text(
          `You solved it! It was: "${currentPuzzle.puzzle}"`
        );
        $(".puzzle-board").addClass("solved");
        $(".tile-container").each(function () {
          if ($(this).data("letter")) {
            revealLetter(this, $(this).data("letter"), false);
          }
        });
        free = 0;
        guessable = 0;
        gameState = "round_over";
        $("#solve-btn").prop("disabled", true);
        setTimeout(
          () =>
            $("#message-label").text("Press Space to start the next round!"),
          4000
        );
      } else {
        buzzer.play();
        $("#message-label").text("That is incorrect. Next player spins.");
        free = 1;
        guessable = 0;
        updateUIForNewTurn();
        setReadyMessage();
      }
    });
  }

  function resetGame() {
    tossupMusic.stop();
    if (tossUpInterval) clearInterval(tossUpInterval);
    if (pointsUpdateInterval) clearInterval(pointsUpdateInterval);

    gameState = "intro";
    $(".main-container, #game-header").addClass("hidden");
    $("#modal-overlay, #intro-modal").show();
  }

  function setupNewGame() {
    gameState = "loading"; // Prevent multiple starts
    tossupMusic.stop();
    if (tossUpInterval) clearInterval(tossUpInterval);
    if (pointsUpdateInterval) clearInterval(pointsUpdateInterval);
    usedLetters = [];
    isFreePlay = false;
    allVowelsAnnounced = false;
    allConsonantsAnnounced = false;
    allConsonantsRevealed = false;
    hasMillionDollarWedge = false;
    $(".puzzle-board").removeClass("solved");

    $(".tile-container").each(function () {
      const letterSpan = $(this).find(".tile-letter");
      letterSpan.removeAttr("style").text("").removeClass("symbol");
      $(this).data("letter", "").removeClass("revealed unrevealed");
    });

    currentPuzzle = allPuzzles[Math.floor(Math.random() * allPuzzles.length)];
    $("#category-label").text(currentPuzzle.category);
    layoutPuzzle();

    if (gameMode === "classic") {
      setupClassicRound();
    } else {
      setupTossUpRound();
    }
  }

  function layoutPuzzle() {
    const rowLengths = [12, 14, 14, 12];
    const preLines = splitIntoLines(
      currentPuzzle.puzzle.toUpperCase(),
      rowLengths
    );
    const startRow = preLines.length <= 2 ? 1 : 0;
    const availableRowLengths = rowLengths.slice(startRow);
    const lines = splitIntoLines(
      currentPuzzle.puzzle.toUpperCase(),
      availableRowLengths
    );
    let globalLetterIndex = 0;

    $.each(lines, function (i, lineText) {
      const rowIndex = startRow + i;
      if (rowIndex >= 4) return;
      const rowEl = $(".puzzle-row").eq(rowIndex);
      const startCol = Math.floor((rowLengths[rowIndex] - lineText.length) / 2);
      let currentCol = startCol;
      $.each(lineText.split(""), function (j, char) {
        if (char !== " ") {
          const tile = rowEl.find(".tile-container").eq(currentCol);
          if (tile.length) {
            tile.data("letter", char);
            const delay = globalLetterIndex * 40;
            if (char.match(/[A-Z0-9]/)) {
              // Letters and numbers are guessable
              setTimeout(() => revealBlank(tile), delay);
            } else {
              // Punctuation is revealed automatically
              setTimeout(() => revealSymbol(tile, char), delay);
            }
            globalLetterIndex++;
          }
        }
        currentCol++;
      });
    });
  }

  function setupClassicRound() {
    gameState = "playing";
    currentRotation = 0;
    free = 1;
    guessable = 0;
    updateScore(playerScore);
    const wheel = $("#wheel");
    wheel.removeClass("is-spinning").css("--rotation-angle", `0deg`);
    setReadyMessage();
    $("#solve-btn").prop("disabled", false);
    updateUIForNewTurn();
    reveal.play();
  }

  function startTossUpIntervals() {
    gameState = "tossup_revealing";

    pointsUpdateInterval = setInterval(() => {
      const elapsed = Date.now() - tossUpStartTime;
      const progress = elapsed / tossUpDuration;
      tossUpCurrentPoints = Math.round(
        Math.max(0, 1000 * Math.pow(1 - progress, 0.5))
      );
      $("#tossup-points").text(tossUpCurrentPoints);
    }, 50);

    const revealLoop = () => {
      if (remainingLetterTiles.length > 0) {
        const tileToReveal = remainingLetterTiles.pop();
        revealLetter(tileToReveal, $(tileToReveal).data("letter"), false);
      }
      if (remainingLetterTiles.length === 0) {
        clearInterval(tossUpInterval);
        setTimeout(() => {
          if (gameState === "tossup_revealing") {
            handleTossUpSolve(false, 0);
          }
        }, 1000);
      }
    };

    revealLoop(); // Reveal first letter immediately
    tossUpInterval = setInterval(revealLoop, 1000);
  }

  function resumeTossUpSequence() {
    tossupMusic.play();
    const pausedDuration = Date.now() - tossUpPauseTime;
    tossUpStartTime += pausedDuration;
    startTossUpIntervals();
  }

  function setupTossUpRound() {
    $("#message-label").text("Get ready for the Toss-Up...");
    $("#tossup-points").text(1000);
    reveal.play();

    setTimeout(() => {
      remainingLetterTiles = $(".tile-container")
        .filter(function () {
          const letter = $(this).data("letter");
          return letter && letter.match(/[A-Z0-9]/); // Only guessable tiles
        })
        .get();
      tossUpDuration = remainingLetterTiles.length * 1000;

      for (let i = remainingLetterTiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainingLetterTiles[i], remainingLetterTiles[j]] = [
          remainingLetterTiles[j],
          remainingLetterTiles[i],
        ];
      }

      $("#message-label").text("Press SPACE to buzz in!");
      tossupMusic.play();
      tossUpStartTime = Date.now();
      startTossUpIntervals();
    }, 2000);
  }

  function buzzIn() {
    gameState = "tossup_paused";
    clearInterval(tossUpInterval);
    clearInterval(pointsUpdateInterval);
    tossupMusic.pause();
    tossUpPauseTime = Date.now();

    showSolveInput((attempt) => {
      const solutionAlphaOnly = currentPuzzle.puzzle
        .toUpperCase()
        .replace(/[^A-Z]/g, "");
      const attemptAlphaOnly = attempt.toUpperCase().replace(/[^A-Z]/g, "");

      if (attemptAlphaOnly === solutionAlphaOnly) {
        handleTossUpSolve(true, tossUpCurrentPoints);
      } else {
        buzzer.play();
        resumeTossUpSequence();
      }
    });
  }

  function handleTossUpSolve(isCorrect, points) {
    clearInterval(tossUpInterval);
    clearInterval(pointsUpdateInterval);
    tossupMusic.stop();

    if (isCorrect) {
      triggerSolveAnimation();
      tossupSolvedSound.play();
      $(".puzzle-board").addClass("solved");
      totalTossUpPoints += points;
      tossUpRoundsPlayed++;
      const averagePoints = Math.round(totalTossUpPoints / tossUpRoundsPlayed);
      $("#avg-points").text(averagePoints);
      $("#message-label").text(
        `Correct for ${points} points! Press SPACE for next.`
      );
      gameState = "tossup_solved";
    } else {
      buzzer.play();
      $("#tossup-points").text(0);
      tossUpRoundsPlayed++;
      const averagePoints =
        tossUpRoundsPlayed > 0
          ? Math.round(totalTossUpPoints / tossUpRoundsPlayed)
          : 0;
      $("#avg-points").text(averagePoints);
      $("#message-label").text(
        `You didn't solve in time! Press SPACE for next puzzle.`
      );
      gameState = "tossup_failed";
    }

    $(".tile-container").each(function () {
      const letter = $(this).data("letter");
      if (letter) {
        revealLetter(this, letter, false);
      }
    });
  }

  // --- Event Handlers ---
  $("#solve-btn").on("click", solvePuzzle);

  $("#start-game-btn").on("click", function () {
    gameMode = $('input[name="gameMode"]:checked').val();
    $("#modal-overlay, #intro-modal").hide();
    $(".main-container, #game-header").removeClass("hidden");
    updateScore(0);
    totalTossUpPoints = 0;
    tossUpRoundsPlayed = 0;
    $("#avg-points").text("0");

    if (gameMode === "tossup") {
      $("#wheel, #ptr, #player-score, #solve-btn-container").addClass("hidden");
      $("#tossup-points-display, #avg-points-display").removeClass("hidden");
      $(".game-info-and-controls").css("justify-content", "center");
    } else {
      $("#tossup-points-display, #avg-points-display").addClass("hidden");
      $("#wheel, #ptr, #player-score, #solve-btn-container").removeClass(
        "hidden"
      );
      $(".game-info-and-controls").css("justify-content", "space-between");
    }
    setTimeout(setupNewGame, 500);
  });

  $('input[name="gameMode"]').on("change", function () {
    if ($(this).val() === "tossup") {
      $("#classic-rules").hide();
      $("#tossup-rules").show();
    } else {
      $("#tossup-rules").hide();
      $("#classic-rules").show();
    }
  });

  $(window).on("keydown", function (e) {
    if (e.ctrlKey && e.key.toLowerCase() === "r") {
      return;
    }
    if ($("#solve-input-container").is(":visible")) {
      if (e.key === "Enter") {
        $("#submit-solve-btn").click();
      } else if (e.key === "Escape") {
        $(".close-solve-box").click();
      }
      return;
    }

    if (e.code === "Space" || (e.key.length === 1 && e.key.match(/[a-zA-Z]/))) {
      e.preventDefault();
    }

    if (gameMode === "classic") {
      const letter = e.key.toUpperCase();
      if (
        VOWELS.includes(letter) &&
        free === 1 &&
        playerScore >= VOWEL_COST &&
        !isFreePlay
      ) {
        free = 0;
        updateUIForNewTurn();
        if (usedLetters.includes(letter)) {
          $("#message-label").text(`'${letter}' has already been used.`);
          setTimeout(() => {
            free = 1;
            setReadyMessage();
            updateUIForNewTurn();
          }, 1500);
          return;
        }
        updateScore(playerScore - VOWEL_COST);
        guessLetter(letter, true);
        return;
      }
      if (letter.length === 1 && letter >= "A" && letter <= "Z") {
        if (guessable === 1) {
          if (VOWELS.includes(letter) && !isFreePlay) {
            $("#message-label").text(
              "Vowels must be purchased. Guess a consonant."
            );
            return;
          }
          guessLetter(letter, VOWELS.includes(letter));
        }
      }
      if (e.code === "Space") {
        if (gameState === "round_over") {
          setupNewGame();
          return;
        }
        if (free === 1) {
          if (allConsonantsRevealed) {
            $("#message-label").text(
              "All consonants are gone! Buy a vowel or solve."
            );
            return;
          }
          free = 0;
          guessable = 0;
          updateUIForNewTurn();
          let targetDegree, landedResult;
          let randomSpot = Math.floor(Math.random() * 24);
          landedResult = wedges[randomSpot];
          targetDegree = randomSpot * 15;
          const currentAngle = currentRotation % 360;
          const rotationDelta = (targetDegree - currentAngle + 360) % 360;
          currentRotation += 3 * 360 + rotationDelta;
          const wheel = $("#wheel");
          wheel.addClass("is-spinning");
          wheel.one("transitionend", function () {
            $(this).removeClass("is-spinning");
          });
          spin.play();
          wheel.css("--rotation-angle", `${currentRotation}deg`);
          setTimeout(() => {
            currentSpinValue = 0;
            let message = "";
            guessable = 0;
            free = 0;

            if (typeof landedResult === "number") {
              currentSpinValue = landedResult;
              message = `$${landedResult}. Pick a consonant.`;
              guessable = 1;
            } else {
              message = `${landedResult}!`;
              if (landedResult === "BANKRUPT") {
                bankrupt.play();
                updateScore(0);
                free = 1;
              } else if (landedResult === "LOSE A TURN") {
                buzzer.play();
                free = 1;
              } else if (landedResult === "FREE PLAY") {
                isFreePlay = true;
                currentSpinValue = 500;
                guessable = 1;
              } else if (landedResult === "WILD CARD") {
                currentSpinValue = 500;
                guessable = 1;
              } else if (landedResult === "MILLION DOLLAR") {
                hasMillionDollarWedge = true;
                currentSpinValue = 0;
                message =
                  "You've got the Million Dollar Wedge! Pick a consonant.";
                guessable = 1;
              }
            }

            $("#message-label").text(message);
            updateUIForNewTurn();
          }, 6000);
        }
      }
    } else {
      if (e.code === "Space") {
        if (gameState === "tossup_revealing") {
          buzzIn();
        } else if (
          gameState === "tossup_solved" ||
          gameState === "tossup_failed"
        ) {
          gameState = "loading";
          setupNewGame();
        }
      }
    }
  });

  $("#submit-solve-btn").on("click", function () {
    const attempt = $("#solve-input").val();
    $("#solve-input").val("");
    $("#solve-input-container").hide();
    if (solveCallback) {
      solveCallback(attempt);
      solveCallback = null;
    }
  });

  $(".close-solve-box").on("click", function () {
    $("#solve-input-container").hide();
    if (gameMode === "tossup" && gameState === "tossup_paused") {
      resumeTossUpSequence();
    }
  });

  $("#back-btn").on("click", function () {
    resetGame();
  });

  $("#about-btn, #intro-about-btn").on("click", function () {
    $("#modal-overlay, #about-modal").show();
  });

  $(".close-modal-btn").on("click", function () {
    $("#modal-overlay, #about-modal").hide();
  });

  function fetchPuzzles() {
    fetch("assets/puzzles.json")
      .then((response) => response.json())
      .then((data) => {
        allPuzzles = data;
        $("#modal-overlay, #intro-modal").show();
      })
      .catch((error) => {
        console.error("Could not load puzzles:", error);
        $("#message-label").text(
          "Error: Could not load puzzles from puzzles.json"
        );
      });
  }

  fetchPuzzles();
});

setRandomWallpaper();

function setRandomWallpaper() {
  const wallpaperCount = 9;
  const randomWallpaperNumber = Math.floor(Math.random() * wallpaperCount) + 1;
  const wallpaperUrl = `url('wallpapers/${randomWallpaperNumber}.png')`;
  $("#wallpaper").css("background-image", wallpaperUrl);
}
