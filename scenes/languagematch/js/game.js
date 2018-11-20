goog.provide('app.Game');

goog.require('app.Constants');
goog.require('Card');

/**
 * Runs the language matching card game.
 * @export
 */
app.Game = class Game {

  /**
   * @param {!HTMLElement} elem Root element of the game (not necessarily of the window).
   */
  constructor(elem) {
    console.info(`Language game starting`);

    this.root = elem.getRootNode();

    // Level information
    /** @private {!Array<!Card>} */
    this.cards = [];

    // Game state
    /** @private {!Array<!Card>} */
    this.flippedCards = [];
    /** @private {boolean} Whether all the cards have been matched or not. */
    this.levelWon = false;

    this.init();
  }

  /**
   * @private
   */
  init() {
    // TODO(jez): Dynamically pick the number of cards to use.
    this.createCards(8);
    this.initCards();
    this.initFlipAnimations();
  }

  /**
   * Sets up the underlying data for this game.
   * @private
   */
  initCards() {
    const cardElements = this.root.querySelectorAll('.card');
    if ((cardElements.length) % 2 != 0) {
      throw Error('Invalid number of cards!');
    }

    const translations = Object.entries(app.Constants.PHRASES[0]);
    const colors = app.Constants.COLORS.slice();

    const cards = [];
    for (let i = 0; i < cardElements.length / 2; i ++) {
      const color = removeRandom(colors);
      const translation = removeRandom(translations);
      const languageCode = translation[0];
      // TODO(jez): Make sure this doesn't clash with an existing language.
      const message = translation[1];
      const languageName = this.getLanguageName(languageCode);

      const languageCard = new Card();
      languageCard.languageCode = languageCode;
      languageCard.content = message;
      languageCard.contentLanguage = languageCode;
      languageCard.color = color;
      cards.push(languageCard);

      const translationCard = new Card();
      translationCard.languageCode = languageCode;
      translationCard.content = languageName;
      // This is in the user's language.
      // TODO(jez): Make this not just English.
      translationCard.contentLanguage = 'en';
      translationCard.color = color;
      cards.push(translationCard);
    }

    const shuffledCards = [];
    while (cards.length > 0) {
      shuffledCards.push(removeRandom(cards));
    }

    this.cards = shuffledCards;
  }

  /**
   * Adds card elements to the page.
   * @private
   * @param {Number} numCards Number of cards to add.
   */
  createCards(numCards) {
    const cards = this.root.querySelector('.cards');

    for (let i = 0; i < numCards; i ++) {
      const card = document.createElement('div');
      card.classList.add('card');
      cards.appendChild(card);

      const cardFront = document.createElement('div');
      cardFront.classList.add('card-front');
      card.appendChild(cardFront);

      const cardContents = document.createElement('div');
      cardContents.classList.add('card-contents');
      cardFront.appendChild(cardContents);

      const cardBack = document.createElement('div');
      cardBack.classList.add('card-back');
      card.appendChild(cardBack);
    }
  }

  /**
   * @private
   */
  initFlipAnimations() {
    const cardElements = this.root.querySelectorAll('.card');
    for (const cardElement of cardElements) {
      cardElement.addEventListener('click', () => this.selectCard(cardElement));
    }
  }

  /**
   * Selects a card and checks if it matches.
   * @param {!HTMLElement} cardElement Card selected
   */
  async selectCard(cardElement) {
    if (this.flippedCards.length >= 2) {
      // Too many cards flipped already.
      return;
    }
    if (this.levelWon) {
      // The game has been won and we're in the process of resetting.
      return;
    }

    // Get the data associated with this card.
    const cardIndex = getPositionInParent(cardElement);
    const card = this.cards[cardIndex];

    if (card.flipped) {
      // Card is already flipped.
      return;
    }

    this.setCardContent(cardElement, card);

    cardElement.classList.add('flipped');
    card.flipped = true;

    this.flippedCards.push(card);
    this.playSound(card.content, card.contentLanguage);

    if (this.flippedCards.length < 2) {
     // Not enough flipped cards, lets check for a match.
     return;
    }

    // Wait for the flip animation
    await this.waitForTransition(cardElement);

    // Check if the cards are a match.
    if (this.flippedCards[0].languageCode != this.flippedCards[1].languageCode) {
      // Not a match. Reset guess.

      // Pause for a bit so someone has time to process
      await this.waitForSeconds(0.5);
      await this.resetGuesses();
      return;
    }

    // Mark cards as matched.
    this.flippedCards.forEach(card => card.matched = true);
    // Clear the flipped cards so we can guess again.
    this.flippedCards = [];

    if (!this.cards.every(card => card.matched)) {
      // Still more cards to be matched
      return;
    }

    // They've won!
    this.levelWon = true;

    // TODO(jez): Use the common santa tracker level transition.

    // Pause for a bit so someone has time to process
    await this.waitForSeconds(0.5);
    this.cards.forEach(card => card.matched = false);
    await this.resetGuesses();

    // Switch to a new set of cards.
    this.initCards();
    // Allow the user to guess again.
    this.levelWon = false;
  }

  /**
   * Flips all unmatching cards to be facing down again.
   * @private
   */
  async resetGuesses() {
    const cardElements = this.root.querySelectorAll('.card');

    let animatingCard = null;

    for (let i = 0; i < this.cards.length; i ++) {
      const card = this.cards[i];
      const cardElement = cardElements[i];

      if (card.matched) { // Leave the matched cards as is.
        continue;
      }

      card.flipped = false;
      cardElement.classList.remove('flipped');

      // Save an arbitrary card so we can use it to wait for the animation to end.
      animatingCard = cardElement;
    }
    this.flippedCards = [];

    if (animatingCard === null) {
      return;
    }

    await this.waitForTransition(animatingCard);
    this.clearHiddenCardContents();
  }

  /**
   * Clears the content of all face-down cards
   * @private
   */
  clearHiddenCardContents() {
    const cardElements = this.root.querySelectorAll('.card');
    for (let i = 0; i < this.cards.length; i ++) {
      const card = this.cards[i];
      const cardElement = cardElements[i];

      if (!card.flipped) {
        this.clearCardContent(cardElement);
      }
    }
  }

  /**
   * Sets up the color and contents of a card element to match the underlying card object.
   * @private
   * @param {!HTMLElement} cardElement Card HTML element.
   * @param {Card} card Underlying card object.
   */
  setCardContent(cardElement, card) {
    this.setCardColor(cardElement, card.color);
    this.setCardText(cardElement, card.content);
  }

  /**
   * Clears the style of a card element (so you can't cheat by looking at the HTML to see what it is).
   * @private
   * @param {!HTMLElement} cardElement Card HTML element.
   */
  clearCardContent(cardElement) {
    this.setCardColor(cardElement, 'white');
    this.setCardText(cardElement, '');
  }

  /**
   * Sets the content of a card.
   * @private
   * @param {!HTMLElement} cardElement
   * @param {string} text Text to display on the card.
   */
  setCardText(cardElement, text) {
    const contents = cardElement.querySelector('.card-contents');
    contents.textContent = text;
  }
  
  /**
   * Sets the face color of a card.
   * @private
   * @param {!HTMLElement} cardElement
   * @param {string} color CSS color for the card background.
   */
  setCardColor(cardElement, color) {
    const front = cardElement.querySelector('.card-front');
    front.style.backgroundColor = color;
  }
  
  /**
   * Gets a language name in the user's local language.
   *
   * Implicitely relies on the inbuilt translation that happens for the page contents.
   * @private
   * @param {string} code Language code of the language to get the name of (not the user's language).
   * @returns {string} Language name in user's language (e.g. 'Spanish' for 'es' if the user's language is 'en').
   */
  getLanguageName(code) {
    const id = code + '_language_name';
    return this.root.getElementById(id).textContent;
  }

  /**
   * @private
   * @param {string} text Text to play back
   * @param {?string} languageCode ISO language code
   */
  playSound(text, languageCode) {
    languageCode = languageCode || 'en';
    var url = app.Constants.TTS_DOMAIN + app.Constants.TTS_QUERY;
    url = window.encodeURI(url.replace('{TL}', languageCode).replace('{Q}', text));

    this.audio = new Audio(url);
    this.audio.play();
  }

  /**
   * Waits for a CSS transition to finish
   * @param {!HTMLElement} element Element currently transitioning
   */
  async waitForTransition(element) {
    await new Promise(r => element.addEventListener('transitionend', r));
  }

  /**
   * Waits for a set amount of time
   * @param {number} seconds Number of seconds to wait for
   */
  async waitForSeconds(seconds) {
    await new Promise(r => setTimeout(r, seconds * 1000));
  }

};

// TODO(jez): Replace this with better random function?
/**
 * Picks a random integer between 0 (inclusive) and max (exclusive).
 * @param {number} max Exclusive maximum.
 */
function randomInteger(max) {
  return Math.floor(max * Math.random());
}

/**
 * Removes a random element from an array.
 * 
 * @param {!Array<T>} arr Array to take from.
 * @returns {T} Element removed from array.
 * @template T
 */
function removeRandom(arr) {
  return arr.splice(randomInteger(arr.length), 1)[0];
}

/**
 * @param {!HTMLElement} elem Element to find the position in the parent of.
 * @returns {number} The index of this element in it's parent.
 */
function getPositionInParent(elem) {
  const siblings = Array.from(elem.parentNode.children);
  return siblings.indexOf(elem);
}
