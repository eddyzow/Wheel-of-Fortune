$(function () {
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
    "SPECIAL_WEDGE",
    700,
    500,
    650,
    600,
    700,
    600,
    "WILD CARD",
  ];
  const ding = new Howl({ src: ["ding.mp3"], volume: 1.0 });
  const spin = new Howl({ src: ["spin.mp3"], volume: 1.0 });
  const reveal = new Howl({ src: ["reveal.mp3"], volume: 1.0 });
  const buzzer = new Howl({ src: ["buzzer.mp3"], volume: 1.0 });
  const solved = new Howl({ src: ["solved.mp3"], volume: 1.0 });
  const bankrupt = new Howl({ src: ["bankrupt.mp3"], volume: 1.0 });
  const VOWELS = ["A", "E", "I", "O", "U"];
  const VOWEL_COST = 250;

  let allPuzzles = [];
  let currentPuzzle = {};
  let guessable = 0;
  let free = 1;
  let currentRotation = 0;
  let usedLetters = [];
  let playerScore = 0;
  let currentSpinValue = 0;
  let gameState = "playing";
  let isFreePlay = false;

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

  function setupNewGame() {
    usedLetters = [];
    currentRotation = 0;
    gameState = "playing";
    free = 1;
    guessable = 0;
    isFreePlay = false;
    updateScore(0);

    $("#wheel").css("--rotation-angle", `0deg`);
    setReadyMessage();
    $("#solve-btn").prop("disabled", false);

    currentPuzzle = allPuzzles[Math.floor(Math.random() * allPuzzles.length)];
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

    $(".tile-container").each(function () {
      const letterSpan = $(this).find(".tile-letter");
      letterSpan.removeAttr("style");
      letterSpan.text("");
      $(this).data("letter", "");
      $(this).removeClass("revealed unrevealed");
    });

    $("#category-label").text(currentPuzzle.category);
    let globalLetterIndex = 0;
    reveal.play();

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
            setTimeout(() => revealBlank(tile), delay);
            globalLetterIndex++;
          }
        }
        currentCol++;
      });
    });
    updateUIForNewTurn();
  }

  function updateScore(newAmount) {
    playerScore = newAmount;
    $("#score-amount").text(playerScore);
    updateUIForNewTurn();
  }

  function updateUIForNewTurn() {
    const canAffordVowel = playerScore >= VOWEL_COST;
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

  function revealLetter(tileContainer, letter) {
    const letterSpan = $(tileContainer).find(".tile-letter");
    $(tileContainer).removeClass("revealed").addClass("unrevealed");
    ding.play();
    setTimeout(() => {
      letterSpan
        .css({ "background-color": "white", color: "black" })
        .text(letter.toUpperCase());
    }, 1600);
  }

  function guessLetter(letter, isVowelPurchase = false) {
    if (usedLetters.includes(letter)) {
      if (isFreePlay) {
        $("#message-label").text(
          `'${letter}' was already used. Your Free Play continues!`
        );
        guessable = 1;
        return;
      } else {
        $("#message-label").text(
          `'${letter}' has already been used. Make your move.`
        );
        free = 1;
        guessable = 0;
        updateUIForNewTurn();
        return;
      }
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
    } else {
      buzzer.play();
      if (wasFreePlay) {
        $("#message-label").text(
          `Sorry, no '${letter}'s. Your turn continues.`
        );
        setTimeout(setReadyMessage, 2000);
      } else {
        $("#message-label").text(`Sorry, no '${letter}'s. Spin again.`);
        setTimeout(setReadyMessage, 2000);
      }
    }

    $.each(matchingTiles, (i, item) => {
      setTimeout(() => revealLetter(item.tile, item.letter), i * 1000);
    });

    free = 1;
    updateUIForNewTurn();
  }

  function solvePuzzle() {
    if (free === 0 && guessable === 0) return;
    const attempt = prompt("Solve the puzzle:");
    if (attempt === null) return;

    const solution = currentPuzzle.puzzle.toUpperCase().replace(/[^A-Z]/g, "");
    const playerAttempt = attempt.toUpperCase().replace(/[^A-Z]/g, "");

    if (playerAttempt === solution) {
      solved.play();
      $("#message-label").text(
        `You solved it! It was: "${currentPuzzle.puzzle}"`
      );
      $(".tile-container").each(function () {
        if ($(this).data("letter") && !$(this).hasClass("unrevealed")) {
          revealLetter(this, $(this).data("letter"));
        }
      });
      free = 0;
      guessable = 0;
      gameState = "round_over";
      $("#solve-btn").prop("disabled", true);
      setTimeout(
        () => $("#message-label").text("Press Space to start the next round!"),
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
  }

  $("#solve-btn").on("click", solvePuzzle);

  $(window).on("keydown", function (e) {
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
            "Vowels must be purchased. Please guess a consonant."
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
        free = 0;
        guessable = 0;
        updateUIForNewTurn();

        let targetDegree, landedResult;
        let randomSpot = Math.floor(Math.random() * 24);

        if (randomSpot === 16) {
          const microRoll = Math.random();
          const centerAngle = 16 * 15;
          if (microRoll < 1 / 3) {
            landedResult = "BANKRUPT";
            targetDegree = centerAngle - 5;
          } else if (microRoll < 2 / 3) {
            landedResult = "MILLION";
            targetDegree = centerAngle;
          } else {
            landedResult = "BANKRUPT";
            targetDegree = centerAngle + 5;
          }
        } else {
          landedResult = wedges[randomSpot];
          targetDegree = randomSpot * 15;
        }

        const currentAngle = currentRotation % 360;
        const rotationDelta = (targetDegree - currentAngle + 360) % 360;
        currentRotation += 3 * 360 + rotationDelta;

        spin.play();
        $("#wheel").css("--rotation-angle", `${currentRotation}deg`);

        setTimeout(() => {
          currentSpinValue = 0;
          switch (landedResult) {
            case "BANKRUPT":
            case "LOSE A TURN":
              $("#message-label").text(`${landedResult}! Next player spins.`);
              if (landedResult === "BANKRUPT") {
                bankrupt.play();
                updateScore(0);
              }
              free = 1;
              break;
            case "FREE PLAY":
              $("#message-label").text("FREE PLAY! Guess any letter for free.");
              isFreePlay = true;
              currentSpinValue = 500;
              guessable = 1;
              break;
            case "MILLION":
              $("#message-label").text(
                "MILLION DOLLAR WEDGE! Pick a consonant."
              );
              guessable = 1;
              break;
            case "WILD CARD":
              currentSpinValue = 500;
              $("#message-label").text(
                `$500 and a Wild Card! Pick a consonant.`
              );
              guessable = 1;
              break;
            default:
              currentSpinValue = landedResult;
              $("#message-label").text(`$${landedResult}. Pick a consonant.`);
              guessable = 1;
              break;
          }
          updateUIForNewTurn();
        }, 6000);
      }
    }
  });

  fetch("puzzles.json")
    .then((response) => response.json())
    .then((data) => {
      allPuzzles = data;
      setupNewGame();
    })
    .catch((error) => {
      console.error("Could not load puzzles:", error);
      $("#message-label").text(
        "Error: Could not load puzzles from puzzles.json"
      );
    });
});
