function revealLetter(tileContainer, letter) {
  tileContainer.classList.add("revealed");
  const letterSpan = tileContainer.querySelector(".tile-letter");
  letterSpan.textContent = letter.toUpperCase();
}

window.addEventListener("DOMContentLoaded", () => {
  const tiles = document.querySelectorAll(".tile-container");

  revealLetter(tiles[15], "W");
  revealLetter(tiles[16], "H");
  revealLetter(tiles[17], "E");
  revealLetter(tiles[18], "E");
  revealLetter(tiles[19], "L");
  revealLetter(tiles[21], "O");
  revealLetter(tiles[22], "F");
  revealLetter(tiles[29], "F");
  revealLetter(tiles[30], "O");
  revealLetter(tiles[31], "R");
  revealLetter(tiles[32], "T");
  revealLetter(tiles[33], "U");
  revealLetter(tiles[34], "N");
  revealLetter(tiles[35], "E");
});

function markUnrevealed(tileContainer) {
  tileContainer.classList.add("unrevealed");
  tileContainer.classList.remove("revealed");

  const letterSpan = tileContainer.querySelector(".tile-letter");
  letterSpan.textContent = "";
}

function revealLetter(tileContainer, letter) {
  tileContainer.classList.add("revealed");
  tileContainer.classList.remove("unrevealed");

  const letterSpan = tileContainer.querySelector(".tile-letter");
  letterSpan.textContent = letter.toUpperCase();
}
