import { useReducer, useCallback } from 'react';
import { CARD_DECK } from './cards.js';

function weightedDraw(deck) {
  const total = deck.reduce((s, c) => s + c.weight, 0);
  let r = Math.random() * total;
  for (const card of deck) {
    r -= card.weight;
    if (r <= 0) return card;
  }
  return deck[deck.length - 1];
}

const initialState = { currentCard: null, usesRemaining: 0, history: [] };

function deckReducer(state, action) {
  switch (action.type) {
    case 'DRAW': {
      if (state.currentCard) return state;
      const card = weightedDraw(CARD_DECK);
      return { ...state, currentCard: card, usesRemaining: card.maxUses };
    }
    case 'USE': {
      if (!state.currentCard || state.usesRemaining <= 0) return state;
      return { ...state, usesRemaining: state.usesRemaining - 1 };
    }
    case 'END_TURN': {
      if (!state.currentCard) return state;
      return {
        currentCard: null,
        usesRemaining: 0,
        history: [...state.history.slice(-9), state.currentCard],
      };
    }
    default:
      return state;
  }
}

export function useCardDeck() {
  const [state, dispatch] = useReducer(deckReducer, initialState);

  const drawCard  = useCallback(() => dispatch({ type: 'DRAW' }), []);
  const useAction = useCallback(() => dispatch({ type: 'USE' }), []);
  const endTurn   = useCallback(() => dispatch({ type: 'END_TURN' }), []);

  return {
    currentCard:  state.currentCard,
    usesRemaining: state.usesRemaining,
    history:      state.history,
    drawCard,
    useAction,
    endTurn,
    hasCard:     state.currentCard !== null,
    isExhausted: state.currentCard !== null && state.usesRemaining <= 0,
  };
}
