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
  // Add with your other global variables
  let tossupLettersRevealed = 0;
  const ding = new Howl({ src: ["assets/sounds/ding.mp3"], volume: 1.0 });
  const spin = new Howl({ src: ["assets/sounds/spin.mp3"], volume: 1.0 });
  const reveal = new Howl({ src: ["assets/sounds/reveal.mp3"], volume: 1.0 });
  const buzzer = new Howl({ src: ["assets/sounds/buzzer.mp3"], volume: 0.4 });
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
    src: ["assets/sounds/tossup1.mp3"],
    volume: 0.5,
    loop: true,
  });
  const tossupSolvedSound = new Howl({
    src: ["assets/sounds/tossupsolved.mp3"],
    volume: 1.0,
  });
  const bonus = new Howl({
    src: ["assets/sounds/bonus.mp3"],
    volume: 1.0,
    loop: true,
  });
  const bonus2 = new Howl({
    src: ["assets/sounds/bonus2.mp3"],
    volume: 1.0,
    loop: true,
  });
  const bonuswin = new Howl({
    src: ["assets/sounds/bonuswin.mp3"],
    volume: 1.0,
    loop: true,
  });
  const bonuslose = new Howl({
    src: ["assets/sounds/bonuslose.mp3"],
    volume: 1.0,
    loop: true,
  });
  const tensecond = new Howl({
    src: ["assets/sounds/10second.mp3"],
    volume: 1.0,
  });
  const tossupSounds = [
    new Howl({ src: ["assets/sounds/tossup1.mp3"], volume: 0.5 }),
    new Howl({ src: ["assets/sounds/tossup2.mp3"], volume: 0.5 }),
    new Howl({ src: ["assets/sounds/tossup3.mp3"], volume: 0.5 }),
  ];
  // --- FIX: Define the sequence using the pre-loaded sounds ---
  const tossupSequence = [
    tossupSounds[0],
    tossupSounds[1],
    tossupSounds[2],
    tossupSounds[1],
  ];

  const VOWELS = ["A", "E", "I", "O", "U"];
  const VOWEL_COST = 250;

  // --- Game State Variables ---
  let allPuzzles = [];
  let bonusPuzzles = []; // ADD THIS NEW VARIABLE
  let currentPuzzle = {};
  let guessable = 0;
  let free = 0;
  let currentRotation = 0;
  let usedLetters = [];
  let playerScore = 0;
  let currentSpinValue = 0;
  let gameState = "intro";
  let bonusPicks = { consonants: [], vowel: "" };
  const GIVEN_LETTERS = ["R", "S", "T", "L", "N", "E"];
  let isFreePlay = false;
  let allVowelsAnnounced = false;
  let allConsonantsAnnounced = false;
  let allConsonantsRevealed = false;
  let hasMillionDollarWedge = false;
  let tossupMusicIndex = 0; // --- NEW: To track which song in the sequence to play ---
  let currentTossupSound = null; // --- NEW: To hold the currently playing sound ---

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

  function playNextTossupSong() {
    // Get the next sound object from the sequence
    currentTossupSound = tossupSequence[tossupMusicIndex];

    // When this sound finishes, automatically play the next one
    currentTossupSound.once("end", playNextTossupSong);

    if (gameMode == "tossup") {
      currentTossupSound.play();
    }

    // Increment the index for the next song in the loop
    tossupMusicIndex = (tossupMusicIndex + 1) % tossupSequence.length;
  }

  // --- NEW: Function to cleanly stop the music loop ---
  function stopTossupMusic() {
    if (currentTossupSound) {
      currentTossupSound.off("end"); // This is crucial to prevent the next song from starting
      currentTossupSound.stop();
      currentTossupSound = null;
    }
  }

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

  function triggerBigSolveAnimation() {
    let end = Date.now() + 3000;

    let interval2 = setInterval(() => {
      // Emit small burst from a random horizontal position
      confetti({
        particleCount: 8,
        angle: 90, // Downward
        spread: 1000,
        origin: {
          x: Math.random(), // Random horizontal position
          y: -0.05, // Top of the screen
        },
        ticks: 600,
        gravity: 3,
        startVelocity: 10,
        decay: 0.9,
      });

      // Stop the interval after the duration
      if (Date.now() > end) {
        clearInterval(interval2);
      }
    }, 100); // Fire every 100ms

    const duration = 5 * 1000; // The celebration will last for 5 seconds
    const animationEnd = Date.now() + duration;
    const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

    function randomInRange(min, max) {
      return Math.random() * (max - min) + min;
    }

    const interval = setInterval(function () {
      const timeLeft = animationEnd - Date.now();

      if (timeLeft <= 0) {
        return clearInterval(interval);
      }

      const particleCount = 50 * (timeLeft / duration);

      // --- Exploding Fireworks ---
      confetti(
        Object.assign({}, defaults, {
          particleCount,
          origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 },
        })
      );
      confetti(
        Object.assign({}, defaults, {
          particleCount,
          origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 },
        })
      );

      // --- CORRECTED RAIN EFFECT ---
      // Duration of the confetti rain (in milliseconds)
    }, 250);
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
  function solvePuzzle() {
    console.log("Is this thing on? 1");
    showSolveInput((attempt) => {
      console.log("Is this thing on? 2");

      const solutionAlphaOnly = currentPuzzle.puzzle
        .toUpperCase()
        .replace(/[^A-Z]/g, "");
      const attemptAlphaOnly = attempt.toUpperCase().replace(/[^A-Z]/g, "");

      if (attemptAlphaOnly && attemptAlphaOnly === solutionAlphaOnly) {
        triggerSolveAnimation();
        solved.play();
        $("#message-label").text(
          `You solved it! It was: "${currentPuzzle.puzzle}"`
        );
        $(".puzzle-board-border").addClass("solved");
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
        // NOTE: This part is important. A wrong answer should keep it the current player's turn
        // to spin again, so 'free' should be set back to 1.
        free = 1;
        guessable = 0;
        updateUIForNewTurn(); // This will re-enable the solve button
        setReadyMessage();
      }
    });
  }
  function resetGame() {
    gameMode = "none";
    // --- FIX: Stop the current toss-up sound if it exists ---
    stopTossupMusic();
    bonus.stop();
    bonuswin.stop();
    bonuslose.stop();
    bonus2.stop();
    tensecond.stop();

    if (tossUpInterval) clearInterval(tossUpInterval);
    if (pointsUpdateInterval) clearInterval(pointsUpdateInterval);
    $(".puzzle-board-border").removeClass("solved-bonus");

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
    $(".puzzle-board-border").removeClass("solved");

    $(".tile-container").each(function () {
      const letterSpan = $(this).find(".tile-letter");
      letterSpan.removeAttr("style").text("").removeClass("symbol");
      $(this).data("letter", "").removeClass("revealed unrevealed");
    });

    if (gameMode === "classic") {
      currentPuzzle = allPuzzles[Math.floor(Math.random() * allPuzzles.length)];
      $("#category-label").text(currentPuzzle.category);
      setupClassicRound();
      layoutPuzzle();
    } else if (gameMode === "bonus") {
      setupBonusRound();
    } else {
      currentPuzzle = allPuzzles[Math.floor(Math.random() * allPuzzles.length)];
      $("#category-label").text(currentPuzzle.category);
      setupTossUpRound();
      layoutPuzzle();
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
    $(".puzzle-board-border").addClass("solving");

    pointsUpdateInterval = setInterval(() => {
      const elapsed = Date.now() - tossUpStartTime;
      const progress = Math.min(1, elapsed / tossUpDuration);
      tossUpCurrentPoints = Math.round(1000 * Math.pow(1 - progress, 0.5));
      $("#tossup-points").text(tossUpCurrentPoints);

      // THE FIX: Adding "+ 1" makes the first letter appear at time zero.
      const lettersThatShouldBeRevealed = Math.floor(elapsed / 1000) + 1;

      // This loop now correctly reveals letters starting immediately.
      while (tossupLettersRevealed < lettersThatShouldBeRevealed) {
        if (remainingLetterTiles.length > 0) {
          tossupRevealLoop();
          tossupLettersRevealed++;
        } else {
          break;
        }
      }

      if (tossUpCurrentPoints <= 0 && gameState === "tossup_revealing") {
        handleTossUpSolve(false, 0);
      }
    }, 50);
  }
  function resumeTossUpSequence() {
    // This logic correctly calculates the pause duration
    const pausedDuration = Date.now() - tossUpPauseTime;
    tossUpStartTime += pausedDuration;

    // Restart the single, unified timer
    startTossUpIntervals();
  }

  function handleBonusPick(letter) {
    // Ignore invalid input
    if (!letter.match(/^[A-Z]$/) || usedLetters.includes(letter)) {
      buzzer.play(); // Play an error sound
      return;
    }

    const isVowel = VOWELS.includes(letter);

    if (isVowel) {
      if (bonusPicks.vowel === "") {
        bonusPicks.vowel = letter;
      } else {
        buzzer.play(); // Already picked a vowel
        return;
      }
    } else {
      if (bonusPicks.consonants.length < 3) {
        bonusPicks.consonants.push(letter);
      } else {
        buzzer.play(); // Already picked 3 consonants
        return;
      }
    }

    usedLetters.push(letter);
    ding.play(); // Play a success sound
    updateBonusPicksDisplay();

    // If all letters are chosen, start the final reveal
    if (bonusPicks.consonants.length === 3 && bonusPicks.vowel !== "") {
      gameState = "bonus_revealing_picks"; // Prevent more picks
      setTimeout(revealPlayerPicks, 1000);
    }
  }

  function updateBonusPicksDisplay() {
    const consonantsStr = bonusPicks.consonants.join(" ");
    const vowelStr = bonusPicks.vowel;

    // --- NEW: Dynamic Instruction Logic ---
    let instructionText = "Choose ";
    const consonantsLeft = 3 - bonusPicks.consonants.length;
    const vowelsLeft = bonusPicks.vowel === "" ? 1 : 0;
    const parts = [];

    // Add the consonant part if needed
    if (consonantsLeft > 0) {
      parts.push(`${consonantsLeft} consonant${consonantsLeft > 1 ? "s" : ""}`);
    }

    // Add the vowel part if needed
    if (vowelsLeft > 0) {
      parts.push(`${vowelsLeft} vowel`);
    }

    // Join the parts with "and"
    instructionText += parts.join(" and ");
    instructionText += ".";

    // If all letters have been picked, the game will proceed, so this text won't be seen.
    // This is just a fallback.
    if (parts.length === 0) {
      instructionText = "All letters selected!";
    }
    // --- End of New Logic ---

    // Wrap each line in its own div for independent styling
    const instructionHTML = `<div>${instructionText}</div>`;
    const picksHTML = `<div id="player-picks-display">${consonantsStr} ${vowelStr}</div>`;

    // Set the HTML of the message label
    $("#message-label").html(instructionHTML + picksHTML);
  }

  /**
   * Reveals the letters the player picked on the puzzle board.
   */
  function revealPlayerPicks() {
    const playerLetters = [...bonusPicks.consonants, bonusPicks.vowel];
    const tilesToRevealQueue = [];

    playerLetters.forEach((letter) => {
      $(".tile-container").each(function () {
        if ($(this).data("letter") === letter) {
          tilesToRevealQueue.push(this);
        }
      });
    });

    // This is the helper function inside your main setupBonusRound function
    function revealNextInQueue() {
      if (tilesToRevealQueue.length > 0) {
        const tile = tilesToRevealQueue.shift();
        revealLetterWithAnimation(tile, $(tile).data("letter"));
        setTimeout(revealNextInQueue, 1000); // Wait 1 second before revealing the next one
      } else {
        // All letters have been revealed, so start the final timer.
        $("#message-label").text(
          "All your letters are revealed. Get ready to solve!"
        );

        setTimeout(function () {
          bonus2.stop();
          tensecond.play();

          // --- TIMER LOGIC STARTS HERE ---

          gameState = "bonus_waiting_for_buzz"; // Allow spacebar to be used for buzzing
          let timeLeft = 10;
          $(".puzzle-board-border").addClass("solving");

          // Update the message label with the current time left
          const updateTimerDisplay = () => {
            $("#message-label").html(
              `Press SPACE to buzz in! <span id='timeLeft'>Time Left: ${timeLeft}</span>`
            );
          };

          updateTimerDisplay(); // Show the initial time

          // Start the countdown
          bonusTimerInterval = setInterval(() => {
            timeLeft--;
            updateTimerDisplay();

            // When the timer runs out
            // When the timer runs out
            if (timeLeft <= 0) {
              // **MODIFIED PART**
              // Instead of having all the logic here, just call the new function.
              $("#message-label").html("Time's up!");
              failBonusRound();
            }
          }, 1000);
        }, 3000); // 3-second pause before the timer starts
      }
    }
    revealNextInQueue();
  }

  function setupBonusRound() {
    stopTossupMusic();
    bonus.play();

    currentPuzzle =
      bonusPuzzles[Math.floor(Math.random() * bonusPuzzles.length)];

    $("#category-label").text(currentPuzzle.category);
    layoutPuzzle();

    // Reset and populate used letters with the given ones
    usedLetters = [...GIVEN_LETTERS];
    bonusPicks = { consonants: [], vowel: "" }; // Reset picks for a new round

    $("#message-label").text("Revealing letters R, S, T, L, N, and E.");
    const tilesToRevealQueue = [];

    GIVEN_LETTERS.forEach((letter) => {
      $(".tile-container").each(function () {
        if ($(this).data("letter") === letter) {
          tilesToRevealQueue.push(this);
        }
      });
    });

    /**
     * Updates the message label to show the letters the player has picked.
     */

    function revealNextInQueue() {
      if (tilesToRevealQueue.length > 0) {
        const tile = tilesToRevealQueue.shift();
        revealLetterWithAnimation(tile, $(tile).data("letter"));
        setTimeout(revealNextInQueue, 1000);
      } else {
        // **MODIFIED PART**
        // When done, update the UI and set the game state for picking
        updateBonusPicksDisplay(); // Initial display
        gameState = "bonus_picking_letters";
        bonus.stop();
        bonus2.play();
      }
    }

    setTimeout(revealNextInQueue, 2000);
  }

  /**
   * Reveals a single letter on a tile with a blue flip animation.
   * NOTE: You will also need this helper function in your script if you don't have it.
   * @param {HTMLElement} tileContainer - The DOM element for the tile.
   * @param {string} letter - The letter to reveal.
   */
  function revealLetterWithAnimation(tileContainer, letter) {
    const letterSpan = $(tileContainer).find(".tile-letter");

    // Don't re-animate an already revealed tile
    if (letterSpan.text() !== "" || $(tileContainer).hasClass("unrevealed")) {
      return;
    }

    // Add a class that triggers a CSS transition to turn the tile blue
    $(tileContainer).addClass("unrevealed");
    ding.play();
    // After 800ms, the animation is complete, so we set the letter text
    setTimeout(() => {
      letterSpan
        .css({ "background-color": "white", color: "black" })
        .text(letter.toUpperCase());
    }, 1200);
  }

  function setupTossUpRound() {
    $("#message-label").text("Get ready for the Toss-Up...");
    $("#tossup-points").text(1000);
    reveal.play();

    tossupLettersRevealed = 0;

    setTimeout(() => {
      remainingLetterTiles = $(".tile-container")
        .filter(function () {
          const letter = $(this).data("letter");
          return letter && letter.match(/[A-Z0-9]/);
        })
        .get();

      for (let i = remainingLetterTiles.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [remainingLetterTiles[i], remainingLetterTiles[j]] = [
          remainingLetterTiles[j],
          remainingLetterTiles[i],
        ];
      }

      // THE FIX: Calculate duration based on (letters - 1) seconds.
      // This ensures the timer and the letter reveals finish at the same time.
      tossUpDuration = (remainingLetterTiles.length - 1) * 1000;

      $("#message-label").text("Press SPACE to buzz in!");
      playNextTossupSong();
      tossUpStartTime = Date.now();
      startTossUpIntervals();
    }, 2000);
  }
  function buzzIn() {
    ding.play();
    gameState = "tossup_paused";
    $(".puzzle-board-border").removeClass("solving");

    $(".puzzle-board-border").addClass("buzzed");

    // We only need to clear the one unified timer now
    clearInterval(pointsUpdateInterval);
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
        $(".puzzle-board-border").addClass("solving");

        $(".puzzle-board-border").removeClass("buzzed");
      }
    });
  }

  /**
   * Hides the bottom solve bar and handles game-specific UI changes.
   */
  function hideSolveInput() {
    $(".puzzle-board-border").removeClass("buzzed");
    const solveBar = $("#bottom-solve-bar");
    solveBar.removeClass("visible");

    // After the slide-out animation finishes, re-apply the .hidden class

    // If in classic mode, fade the wheel back in
    if (gameMode === "classic") {
      $("#wheel, #ptr").fadeIn();
    } else {
      $(".puzzle-board-border").addClass("solving");
    }
  }

  /**
   * Shows the bottom solve bar and prepares it for the current game mode.
   * @param {function} callback The function to execute when the answer is submitted.
   */
  function showSolveInput(callback) {
    $(".puzzle-board-border").addClass("buzzed");
    const solveBar = $("#bottom-solve-bar");
    solveBar.addClass("visible");
    solveCallback = callback;

    $("#solve-bar-input").val("").focus();
    $("#solve-bar-title").text("Solve!");

    if (gameMode === "classic") {
      $("#solve-bar-points").hide();
      $("#wheel, #ptr").fadeOut();
    } else if (gameMode === "tossup") {
      $("#solve-bar-points").text(`For ${tossUpCurrentPoints} points!`).show();
      $(".puzzle-board-border").removeClass("solving");
    } else if (gameMode === "bonus") {
      $("#solve-bar-points").hide();
      $(".puzzle-board-border").removeClass("solving");
    }
  }

  // Handles closing the solve bar with the 'X' button
  $("#solve-bar-submit-btn").on("click", function () {
    const attempt = $("#solve-bar-input").val();
    hideSolveInput();
    if (solveCallback) {
      solveCallback(attempt);
      solveCallback = null;
    }
  });

  // Handles closing the solve bar with the 'X' button
  $("#solve-bar-close-btn").on("click", function () {
    hideSolveInput();

    if (gameMode === "tossup" && gameState === "tossup_paused") {
      resumeTossUpSequence();
    } else if (gameMode === "bonus" && gameState === "bonus_solving") {
      tensecond.stop();
      buzzer.play();
      $("#message-label").text(`Sorry, that's not correct!`);
      failBonusRound();
    }
  });

  /**
   * Handles the result of the bonus round solve attempt.
   * It's called when the player submits an answer or when the buzz-in timer runs out.
   * @param {string} attempt The player's submitted answer. An empty string signifies a loss.
   */
  /**
   * Handles the result of the bonus round solve attempt.
   * @param {string} attempt The player's submitted answer.
   */
  function handleBonusRoundSolve(attempt) {
    bonus.stop();
    bonus2.stop();
    // THE FIX: Corrected the variable name from bonusRoundtimerInterval to bonusRoundTimerInterval
    $(".puzzle-board-border").removeClass("solving");

    // Hide bonus round UI and show the main message bar
    $("#bonus-round-info").addClass("hidden");
    $(".game-info-and-controls").removeClass("hidden");

    // Normalize strings for comparison
    const solutionAlphaOnly = currentPuzzle.puzzle
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    const attemptAlphaOnly = attempt.toUpperCase().replace(/[^A-Z0-9]/g, "");

    // Check if the attempt is correct
    if (attemptAlphaOnly && attemptAlphaOnly === solutionAlphaOnly) {
      // WIN condition
      triggerBigSolveAnimation();
      $(".puzzle-board-border").addClass("solved-bonus");
      gameState = "game_over";
      if (gameMode == "bonus") {
        bonuswin.play();
      }
      tensecond.stop();

      $(".puzzle-board").addClass("solved");
      $("#message-label").text(
        `YOU WIN! The puzzle was: "${currentPuzzle.puzzle}"`
      );
      // Fully reveal the puzzle board
      $(".tile-container").each(function () {
        if ($(this).data("letter")) {
          revealLetter(this, $(this).data("letter"), false, false);
        }
      });
    } else {
      // LOSS condition
      tensecond.stop();
      buzzer.play();
      $("#message-label").text(`Sorry, that's not correct!`);
      failBonusRound();
    }

    // End the game
    setTimeout(() => {
      $("#message-label").text("Press SPACE to return to the menu.");
    }, 5000);
  }

  /**
   * Triggers the sequence for losing the bonus round.
   * This function is called on timeout or when the player closes the solve modal.
   */
  /**
   * Triggers the sequence for losing the bonus round.
   * This function is called on timeout or when the player closes the solve modal.
   */
  function failBonusRound() {
    // Stop the timer and the 10-second sound
    clearInterval(bonusTimerInterval);

    // Update game state and UI
    $(".puzzle-board-border").removeClass("solving");

    // After a brief pause, find and reveal all remaining letters
    setTimeout(() => {
      const missingTilesQueue = [];
      // Find all tiles that have a letter but haven't been revealed yet
      $(".tile-container").each(function () {
        const tile = $(this);
        if (tile.data("letter") && tile.find(".tile-letter").text() === "") {
          missingTilesQueue.push(tile);
        }
      });

      // Shuffle the tiles for a random reveal order
      for (let i = missingTilesQueue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [missingTilesQueue[i], missingTilesQueue[j]] = [
          missingTilesQueue[j],
          missingTilesQueue[i],
        ];
      }

      if (gameMode == "bonus") {
        bonuslose.play();
      }

      // This function reveals the missing letters one by one
      function revealNextMissing() {
        if (missingTilesQueue.length > 0) {
          const tileToReveal = missingTilesQueue.shift();
          // Reveal the letter with the animation, but no sound
          revealLetterWithAnimation(
            tileToReveal,
            tileToReveal.data("letter"),
            false
          );
          setTimeout(revealNextMissing, 1000); // Reveal the next letter after 700ms
        } else {
          gameState = "game_over";
          $("#message-label").text("Press SPACE to return to the menu.");
        }
      }

      revealNextMissing(); // Start the final reveal sequence
    }, 1500); // Wait 1.5 seconds after "Time's up!" before revealing
  }

  /**
   * Reveals one letter from the toss-up queue and checks if the round is over.
   */
  function tossupRevealLoop() {
    if (remainingLetterTiles.length > 0) {
      const tileToReveal = remainingLetterTiles.pop();
      revealLetter(tileToReveal, $(tileToReveal).data("letter"), false);
    }

    // End the round if no letters are left to reveal
    if (remainingLetterTiles.length === 0) {
      clearInterval(tossUpInterval);
      if (gameState === "tossup_revealing") {
        handleTossUpSolve(false, 0); // Handle the end of the round
      }
    }
  }

  function handleTossUpSolve(isCorrect, points) {
    clearInterval(tossUpInterval);
    clearInterval(pointsUpdateInterval); // Stop the regular point decay
    stopTossupMusic();

    if (isCorrect) {
      // Correct solve logic remains the same
      triggerSolveAnimation();
      tossupSolvedSound.play();
      $(".puzzle-board-border").addClass("solved");

      $(".puzzle-board").addClass("solved");
      totalTossUpPoints += points;
      tossUpRoundsPlayed++;
      const averagePoints = Math.round(totalTossUpPoints / tossUpRoundsPlayed);
      $("#avg-points").text(averagePoints);

      const solveTimeSeconds = (
        (tossUpPauseTime - tossUpStartTime) /
        1000
      ).toFixed(2);
      $("#message-label").text(
        `Solved in ${solveTimeSeconds}s! Press SPACE for next.`
      );
      $(".puzzle-board-border").removeClass("solving");
      gameState = "tossup_solved";
    } else {
      // --- FIX: Logic for when time runs out ---
      buzzer.play();

      // Animate the points smoothly from their last value down to 0
      $({ currentPoints: tossUpCurrentPoints }).animate(
        { currentPoints: 0 },
        {
          duration: 300, // A quick 300ms animation
          easing: "linear",
          step: function () {
            $("#tossup-points").text(Math.round(this.currentPoints));
          },
        }
      );

      tossUpRoundsPlayed++;
      const averagePoints =
        tossUpRoundsPlayed > 0
          ? Math.round(totalTossUpPoints / tossUpRoundsPlayed)
          : 0;
      $("#avg-points").text(averagePoints);
      $("#message-label").text(
        `You didn't solve in time! Press SPACE for next puzzle.`
      );
      $(".puzzle-board-border").removeClass("solving");
      gameState = "tossup_failed";
    }

    // Reveal the rest of the puzzle letters
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

    if (gameMode === "tossup" || gameMode === "bonus") {
      $("#wheel, #ptr, #player-score, #solve-btn-container").addClass("hidden");
      $("#tossup-points-display, #avg-points-display").removeClass("hidden");
      $(".game-info-and-controls").css("justify-content", "center");
      if (gameMode === "bonus") {
        $("#tossup-points-display, #avg-points-display").addClass("hidden");
      }
    } else {
      $("#tossup-points-display, #avg-points-display").addClass("hidden");
      $("#wheel, #ptr, #player-score, #solve-btn-container").removeClass(
        "hidden"
      );
      $(".game-info-and-controls").css("justify-content", "space-between");
    }
    setupNewGame();
  });

  $('input[name="gameMode"]').on("change", function () {
    if ($(this).val() === "tossup") {
      $("#classic-rules").hide();
      $("#bonus-rules").hide();

      $("#tossup-rules").show();
    }
    if ($(this).val() === "classic") {
      $("#classic-rules").show();
      $("#bonus-rules").hide();
      $("#tossup-rules").hide();
    }
    if ($(this).val() === "bonus") {
      $("#classic-rules").hide();
      $("#bonus-rules").show();
      $("#tossup-rules").hide();
    }
  });

  $(window).on("keydown", function (e) {
    if (e.ctrlKey && e.key.toLowerCase() === "r") {
      return;
    }
    if ($("#bottom-solve-bar").hasClass("visible")) {
      if (e.key === "Enter") {
        $("#solve-bar-submit-btn").click();
      } else if (e.key === "Escape") {
        $("#solve-bar-close-btn").click();
      }
      return; // Stop processing other keys
    }

    // This is your main window event listener for keyboard input
    // ... other keydown logic for different game states

    // Add this new case for the bonus round
    if (gameState === "bonus_picking_letters") {
      const letter = e.key.toUpperCase();
      handleBonusPick(letter);
    }

    // ... other keydown logic

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
        // This is your main window event listener for keyboard input
        console.log("test");
        console.log(gameState);

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
        if (gameState === "game_over") {
          resetGame();
        }
        if (gameState === "bonus_waiting_for_buzz") {
          // Stop the timer and sound
          clearInterval(bonusTimerInterval);

          // Prevent further buzzing and open the solve puzzle modal
          gameState = "bonus_solving";
          showSolveInput(handleBonusRoundSolve); // Assuming these functions exist
        }
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
    Promise.all([
      fetch("assets/puzzles.json"),
      fetch("assets/bonus_puzzles.json"), // Fetch the new file
    ])
      .then((responses) => Promise.all(responses.map((res) => res.json())))
      .then(([mainPuzzlesData, bonusPuzzlesData]) => {
        allPuzzles = mainPuzzlesData;
        bonusPuzzles = bonusPuzzlesData; // Store the bonus puzzles in the new variable

        // Start the game now that both are loaded
        // Start the game now that both are loaded
        $("#intro-modal")
          .css("opacity", "1")
          .css("transform", "translate(-50%, -50%) scale(1)");
      })
      .catch((error) => {
        console.error("Could not load one or more puzzle banks:", error);
        $("#message-label").text("Error: Could not load puzzles.");
      });
  }

  fetchPuzzles();
});

setRandomWallpaper();

function setRandomWallpaper() {
  const wallpaperCount = 17;
  const randomWallpaperNumber = Math.floor(Math.random() * wallpaperCount) + 1;
  const wallpaperUrl = `url('wallpapers/${randomWallpaperNumber}-min.png')`;
  $("#wallpaper").css("background-image", wallpaperUrl);
}
